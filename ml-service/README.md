# PSES ML Service

Lightweight FastAPI predictor that classifies learner level (Beginner / Intermediate / Advanced) from:
- `quizScore` (0..1)
- `timePerQuestionSec` (array)
- `videoReplays`
- `perceivedDifficulty` (1..5)

## Run
- `python -m venv .venv`
- `.venv\\Scripts\\activate`
- `pip install -r requirements.txt`
- `uvicorn app.main:app --reload --port 8000`
