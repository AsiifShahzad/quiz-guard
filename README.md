# QuizGuard
An AI-powered proctored quiz platform that ensures academic integrity through real-time gaze tracking, device detection, and behavioral analysis.

**Live Demo:** Coming Soon

## Problem
Online education platforms struggle with ensuring test integrity. Students can easily cheat by looking at external resources, using secondary devices, or receiving help from others — making remote assessments unreliable and devaluing certifications.

## Impact
- **Real-time detection** of 10+ integrity violations (gaze off-screen, multiple faces, unauthorized devices)
- **3-strike integrity system** that auto-terminates cheating attempts
- **Sub-100ms latency** using local YOLOv8 device detection (no API delays)
- **Multi-modal proctoring** combining gaze tracking, head pose, body skeleton, and object detection

## Solution
A full-stack application with a FastAPI backend powered by MediaPipe + YOLOv8 and a React frontend with real-time WebSocket streaming.

### Architecture
The proctoring pipeline runs continuously during quiz:
1. **Frame Capture** - React component streams webcam frames (5 FPS)
2. **Multi-Modal Detection** - Parallel inference on:
   - MediaPipe FaceMesh (468-point face landmarks for gaze + head pose)
   - MediaPipe Pose (body skeleton for hand-face distance)
   - MediaPipe FaceDetection (multi-face detection)
   - YOLOv8n (device detection - phones, laptops, monitors)
3. **Violation Analysis** - Temporal buffering + alert smoothing
4. **Real-time Feedback** - Violations logged immediately with 3-strike termination

### Violation Detection
- **Gaze Off-Screen** - 3-second threshold, triggers on extreme gaze angles
- **Multiple Faces** - Immediate alert if >1 face detected
- **Critical Devices** - Phones, laptops, monitors flagged instantly
- **Hand-Face Distance** - Detects suspicious hand proximity to face
- **Tab Switching** - Copy/paste and visibility change detection
- **Suspicious Poses** - Extreme head tilts, looking down

### Quiz Flow
1. **Start Screen** - Rules, proctoring requirements, 3-strike warning
2. **Instructions** - Verify camera access, position face in frame
3. **Quiz In Progress** - Real-time proctoring feedback with violation timeline
4. **Termination** - If 0 chances remain, quiz terminates with violation report
5. **Results** - Score, proctoring summary, per-question feedback

## Tech Stack
**Backend:**
- FastAPI · WebSocket · MediaPipe · YOLOv8 · OpenCV · NumPy

**Frontend:**
- React · Vite · TailwindCSS · Lucide Icons

**ML Models:**
- MediaPipe FaceMesh (local, no internet required)
- MediaPipe Pose (local)
- MediaPipe FaceDetection (local)
- YOLOv8n (6.2MB, auto-downloaded)

**Deployment:**
- Backend: FastAPI on Railway/Render
- Frontend: React SPA on Vercel/Netlify

## Project Structure
```
QuizApp/
├── backend/
│   ├── main.py                 # FastAPI entry point
│   ├── proctoring.py           # WebSocket handler + detection pipeline
│   ├── config.py               # Configuration & constants
│   ├── routes/
│   │   └── project.py          # Quiz submission API
│   ├── requirements.txt         # Python dependencies
│   └── yolov8n.pt              # YOLOv8 model (auto-downloaded)
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx             # Main app router
│   │   ├── components/
│   │   │   ├── Landing.jsx     # Quiz selection page
│   │   │   ├── Quiz.jsx        # Main quiz interface
│   │   │   ├── ProctorFeed.jsx # Webcam frame capture
│   │   │   ├── ProctorStats.jsx # Violation timeline
│   │   │   └── useProctoring.js # WebSocket hook
│   │   └── services/
│   │       └── api.js          # Backend API client
│   ├── package.json
│   ├── vite.config.js
│   └── tailwind.config.js
│
├── .gitignore
└── README.md
```

## Quick Start

### Backend Setup
```bash
cd backend
pip install -r requirements.txt
python main.py
# Server runs on http://localhost:8000
```

### Frontend Setup
```bash
cd frontend
npm install
npm run dev
# App runs on http://localhost:5173
```

### Environment Variables
Create `backend/.env`:
```
HF_TOKEN=your_huggingface_token_here
GROQ_API_KEY=your_groq_api_key_optional
```

## Features
✅ Real-time gaze tracking with 3-second off-screen threshold  
✅ Multi-face detection with immediate alerts  
✅ Device detection (phones, laptops, monitors, etc.)  
✅ Copy/paste and tab switch detection  
✅ Temporal alert smoothing (prevents false positives)  
✅ 3-strike termination system  
✅ Session ID for support appeals  
✅ Violation timeline visualization  
✅ Responsive UI with TailwindCSS  
✅ WebSocket real-time streaming  

## Performance
- **Frame Processing**: 30-50ms per frame (YOLOv8n local inference)
- **Target FPS**: 5 FPS (balanced accuracy/latency)
- **Model Size**: 6.2MB (YOLOv8n)
- **Memory Usage**: ~500MB (MediaPipe + YOLOv8)
- **Latency**: <100ms end-to-end

## Future Enhancements
- [ ] Proctored exam marketplace integration
- [ ] Analytics dashboard for educators
- [ ] Advanced pose anomaly detection
- [ ] Liveness detection (prevent video replay)
- [ ] Biometric fingerprinting (behavioral patterns)
- [ ] Appeal/review workflow

## License
MIT

## Author
**Asif Shahzad** — AI/ML Engineer  
Portfolio · LinkedIn · GitHub

---

**Built with ❤️ for academic integrity**
