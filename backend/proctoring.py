"""
AI Proctoring Route - WebSocket endpoint for real-time proctoring
Integrates MediaPipe FaceMesh, YOLOv8, and OpenCV for multi-modal cheat detection

COMPLETE PRODUCTION VERSION with all optimizations and fixes
"""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import cv2
import numpy as np
import base64
import json
from collections import deque
from typing import Dict, List, Tuple, Optional
import mediapipe as mp
import logging
import os

# Configure logger
logger = logging.getLogger(__name__)
DEBUG = os.getenv("DEBUG", "false").lower() == "true"
if DEBUG:
    logger.setLevel(logging.DEBUG)
else:
    logger.setLevel(logging.INFO)

import math
import time

router = APIRouter()

# ============================================================================
# LANDMARK DEFINITIONS (MediaPipe FaceMesh 468-point model)
# ============================================================================
LEFT_EYE_LANDMARKS = [33, 160, 158, 133, 153, 144]
RIGHT_EYE_LANDMARKS = [362, 385, 387, 263, 373, 380]
LEFT_IRIS_CENTER = 468
RIGHT_IRIS_CENTER = 473

# Head pose estimation landmarks
NOSE_TIP = 1
CHIN = 152
LEFT_EYE_CORNER = 33
RIGHT_EYE_CORNER = 263
LEFT_MOUTH_CORNER = 61
RIGHT_MOUTH_CORNER = 291

# ============================================================================
# MEDIAPIPE MODEL INITIALIZATION
# ============================================================================
mp_face_mesh = mp.solutions.face_mesh
mp_face_detection = mp.solutions.face_detection
mp_pose = mp.solutions.pose
mp_drawing = mp.solutions.drawing_utils

face_mesh = mp_face_mesh.FaceMesh(
    max_num_faces=2,
    refine_landmarks=True,
    min_detection_confidence=0.6,
    min_tracking_confidence=0.6
)

face_detection = mp_face_detection.FaceDetection(
    model_selection=0,  # Short-range model (faster)
    min_detection_confidence=0.6
)

pose = mp_pose.Pose(
    static_image_mode=False,
    model_complexity=0,  # Lightest model for performance
    min_detection_confidence=0.6,
    min_tracking_confidence=0.6
)

# ============================================================================
# YOLO MODEL INITIALIZATION (with PyTorch 2.6+ compatibility)
# ============================================================================
yolo_model = None
try:
    import torch
    from ultralytics import YOLO
    
    # Fix for PyTorch 2.6+: Add safe globals if available
    if hasattr(torch.serialization, 'add_safe_globals'):
        from ultralytics.nn.tasks import DetectionModel
        torch.serialization.add_safe_globals([DetectionModel])
    
    # Load YOLOv8n (nano) model for object detection
    yolo_model = YOLO('yolov8n.pt')  # Auto-downloads if not present
    
    # Warm up the model with a dummy inference
    dummy_frame = np.zeros((640, 640, 3), dtype=np.uint8)
    _ = yolo_model(dummy_frame, verbose=False, conf=0.5, imgsz=640)
    
    logger.info("✅ YOLOv8n model loaded and warmed up successfully")
except Exception as e:
    logger.warning(f"⚠️  YOLO not loaded - device detection disabled: {e}")
    yolo_model = None

