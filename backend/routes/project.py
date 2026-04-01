import json
import os
import random
import uuid
import logging
from typing import List, Optional, Dict
from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from groq import Groq

logger = logging.getLogger(__name__)

load_dotenv()
router = APIRouter()

# ── In-memory quiz storage (for demo; in production, use MongoDB/PostgreSQL) ──
quiz_storage: Dict[str, dict] = {}

# ── Models ───────────────────────────────────────────────────────────────────
class QuizRequest(BaseModel):
    topic: str
    difficulty: str = "medium"

class QuizSubmission(BaseModel):
    quiz_id: str
    user_answers: List[dict]
    user_id: Optional[str] = None  # Optional, for frontend compatibility
    
    class Config:
        extra = "allow"  # Allow extra fields, ignore them

# ── Groq Config ───────────────────────────────────────────────────────────────
client = Groq(api_key=os.getenv("GROQ_API_KEY"))
_GROQ_MODELS = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"]

def _call_groq(prompt: str) -> Optional[str]:
    for model in _GROQ_MODELS:
        try:
            resp = client.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.7,
                response_format={"type": "json_object"}
            )
            return resp.choices[0].message.content
        except Exception as e:
            print(f"Groq error with {model}: {e}")
    return None

def _get_fallback_quiz(topic: str) -> List[dict]:
    return [
        {
            "id": str(uuid.uuid4()),
            "question": f"Default: What is a key concept in {topic}?",
            "options": ["A) Option A", "B) Option B", "C) Option C", "D) Option D"],
            "correct_answer": "A",
            "explanation": "This is a fallback question."
        } for i in range(10)
    ]

@router.post("/api/generate-quiz")
async def generate_quiz(req: QuizRequest):
    logger.info(f"🎯 Quiz generation requested - topic: {req.topic}, difficulty: {req.difficulty}")
    
    few_shot = (
        "Example Input: Topic 'Politics'\n"
        "Example Output: {\"questions\": [{\"id\": \"1\", \"question\": \"Who is the head of state in a parliamentary system?\", \"options\": [\"A) President\", \"B) Prime Minister\", \"C) Monarch\", \"D) Chief Justice\"], \"correct_answer\": \"B\", \"explanation\": \"In most parliamentary systems, the PM is the head of government.\"}]}"
    )
    
    prompt = f"{few_shot}\n\nGenerate 10 MCQs on the topic: '{topic_map.get(req.topic.lower(), req.topic)}'. Difficulty: {req.difficulty}.\nReturn ONLY the JSON format shown above with correct_answer as 'A', 'B', 'C', or 'D'."
    
    fallback_triggered = False
    try:
        logger.info(f"📚 Calling Groq API to generate questions...")
        raw = _call_groq(prompt)
        if not raw: raise Exception("No response from Groq")
        data = json.loads(raw)
        questions = data.get("questions", [])
        if len(questions) < 5: raise Exception(f"Too few questions generated: {len(questions)}")
        # Assign random UUIDs if not present
        for q in questions:
            if 'id' not in q: q['id'] = str(uuid.uuid4())
        logger.info(f"✅ Generated {len(questions)} questions successfully")
    except Exception as e:
        logger.warning(f"⚠️ Quiz generation fallback triggered: {type(e).__name__}: {e}")
        questions = _get_fallback_quiz(req.topic)
        fallback_triggered = True

    # Store the complete quiz with answers in memory
    quiz_id = str(uuid.uuid4())
    quiz_storage[quiz_id] = {
        "topic": req.topic,
        "difficulty": req.difficulty,
        "questions": questions,  # Complete questions with correct answers
        "created_at": uuid.uuid4().hex
    }
    logger.info(f"💾 Stored quiz in memory - quiz_id: {quiz_id}")

    # Return questions WITHOUT correct answers for client security
    public_qs = [{k: v for k, v in q.items() if k != "correct_answer"} for q in questions]
    
    logger.info(f"✉️ Sending {len(public_qs)} questions to frontend (correct answers hidden)")
    
    return {
        "quiz_id": quiz_id,
        "questions": public_qs,
        "topic": req.topic,
        "fallback_triggered": fallback_triggered
    }

@router.post("/api/quiz/submit")
async def submit_quiz(submission: QuizSubmission):
    """
    Submit quiz answers and receive score.
    Compares user answers against stored correct answers.
    """
    try:
        logger.info(f"📝 Quiz submission received - quiz_id: {submission.quiz_id}, user_id: {submission.user_id}, answers: {len(submission.user_answers)}")
        
        # Retrieve stored quiz
        if submission.quiz_id not in quiz_storage:
            logger.error(f"❌ Quiz not found: {submission.quiz_id}. Available quizzes: {list(quiz_storage.keys())}")
            raise HTTPException(status_code=404, detail="Quiz not found - please generate a new quiz")
        
        stored_quiz = quiz_storage[submission.quiz_id]
        questions = stored_quiz.get("questions", [])
        
        if not questions:
            logger.error(f"❌ No questions found in quiz: {submission.quiz_id}")
            raise HTTPException(status_code=400, detail="Quiz has no questions")
        
        if not submission.user_answers:
            logger.warning(f"❌ No answers provided for quiz: {submission.quiz_id}")
            raise HTTPException(status_code=400, detail="No answers provided")
        
        # Score the quiz by comparing against correct answers
        score = 0
        results = []
        
        logger.info(f"🔍 Scoring {len(submission.user_answers)} answers against {len(questions)} questions")
        
        for ans in submission.user_answers:
            question_id = ans.get("question_id")
            user_answer = ans.get("selected_answer")  # Expected format: "A", "B", "C", "D"
            
            # Find the corresponding question
            question = next((q for q in questions if str(q.get("id")) == str(question_id)), None)
            
            if not question:
                logger.warning(f"⚠️ Question not found: {question_id}")
                continue
            
            correct_answer = question.get("correct_answer")
            is_correct = user_answer == correct_answer
            
            if is_correct:
                score += 1
            
            results.append({
                "question_id": question_id,
                "selected_answer": user_answer,
                "correct_answer": correct_answer,
                "is_correct": is_correct,
                "explanation": question.get("explanation", "")
            })
        
        # Calculate percentage
        total = len(submission.user_answers)
        percentage = round((score / total * 100)) if total > 0 else 0
        passed = percentage >= 70
        
        response = {
            "score": score,
            "total": total,
            "percentage": percentage,
            "results": results,
            "passed": passed,
            "success": True
        }
        
        logger.info(f"✅ Quiz submitted successfully - {submission.user_id}: score: {score}/{total} ({percentage}%) - {'PASSED' if passed else 'FAILED'}")
        
        # Clean up stored quiz (optional, for memory management)
        # del quiz_storage[submission.quiz_id]
        
        return response
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Quiz submission error: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail=f"Quiz submission error: {str(e)}")

topic_map = {
    "politics": "Global Politics & Governance",
    "geography": "World Geography & Capitals",
    "general": "General Knowledge & Trivia",
    "science": "Modern Science & Physics",
    "tech": "Information Technology & AI"
}