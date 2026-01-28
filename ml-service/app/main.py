from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .schemas import PredictRequest, PredictResponse
from .model import load_or_train, featurize, predict_level

app = FastAPI(title="PSES ML Service", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"]
)

clf = load_or_train()


@app.get("/health")
def health():
    return {"ok": True, "service": "pses-ml"}


@app.post("/predict", response_model=PredictResponse)
def predict(req: PredictRequest):
    features = featurize(
        quiz_score=req.quizScore,
        time_per_q=req.timePerQuestionSec,
        video_replays=req.videoReplays,
        perceived_difficulty=req.perceivedDifficulty,
    )

    level, confidence = predict_level(clf, features)

    return PredictResponse(
        level=level,
        confidence=confidence,
        features={
            "quizScore": features.score,
            "avgTimeSec": features.avg_time,
            "timeStdSec": features.time_std,
            "videoReplays": features.replays,
            "perceivedDifficulty": features.difficulty,
        },
    )
