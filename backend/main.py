from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import logging
import uvicorn
import os
import uuid
from dotenv import load_dotenv

from proctoring import router as proctoring_router
from routes.project import router as project_router

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Quiz Proctoring Backend")

# Allow specific origins for credentialed requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "*"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(proctoring_router)
app.include_router(project_router)



@app.get("/session/csrf")
async def get_csrf_token():
    """Return a CSRF token for frontend requests (optional, for compatibility)."""
    return {"csrf_token": str(uuid.uuid4())}


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "proctor-backend"}


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)