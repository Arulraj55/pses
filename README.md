# Programming Skill Enhancement System (PSES)

PSES is a single-flow learning app:
1) Pick a **topic** + **programming language**
2) Fetch a relevant **video**
3) Watch the video, then take a **10-question concept quiz**
4) Predict a learner level (Beginner / Intermediate / Advanced)
5) Recommend **revision/rewatch** based on weak concepts

## Functionalities
- Authentication (JWT sessions; optional Firebase Admin verification)
- Video discovery (YouTube)
- Quiz generation and evaluation
- User progress tracking
- Understanding level prediction via ML microservice
- Server-side caching for common topic/language lookups

## Monorepo layout
- `client/` React (Vite) UI
- `server/` Node.js (Express) API
- `ml-service/` Python (FastAPI) predictor service

## Prerequisites
- Node.js 18+ (recommended)
- Python 3.10+
- MongoDB (local or Atlas)

## Getting Started (Local)

### 1) Configure environment variables
Create a root `.env` from `.env.example`:

```bash
copy .env.example .env
```

Fill in your API keys and local URLs.

Security note:
- Never commit `.env` (this repo already ignores it)
- If secrets were ever shared publicly, rotate/revoke them

### 2) Start the ML service (FastAPI)

```bash
cd ml-service
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Health check: `http://127.0.0.1:8000/health`

### 3) Start the API server (Express)

```bash
cd server
npm install
npm run dev
```

Health check: `http://127.0.0.1:5000/health`

### 4) Start the client (Vite)

```bash
cd client
npm install
npm run dev
```

Open: `http://localhost:5173`

## Default ports
- Client: `5173`
- API server: `5000`
- ML service: `8000`

## Key environment variables
- `VITE_API_BASE_URL` (client) - points the UI at the API server
- `ML_SERVICE_URL` (server) - points the API to the ML service
- `MONGODB_URI` (server) - MongoDB connection string
- `JWT_SECRET` (server) - session signing secret
- `YOUTUBE_API_KEY`, `GOOGLE_CSE_API_KEY`, `GOOGLE_CSE_CX` (server) - content discovery

## Caching policy
- YouTube searches are cached by `topic+language`
- Quiz generation is cached once per topic (not per user)

## Related
- E-commerce website (React + Redux): add your GitHub link here

## Contributing
Issues and PRs are welcome. Please avoid committing secrets, large models, or build outputs.