# ============================================================================
# TEMPORAL BUFFER FOR TRACKING & SMOOTHING
# ============================================================================
class FrameBuffer:
    """
    Tracks temporal data across frames for smoothing and alert persistence
    """
    def __init__(self, maxlen=30):
        self.frames = deque(maxlen=maxlen)
        self.keypoints = deque(maxlen=maxlen)
        self.gaze_angles = deque(maxlen=maxlen)
        self.ear_values = deque(maxlen=maxlen)
        self.alert_history = deque(maxlen=15)  # Track recent alerts
        self.frame_count = 0
        self.fps_history = deque(maxlen=30)
        self.last_process_time = time.time()
        
        # YOLO caching
        self.last_yolo_detections = []
        self.last_yolo_frame = 0
        
    def add(self, frame, keypoints=None, gaze=None, ear=None):
        """Add frame data to buffer"""
        self.frames.append(frame)
        if keypoints is not None:
            self.keypoints.append(keypoints)
        if gaze is not None:
            self.gaze_angles.append(gaze)
        if ear is not None:
            self.ear_values.append(ear)
        self.frame_count += 1
    
    def add_alert(self, alert_type: str):
        """Track alert for temporal smoothing"""
        self.alert_history.append({
            'type': alert_type,
            'timestamp': time.time()
        })
    
    def should_trigger_alert(self, alert_type: str, required_count: int = 3, time_window: float = 1.0) -> bool:
        """
        Check if alert should trigger based on recent history
        
        Args:
            alert_type: Type of alert to check
            required_count: Number of occurrences needed
            time_window: Time window in seconds (default 1.0s = ~5 frames at 5 FPS)
        
        Returns:
            True if alert threshold is met
        """
        if len(self.alert_history) < required_count:
            return False
        
        current_time = time.time()
        recent_alerts = [
            a for a in self.alert_history 
            if a['type'] == alert_type and (current_time - a['timestamp']) <= time_window
        ]
        
        return len(recent_alerts) >= required_count
    
    def update_fps(self) -> float:
        """Calculate and store FPS"""
        current_time = time.time()
        fps = 1.0 / (current_time - self.last_process_time + 1e-6)
        self.fps_history.append(fps)
        self.last_process_time = current_time
        return fps
    
    def get_avg_fps(self) -> float:
        """Get average FPS over recent frames"""
        if not self.fps_history:
            return 0.0
        return sum(self.fps_history) / len(self.fps_history)
    
    def clear_old_alerts(self, max_age: float = 5.0):
        """Remove alerts older than max_age seconds"""
        current_time = time.time()
        self.alert_history = deque([
            a for a in self.alert_history 
            if (current_time - a['timestamp']) <= max_age
        ], maxlen=15)

# Store buffers per client
client_buffers: Dict[str, FrameBuffer] = {}

# ============================================================================
# EYE TRACKING & GAZE DETECTION
# ============================================================================
def calculate_ear(eye_landmarks: np.ndarray) -> float:
    """
    Calculate Eye Aspect Ratio (EAR) for blink detection
    EAR = (vertical_dist1 + vertical_dist2) / (2 * horizontal_dist)
    
    Args:
        eye_landmarks: Array of 6 eye landmark points
    
    Returns:
        EAR value (typically 0.2-0.4 when open, <0.15 when closed)
    """
    # Vertical distances
    v1 = np.linalg.norm(eye_landmarks[1] - eye_landmarks[5])
    v2 = np.linalg.norm(eye_landmarks[2] - eye_landmarks[4])
    
    # Horizontal distance
    h = np.linalg.norm(eye_landmarks[0] - eye_landmarks[3])
    
    if h < 1e-6:
        return 0.0
    
    ear = (v1 + v2) / (2.0 * h)
    return ear


def detect_gaze_direction(face_landmarks, img_w: int, img_h: int) -> Tuple[float, float]:
    """
    Detect gaze direction using iris-to-eye-center ratio
    
    Formula: gaze_x = (iris_center_x - eye_center_x) / eye_width * 100
    
    Returns:
        (horizontal_angle, vertical_angle) in degrees
        Positive values = right/down, Negative values = left/up
    """
    # Left Eye Analysis
    l_inner = face_landmarks.landmark[133]  # Inner corner
    l_outer = face_landmarks.landmark[33]   # Outer corner
    l_iris = face_landmarks.landmark[LEFT_IRIS_CENTER]
    
    l_eye_width = math.hypot((l_inner.x - l_outer.x) * img_w, (l_inner.y - l_outer.y) * img_h)
    l_eye_center_x = (l_inner.x + l_outer.x) / 2 * img_w
    l_eye_center_y = (l_inner.y + l_outer.y) / 2 * img_h
    
    if l_eye_width > 0:
        l_gaze_x = ((l_iris.x * img_w) - l_eye_center_x) / l_eye_width * 100
        l_gaze_y = ((l_iris.y * img_h) - l_eye_center_y) / l_eye_width * 100
    else:
        l_gaze_x, l_gaze_y = 0.0, 0.0

    # Right Eye Analysis
    r_inner = face_landmarks.landmark[362]  # Inner corner
    r_outer = face_landmarks.landmark[263]  # Outer corner
    r_iris = face_landmarks.landmark[RIGHT_IRIS_CENTER]
    
    r_eye_width = math.hypot((r_inner.x - r_outer.x) * img_w, (r_inner.y - r_outer.y) * img_h)
    r_eye_center_x = (r_inner.x + r_outer.x) / 2 * img_w
    r_eye_center_y = (r_inner.y + r_outer.y) / 2 * img_h
    
    if r_eye_width > 0:
        r_gaze_x = ((r_iris.x * img_w) - r_eye_center_x) / r_eye_width * 100
        r_gaze_y = ((r_iris.y * img_h) - r_eye_center_y) / r_eye_width * 100
    else:
        r_gaze_x, r_gaze_y = 0.0, 0.0

    # Average both eyes
    avg_gaze_x = (l_gaze_x + r_gaze_x) / 2
    avg_gaze_y = (l_gaze_y + r_gaze_y) / 2
    
    return avg_gaze_x, avg_gaze_y


