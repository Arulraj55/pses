# Programming Skill Enhancement System (PSES)

Single-flow learning app:
1) Pick a **topic** + **programming language**
2) System fetches a relevant **video**
3) After video completion, system shows a **10-question concept quiz**
4) A lightweight **User Understanding Level Predictor** classifies the learner: Beginner / Intermediate / Advanced
5) System recommends **rewatch/revision** based on weak concepts

## Security note (important)
If you pasted real API keys into chat or code, treat them as **compromised**:
- **Revoke/rotate** keys in the provider console
- Use `.env` locally and never commit secrets

## Monorepo layout
- `client/` React (Vite) UI
- `server/` Node.js (Express) API
- `ml-service/` Python (FastAPI) predictor service

## Quick start
1) Create `.env` from `.env.example` and fill values
2) Start ML service
   - `cd ml-service`
   - `python -m venv .venv`
   - `.venv\\Scripts\\activate`
   - `pip install -r requirements.txt`
   - `uvicorn app.main:app --reload --port 8001`
3) Start API server
   - `cd server`
   - `npm install`
   - `npm run dev`
4) Start client
   - `cd client`
   - `npm install`
   - `npm run dev`

## Caching policy (recommended)
- YouTube searches are cached server-side by `topic+language`
- Gemini question generation is cached **once per topic** (not per user)
