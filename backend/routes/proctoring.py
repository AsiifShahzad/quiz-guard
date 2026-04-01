"""
routes/proctoring.py — Simplified AI Proctoring
"""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import logging

logger = logging.getLogger(__name__)
router = APIRouter()

@router.websocket("/ws/proctor")
async def ws_proctor(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_text()
            # Mock behavior for now
            await websocket.send_json({
                "alert": "none",
                "behavior_status": "Focused on screen",
                "details": {"fps": 30}
            })
    except WebSocketDisconnect:
        pass


    