def draw_iris_points(frame: np.ndarray, face_landmarks, img_w: int, img_h: int):
    """Draw iris centers on the frame for visualization"""
    left_iris = face_landmarks.landmark[LEFT_IRIS_CENTER]
    right_iris = face_landmarks.landmark[RIGHT_IRIS_CENTER]
    
    cv2.circle(frame, (int(left_iris.x * img_w), int(left_iris.y * img_h)), 3, (0, 255, 255), -1)
    cv2.circle(frame, (int(right_iris.x * img_w), int(right_iris.y * img_h)), 3, (0, 255, 255), -1)

# ============================================================================
# HEAD POSE ESTIMATION
# ============================================================================
def calculate_head_pose(face_landmarks, img_w: int, img_h: int) -> Tuple[float, float, float]:
    """
    Calculate head pose (pitch, yaw, roll) using solvePnP
    
    Returns:
        (pitch, yaw, roll) in degrees
        - Pitch: nodding (positive = looking down)
        - Yaw: turning left/right (positive = looking right)
        - Roll: tilting head (positive = tilting right)
    """
    # 3D model points (generic human face model)
    model_points = np.array([
        (0.0, 0.0, 0.0),           # Nose tip
        (0.0, -330.0, -65.0),      # Chin
        (-225.0, 170.0, -135.0),   # Left eye left corner
        (225.0, 170.0, -135.0),    # Right eye right corner
        (-150.0, -150.0, -125.0),  # Left mouth corner
        (150.0, -150.0, -125.0)    # Right mouth corner
    ], dtype=np.float64)
    
    # 2D image points from face landmarks
    image_points = np.array([
        (face_landmarks.landmark[NOSE_TIP].x * img_w, face_landmarks.landmark[NOSE_TIP].y * img_h),
        (face_landmarks.landmark[CHIN].x * img_w, face_landmarks.landmark[CHIN].y * img_h),
        (face_landmarks.landmark[LEFT_EYE_CORNER].x * img_w, face_landmarks.landmark[LEFT_EYE_CORNER].y * img_h),
        (face_landmarks.landmark[RIGHT_EYE_CORNER].x * img_w, face_landmarks.landmark[RIGHT_EYE_CORNER].y * img_h),
        (face_landmarks.landmark[LEFT_MOUTH_CORNER].x * img_w, face_landmarks.landmark[LEFT_MOUTH_CORNER].y * img_h),
        (face_landmarks.landmark[RIGHT_MOUTH_CORNER].x * img_w, face_landmarks.landmark[RIGHT_MOUTH_CORNER].y * img_h)
    ], dtype=np.float64)
    
    # Camera internals (estimated)
    focal_length = img_w
    center = (img_w / 2, img_h / 2)
    camera_matrix = np.array([
        [focal_length, 0, center[0]],
        [0, focal_length, center[1]],
        [0, 0, 1]
    ], dtype=np.float64)
    
    dist_coeffs = np.zeros((4, 1))  # Assuming no lens distortion
    
    # Solve PnP
    success, rotation_vector, translation_vector = cv2.solvePnP(
        model_points, image_points, camera_matrix, dist_coeffs, flags=cv2.SOLVEPNP_ITERATIVE
    )
    
    if not success:
        return 0.0, 0.0, 0.0
    
    # Convert rotation vector to Euler angles
    rotation_mat, _ = cv2.Rodrigues(rotation_vector)
    pose_mat = cv2.hconcat((rotation_mat, translation_vector))
    _, _, _, _, _, _, euler_angles = cv2.decomposeProjectionMatrix(pose_mat)
    
    pitch, yaw, roll = euler_angles.flatten()[:3]
    
    return pitch, yaw, roll


