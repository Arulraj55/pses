import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Load environment variables.
// When running `npm run dev` from the `server/` folder, the root `.env` lives at `../.env`.
// We load multiple candidates (without overriding already-set vars) to keep local overrides working.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const candidateEnvPaths = [
  path.resolve(__dirname, '..', '..', '.env'), // pses/.env
  path.resolve(__dirname, '..', '.env'), // pses/server/.env
  path.resolve(process.cwd(), '.env') // current working dir
];

for (const envPath of candidateEnvPaths) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
  }
}

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 5000),
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',

  appBaseUrl: process.env.APP_BASE_URL ?? process.env.CORS_ORIGIN ?? 'http://localhost:5173',

  smtpHost: process.env.SMTP_HOST ?? null,
  smtpPort: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : null,
  smtpUser: process.env.SMTP_USER ?? null,
  smtpPass: process.env.SMTP_PASS ?? null,
  smtpFrom: process.env.SMTP_FROM ?? null,

  jwtSecret:
    process.env.JWT_SECRET || (process.env.NODE_ENV !== 'production' ? 'dev-jwt-secret-change-me' : null),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',

  mongodbUri: process.env.MONGODB_URI ?? null,

  geminiApiKey: process.env.GEMINI_API_KEY ?? null,
  geminiModel: process.env.GEMINI_MODEL ?? 'gemini-1.5-flash-latest',
  youtubeApiKey: process.env.YOUTUBE_API_KEY ?? null,
  googleCseApiKey: process.env.GOOGLE_CSE_API_KEY ?? null,
  googleCseCx: process.env.GOOGLE_CSE_CX ?? null,

  mlServiceUrl: process.env.ML_SERVICE_URL ?? 'http://127.0.0.1:8001'
};

export const requireEnv = { required };
