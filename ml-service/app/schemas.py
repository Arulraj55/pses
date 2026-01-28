from pydantic import BaseModel, Field
from typing import List, Optional


class PredictRequest(BaseModel):
    quizScore: float = Field(..., ge=0.0, le=1.0, description="Fraction correct, 0..1")
    timePerQuestionSec: List[float] = Field(default_factory=list)
    videoReplays: int = Field(0, ge=0)
    perceivedDifficulty: int = Field(3, ge=1, le=5)


class PredictResponse(BaseModel):
    level: str
    confidence: float
    features: dict