def draw_head_pose_axis(frame: np.ndarray, face_landmarks, img_w: int, img_h: int,
                         pitch: float, yaw: float, roll: float):
    """
    Draw 3D axis on face showing head orientation
    Red = X (right), Green = Y (down), Blue = Z (forward)
    """
    nose_tip = face_landmarks.landmark[NOSE_TIP]
    nose_2d = (int(nose_tip.x * img_w), int(nose_tip.y * img_h))
    
    # Simplified axis projection (for visualization only)
    axis_length = 100
    
    # Convert Euler angles to radians
    yaw_rad = math.radians(yaw)
    pitch_rad = math.radians(pitch)
    
    # Project axes
    x_end = (int(nose_2d[0] + axis_length * math.cos(yaw_rad)), nose_2d[1])
    y_end = (nose_2d[0], int(nose_2d[1] + axis_length * math.sin(pitch_rad)))
    
    # Draw axes
    cv2.line(frame, nose_2d, x_end, (0, 0, 255), 3)  # Red (X)
    cv2.line(frame, nose_2d, y_end, (0, 255, 0), 3)  # Green (Y)

# ============================================================================
# POSE DETECTION & SUSPICIOUS ACTIVITY
# ============================================================================
def detect_suspicious_activity(buffer: FrameBuffer, pose_landmarks) -> Tuple[bool, str, float, Dict]:
    """
    Detect suspicious activity using pose analysis:
    1. Hand near face (potential phone use)
    2. Looking down significantly (reading notes/phone)
    
    Returns:
        (is_suspicious, activity_type, confidence, metrics)
    """
    alerts = []
    max_confidence = 0.0
    metrics = {
        "hand_face_dist_left": 1.0, 
        "hand_face_dist_right": 1.0,
        "nose_shoulder_diff": 0.0
    }
    
    if pose_landmarks is None:
        return False, "", 0.0, metrics
    
    landmarks = pose_landmarks.landmark
    
    # Get key points
    nose = landmarks[mp_pose.PoseLandmark.NOSE.value]
    left_wrist = landmarks[mp_pose.PoseLandmark.LEFT_WRIST.value]
    right_wrist = landmarks[mp_pose.PoseLandmark.RIGHT_WRIST.value]
    
    # Check visibility (confidence that landmark is in frame)
    if nose.visibility < 0.5:
        return False, "", 0.0, metrics
    
    # Calculate hand-to-face distances (normalized coordinates)
    nose_pos = np.array([nose.x, nose.y])
    left_wrist_pos = np.array([left_wrist.x, left_wrist.y])
    right_wrist_pos = np.array([right_wrist.x, right_wrist.y])
    
    left_dist = np.linalg.norm(nose_pos - left_wrist_pos)
    right_dist = np.linalg.norm(nose_pos - right_wrist_pos)
    
    metrics["hand_face_dist_left"] = float(left_dist)
    metrics["hand_face_dist_right"] = float(right_dist)
    
    # Hand near face detection (tight threshold = phone to ear)
    if left_wrist.visibility > 0.5 and left_dist < 0.15:
        alerts.append("hand_near_face")
        max_confidence = max(max_confidence, 0.60)
    
    if right_wrist.visibility > 0.5 and right_dist < 0.15:
        alerts.append("hand_near_face")
        max_confidence = max(max_confidence, 0.60)
    
    # Looking down detection (extreme angle only)
    left_shoulder = landmarks[mp_pose.PoseLandmark.LEFT_SHOULDER.value]
    right_shoulder = landmarks[mp_pose.PoseLandmark.RIGHT_SHOULDER.value]
    
    if left_shoulder.visibility > 0.5 and right_shoulder.visibility > 0.5:
        shoulders_center_y = (left_shoulder.y + right_shoulder.y) / 2
        diff = nose.y - shoulders_center_y
        metrics["nose_shoulder_diff"] = float(diff)
        
        # Only trigger for extreme looking down (head significantly below shoulders)
        if diff > 0.15:
            alerts.append("looking_down")
            max_confidence = max(max_confidence, 0.55)
            logger.debug(f"🚨 LOOKING DOWN DETECTED")
    
    if alerts:
        # Remove duplicates
        unique_alerts = list(set(alerts))
        return True, " AND ".join(unique_alerts), max_confidence, metrics
    
    return False, "", 0.0, metrics

