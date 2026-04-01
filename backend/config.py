import os
from dotenv import load_dotenv

load_dotenv()

# Hugging Face
HF_TOKEN = os.getenv("HF_TOKEN")
HF_DEVICE_DETECTION_MODEL = "hustvl/yolos-tiny"  # Fast, lightweight YOLO on HF API
HF_API_URL = f"https://api-inference.huggingface.co/models/{HF_DEVICE_DETECTION_MODEL}"

# Detection thresholds
GAZE_H_THRESHOLD = 12.0       # degrees (lowered for better sensitivity)
GAZE_V_THRESHOLD = 12.0       # degrees (lowered for better sensitivity)
GAZE_VIOLATION_SECONDS = 3.0  # seconds before costing a chance
GAZE_SMOOTHING_WINDOW = 5     # frames to average gaze for stability
HEAD_YAW_THRESHOLD = 25.0     # degrees
HEAD_PITCH_THRESHOLD = 20.0   # degrees
EAR_BLINK_THRESHOLD = 0.21    # below this = eyes closed
HAND_FACE_DANGER_DISTANCE = 0.15  # normalized distance

# ── COMPREHENSIVE DEVICE DETECTION ─────────────────────────────────────────
# Device severity levels for proctoring violations
DEVICE_SEVERITY = {
    # CRITICAL - Must not have (immediate disqualification)
    "CRITICAL": {
        "cell phone", "phone", "mobile phone", "smartphone",
        "laptop", "computer", "desktop computer", "tablet", "ipad",
        "monitor", "tv", "television", "screen", "display",
        "smartwatch", "smart watch", "apple watch",
    },
    # HIGH RISK - Highly suspicious
    "HIGH": {
        "camera", "webcam", "digital camera",
        "drone", "quadrotor",
        "keyboard", "mouse", "wireless mouse", "trackpad",
        "headphones", "earbuds", "airpods", "wireless headphones", "headset",
        "speaker", "bluetooth speaker",
        "smartwatch", "wearable",
    },
    # MEDIUM RISK - Suspicious but might have legitimate use
    "MEDIUM": {
        "projector",
        "printer", "scanner",
        "router", "modem",
        "power bank", "battery pack",
        "charger", "usb device",
        "gaming controller", "controller", "joystick", "xbox",
        "book", "notebook", "paper",
    },
    # LOW RISK - Less critical (for logging)
    "LOW": {
        "clock", "watch",
        "calculator",
        "desk lamp", "lamp",
        "cable", "usb cable",
    }
}

# Flattened set of ALL flagged devices (for backward compatibility)
FLAGGED_DEVICE_LABELS = (
    DEVICE_SEVERITY.get("CRITICAL", set()) |
    DEVICE_SEVERITY.get("HIGH", set()) |
    DEVICE_SEVERITY.get("MEDIUM", set()) |
    DEVICE_SEVERITY.get("LOW", set())
)

# ── DEVICE DETECTION SETTINGS ──────────────────────────────────────────────
# How often to call HF API for device detection (every N frames, to save API quota)
DEVICE_CHECK_EVERY_N_FRAMES = 5

# Device detection result caching (seconds)
DEVICE_DETECTION_CACHE_DURATION = 2.0

# Confidence threshold for device detection
DEVICE_DETECTION_CONFIDENCE_THRESHOLD = 0.40  # Lowered to catch more devices