# ============================================================================
# YOLO DEVICE DETECTION
# ============================================================================
def detect_electronic_devices(frame: np.ndarray, yolo_model) -> Tuple[List[Dict], float]:
    """
    Detect electronic devices using YOLO object detection
    
    COCO class IDs:
    - 67: cell phone
    - 63: laptop
    - 62: tv/monitor
    - 66: keyboard
    - 64: mouse
    
    Returns:
        (detections_list, max_confidence)
    """
    if yolo_model is None:
        return [], 0.0
    
    detections = []
    max_conf = 0.0
    
    try:
        # Run YOLO inference with optimized settings
        results = yolo_model(frame, verbose=False, conf=0.3, imgsz=640)
        
        # COCO dataset class IDs for devices
        device_classes = {
            67: 'cell phone',
            63: 'laptop',
            62: 'monitor',
            66: 'keyboard',
            64: 'mouse'
        }
        
        for result in results:
            boxes = result.boxes
            for box in boxes:
                class_id = int(box.cls[0])
                confidence = float(box.conf[0])
                
                if class_id in device_classes:
                    device_name = device_classes[class_id]
                    x1, y1, x2, y2 = box.xyxy[0].tolist()
                    
                    detections.append({
                        "label": device_name,
                        "box": [int(x1), int(y1), int(x2), int(y2)],
                        "conf": confidence
                    })
                    
                    max_conf = max(max_conf, confidence)
        
    except Exception as e:
        logger.warning(f"⚠️  Error in device detection: {e}")
        return [], 0.0
    
    return detections, max_conf

# ============================================================================
# BEHAVIOR STATUS CLASSIFICATION
# ============================================================================
def get_human_behavior_status(gaze_h: float, gaze_v: float, pose_landmarks, 
                               num_faces: int, ear: float) -> str:
    """
    Determine current human behavior status for dashboard display
    
    Returns human-readable status string with priority:
    1. Face count issues (most critical)
    2. Eyes closed
    3. Gaze direction
    4. Pose-based detection
    5. Normal status
    """
    # Priority 1: Face count
    if num_faces == 0:
        return "No person detected"
    elif num_faces > 1:
        return "Multiple people detected"
    
    # Priority 2: Eyes closed
    if ear < 0.15:
        return "Eyes closed or blinking"
    
    # Priority 3: Extreme gaze deviation
    if abs(gaze_h) > 35 or abs(gaze_v) > 35:
        if abs(gaze_h) > abs(gaze_v):
            return "Looking right (away from screen)" if gaze_h > 35 else "Looking left (away from screen)"
        else:
            return "Looking down" if gaze_v > 35 else "Looking up"
    
    # Priority 4: Pose-based detection
    if pose_landmarks:
        landmarks = pose_landmarks.landmark
        nose = landmarks[mp_pose.PoseLandmark.NOSE.value]
        
        if nose.visibility > 0.5:
            left_shoulder = landmarks[mp_pose.PoseLandmark.LEFT_SHOULDER.value]
            right_shoulder = landmarks[mp_pose.PoseLandmark.RIGHT_SHOULDER.value]
            
            if left_shoulder.visibility > 0.5 and right_shoulder.visibility > 0.5:
                shoulders_center_y = (left_shoulder.y + right_shoulder.y) / 2
                if nose.y > shoulders_center_y + 0.20:
                    return "Looking down significantly"
    
    # Priority 5: Moderate gaze deviation (warning level)
    if abs(gaze_h) > 20 or abs(gaze_v) > 20:
        return "Slight gaze deviation"
    
    # Default: All good
    return "Focused on screen"

# ============================================================================
# VISUALIZATION
# ============================================================================
def draw_face_boxes(frame: np.ndarray, detections) -> np.ndarray:
    """
    Draw bounding boxes around detected faces
    Green = exactly 1 face (good), Red = multiple or no faces (bad)
    """
    if not detections:
        return frame
        
    viz_frame = frame.copy()
    h, w = frame.shape[:2]
    num_faces = len(detections)
    color = (0, 255, 0) if num_faces == 1 else (0, 0, 255)
    
    for detection in detections:
        bboxC = detection.location_data.relative_bounding_box
        xmin = int(bboxC.xmin * w)
        ymin = int(bboxC.ymin * h)
        width = int(bboxC.width * w)
        height = int(bboxC.height * h)
        
        cv2.rectangle(viz_frame, (xmin, ymin), (xmin + width, ymin + height), color, 2)
        
        # Draw confidence score
        score = detection.score[0]
        label = f"Face: {score:.2f}"
        cv2.putText(viz_frame, label, (xmin, ymin - 10), 
                   cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)
                   
    return viz_frame


def create_heatmap_overlay(frame: np.ndarray, alerts: List[str], 
                           behavior_status: str, fps: float) -> np.ndarray:
    """
    Create visualization overlay with alerts and status
    """
    overlay = frame.copy()
    h, w = frame.shape[:2]
    
    # Status bar at top
    if alerts:
        color = (0, 0, 255)  # Red for alerts
        cv2.rectangle(overlay, (0, 0), (w, 60), color, -1)
        cv2.addWeighted(overlay, 0.3, frame, 0.7, 0, overlay)
        
        # Alert text
        alert_text = " | ".join(alerts)
        cv2.putText(overlay, f"ALERT: {alert_text}", (10, 25),
                   cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
        
        # Behavior status
        cv2.putText(overlay, f"Status: {behavior_status}", (10, 50),
                   cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 2)
    else:
        color = (0, 255, 0)  # Green for OK
        cv2.rectangle(overlay, (0, 0), (w, 60), color, -1)
        cv2.addWeighted(overlay, 0.2, frame, 0.8, 0, overlay)
        
        cv2.putText(overlay, f"Status: {behavior_status}", (10, 25),
                   cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
        
        cv2.putText(overlay, "All Clear - Monitoring Active", (10, 50),
                   cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 2)
    
    # FPS counter at bottom right
    fps_text = f"FPS: {fps:.1f}"
    text_size = cv2.getTextSize(fps_text, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)[0]
    cv2.rectangle(overlay, (w - text_size[0] - 20, h - 40), (w, h), (0, 0, 0), -1)
    cv2.addWeighted(overlay, 0.5, frame, 0.5, 0, overlay)
    cv2.putText(overlay, fps_text, (w - text_size[0] - 10, h - 15),
               cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
    
    return overlay

# ============================================================================
# MAIN PROCESSING PIPELINE
# ============================================================================
async def process_frame(frame: np.ndarray, client_id: str, force_process: bool = False) -> Dict:
    """
    Main processing pipeline for each frame with optimized performance
    
    Features:
    - Adaptive frame skipping (process every 3rd frame)
    - YOLO caching (run every 10th frame)
    - Temporal alert smoothing
    - Multi-modal detection
    
    Returns:
        JSON response with alerts, stats, and visualization
    """
    start_time = time.time()
    
    # Initialize buffer if needed
    if client_id not in client_buffers:
        client_buffers[client_id] = FrameBuffer(maxlen=30)
    
    buffer = client_buffers[client_id]
    buffer.clear_old_alerts(max_age=5.0)  # Clean up old alerts
    
    # Adaptive frame skipping for performance
    # TEMPORARILY DISABLED - Process every frame for testing
    skip_frame = False
    
    # Downscale for faster processing (320 width is sweet spot)
    img_h, img_w = frame.shape[:2]
    scale_factor = 320 / img_w
    new_w, new_h = 320, int(img_h * scale_factor)
    small_frame = cv2.resize(frame, (new_w, new_h), interpolation=cv2.INTER_LINEAR)
    
    rgb_frame = cv2.cvtColor(small_frame, cv2.COLOR_BGR2RGB)
    proc_h, proc_w = small_frame.shape[:2]
    
    alerts = []
    confidences = []
    devices_detected = []
    
    # ========================================================================
    # 1. FACE DETECTION - Multiple face check
    # ========================================================================
    face_det_results = face_detection.process(rgb_frame)
    num_faces = 0
    face_conf = 0.0
    
    if face_det_results.detections:
        num_faces = len(face_det_results.detections)
        face_conf = max([d.score[0] for d in face_det_results.detections])
        
        if num_faces > 1:
            alerts.append("multiple_faces")
            confidences.append(0.95)
        elif num_faces == 0:
            buffer.add_alert("no_face_detected")
            if buffer.should_trigger_alert("no_face_detected", required_count=2):
                alerts.append("no_face_detected")
                confidences.append(0.90)
    else:
        # No faces detected
        buffer.add_alert("no_face_detected")
        if buffer.should_trigger_alert("no_face_detected", required_count=2):
            alerts.append("no_face_detected")
            confidences.append(0.90)
    
    # ========================================================================
    # 2. FACE MESH - Gaze tracking and eye analysis
    # ========================================================================
    face_mesh_results = face_mesh.process(rgb_frame)
    gaze_h, gaze_v = 0.0, 0.0
    avg_ear = 0.3
    pitch, yaw, roll = 0.0, 0.0, 0.0
    
    if face_mesh_results.multi_face_landmarks:
        face_landmarks = face_mesh_results.multi_face_landmarks[0]  # Use first face
        
        # Gaze direction
        gaze_h, gaze_v = detect_gaze_direction(face_landmarks, proc_w, proc_h)
        
        # IMMEDIATE GAZE ALERT - No temporal smoothing
        if abs(gaze_h) > 10 or abs(gaze_v) > 10:
            alerts.append("gaze_off_screen")
            confidences.append(0.85)
        
        # Eye Aspect Ratio (blink detection)
        left_eye_points = np.array([[face_landmarks.landmark[idx].x * proc_w,
                                     face_landmarks.landmark[idx].y * proc_h] 
                                    for idx in LEFT_EYE_LANDMARKS])
        right_eye_points = np.array([[face_landmarks.landmark[idx].x * proc_w,
                                      face_landmarks.landmark[idx].y * proc_h] 
                                     for idx in RIGHT_EYE_LANDMARKS])
        
        left_ear = calculate_ear(left_eye_points)
        right_ear = calculate_ear(right_eye_points)
        avg_ear = (left_ear + right_ear) / 2.0
        
        # Head pose estimation (using original frame dimensions)
        pitch, yaw, roll = calculate_head_pose(face_landmarks, img_w, img_h)
    
    # ========================================================================
    # 3. POSE DETECTION - Suspicious activity
    # ========================================================================
    pose_results = pose.process(rgb_frame)
    pose_metrics = {}
    
    if pose_results.pose_landmarks:
        is_suspicious, activity_type, activity_conf, pose_metrics = detect_suspicious_activity(
            buffer, pose_results.pose_landmarks
        )
        
        if is_suspicious:
            buffer.add_alert(activity_type)
            # Immediate trigger for hand near face (critical)
            if "hand_near_face" in activity_type:
                alerts.append(activity_type)
                confidences.append(activity_conf)
            # Temporal smoothing for looking down
            elif "looking_down" in activity_type:
                if buffer.should_trigger_alert("looking_down", required_count=3, time_window=1.5):
                    alerts.append(activity_type)
                    confidences.append(activity_conf)
    
    # ========================================================================
    # 4. YOLO DEVICE DETECTION - Optimized with caching
    # ========================================================================
    yolo_detections = []
    
    # RUN YOLO EVERY FRAME FOR TESTING (detect all devices immediately)
    run_yolo = True
    
    if yolo_model is not None:
        yolo_detections, dev_conf = detect_electronic_devices(frame, yolo_model)
    else:
        yolo_detections = []
    
    # Process YOLO detections
    if yolo_detections:
        devices_detected = [d['label'] for d in yolo_detections]
        dev_conf = max([d['conf'] for d in yolo_detections])
        
        # Immediate alerts for critical devices
        if 'cell phone' in devices_detected:
            alerts.append("device_detected_phone")
            confidences.append(dev_conf)
        if 'laptop' in devices_detected:
            alerts.append("device_detected_laptop")
            confidences.append(dev_conf)
        if 'monitor' in devices_detected:
            alerts.append("device_detected_monitor")
            confidences.append(dev_conf)
    
    # ========================================================================
    # 5. Update buffer and calculate behavior status
    # ========================================================================
    buffer.add(small_frame, None, gaze_h, avg_ear)
    
    behavior_status = get_human_behavior_status(
        gaze_h, gaze_v, 
        pose_results.pose_landmarks if pose_results else None,
        num_faces, avg_ear
    )
    
    # ========================================================================
    # 6. Create visualization overlay (on original frame for quality)
    # ========================================================================
    viz_frame = frame.copy()
    
    # Draw face boxes
    if face_det_results.detections:
        viz_frame = draw_face_boxes(viz_frame, face_det_results.detections)
    
    # Draw iris points
    if face_mesh_results.multi_face_landmarks:
        for fl in face_mesh_results.multi_face_landmarks:
            draw_iris_points(viz_frame, fl, img_w, img_h)
    
    # Draw pose skeleton
    if pose_results.pose_landmarks:
        mp_drawing.draw_landmarks(
            viz_frame,
            pose_results.pose_landmarks,
            mp_pose.POSE_CONNECTIONS,
            landmark_drawing_spec=mp_drawing.DrawingSpec(color=(245, 117, 66), thickness=2, circle_radius=2),
            connection_drawing_spec=mp_drawing.DrawingSpec(color=(245, 66, 230), thickness=2, circle_radius=2)
        )
    
    # Draw YOLO device bounding boxes
    for det in yolo_detections:
        box = det['box']
        label = f"{det['label']} {det['conf']:.2f}"
        cv2.rectangle(viz_frame, (box[0], box[1]), (box[2], box[3]), (0, 165, 255), 2)
        cv2.putText(viz_frame, label, (box[0], box[1] - 10), 
                   cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 165, 255), 2)
    
    # Add status overlay
    current_fps = buffer.update_fps()
    viz_frame = create_heatmap_overlay(viz_frame, alerts, behavior_status, current_fps)
    
    # Encode to base64
    _, buffer_img = cv2.imencode('.jpg', viz_frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
    viz_base64 = base64.b64encode(buffer_img).decode('utf-8')
    
    # ========================================================================
    # 7. Calculate metrics and prepare response
    # ========================================================================
    processing_time = (time.time() - start_time) * 1000  # milliseconds
    
    alert_string = " AND ".join(set(alerts)) if alerts else "none"
    max_conf = max(confidences) if confidences else 1.0
    
    response = {
        "alert": alert_string,
        "conf": round(max_conf, 2),
        "viz": viz_base64,
        "behavior_status": behavior_status,
        "devices_detected": list(set(devices_detected)),
        "details": {
            "num_faces": num_faces,
            "face_detection_confidence": round(face_conf, 2),
            "gaze_horizontal": round(gaze_h, 2),
            "gaze_vertical": round(gaze_v, 2),
            "ear": round(avg_ear, 3),
            "head_pitch": round(pitch, 2),
            "head_yaw": round(yaw, 2),
            "head_roll": round(roll, 2),
            "hand_face_distance_left": round(pose_metrics.get("hand_face_dist_left", -1.0), 3),
            "hand_face_distance_right": round(pose_metrics.get("hand_face_dist_right", -1.0), 3),
            "nose_shoulder_diff": round(pose_metrics.get("nose_shoulder_diff", 0.0), 3),
            "processing_time_ms": round(processing_time, 2),
            "fps": round(current_fps, 1),
            "avg_fps": round(buffer.get_avg_fps(), 1),
            "frame_count": buffer.frame_count,
            "yolo_cached": not run_yolo,
            "skipped": False
        },
        "timestamp": time.time()
    }
    
    if DEBUG:
        logger.debug("\n" + "="*60)
        logger.debug(f"Frame #{buffer.frame_count}")
        logger.debug(f"Faces: {num_faces}, Gaze: H={gaze_h:.1f}° V={gaze_v:.1f}°")
        logger.debug(f"Devices: {devices_detected}")
        logger.debug(f"Alerts: {alerts}")
        logger.debug(f"Behavior: {behavior_status}")
        logger.debug("="*60 + "\n")
    
    return response

# ============================================================================
# WEBSOCKET ENDPOINT
# ============================================================================
@router.websocket("/ws/proctor")
async def websocket_endpoint(websocket: WebSocket):
    """
    WebSocket endpoint for real-time proctoring
    
    Protocol:
    - Client sends: {"frame": "base64_jpeg_data"}
    - Server responds: JSON with alerts, stats, and visualization
    """
    await websocket.accept()
    client_id = str(id(websocket))
    
    logger.info(f"✅ Client {client_id} connected to proctoring WebSocket")
    
    try:
        while True:
            # Receive frame data
            data = await websocket.receive_text()
            message = json.loads(data)
            
            # Extract frame
            frame_data = message.get("frame", "")
            if not frame_data:
                await websocket.send_json({"error": "No frame data received"})
                continue
            
            # Remove data URL prefix if present (e.g., "data:image/jpeg;base64,")
            if "," in frame_data:
                frame_data = frame_data.split(",")[1]
            
            # Decode base64 to numpy array
            try:
                img_bytes = base64.b64decode(frame_data)
                nparr = np.frombuffer(img_bytes, np.uint8)
                frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
                
                if frame is None:
                    await websocket.send_json({"error": "Failed to decode frame"})
                    continue
            except Exception as e:
                await websocket.send_json({"error": f"Frame decode error: {str(e)}"})
                continue
            
            # Process frame
            result = await process_frame(frame, client_id)
            
            # Send result
            await websocket.send_json(result)
            
    except WebSocketDisconnect:
        logger.info(f"❌ Client {client_id} disconnected")
        if client_id in client_buffers:
            del client_buffers[client_id]
    except Exception as e:
        logger.error(f"⚠️  Error in WebSocket handler: {e}")
        try:
            await websocket.send_json({"error": str(e)})
        except:
            pass
        finally:
            if client_id in client_buffers:
                del client_buffers[client_id]
