import fs from 'node:fs';
import path from 'node:path';

const STORE_PATH = path.resolve(process.cwd(), 'server', '.progress-store.json');
const defaultStore = { sessions: [], attempts: [] };

const cloneDefault = () => JSON.parse(JSON.stringify(defaultStore));

function ensureDir() {
  const dir = path.dirname(STORE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readStore() {
  try {
    if (!fs.existsSync(STORE_PATH)) {
      ensureDir();
      fs.writeFileSync(STORE_PATH, JSON.stringify(defaultStore, null, 2), 'utf8');
      return cloneDefault();
    }
    const raw = fs.readFileSync(STORE_PATH, 'utf8');
    return raw ? JSON.parse(raw) : cloneDefault();
  } catch {
    return cloneDefault();
  }
}

function writeStore(data) {
  ensureDir();
  fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2), 'utf8');
}

function generateId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function localStartSession(uid, data) {
  const store = readStore();
  const sessionId = generateId('sess');
  store.sessions.push({
    id: sessionId,
    uid,
    ...data,
    createdAt: new Date().toISOString()
  });
  writeStore(store);
  return sessionId;
}

export function localCompleteSession(uid, sessionId, updates) {
  const store = readStore();
  const session = store.sessions.find((s) => s.id === sessionId && s.uid === uid);
  if (session) {
    Object.assign(session, updates, { updatedAt: new Date().toISOString() });
  }
  writeStore(store);
}

export function localSaveAttempt(uid, payload) {
  const store = readStore();
  const attemptId = generateId('attempt');
  store.attempts.push({
    id: attemptId,
    uid,
    ...payload,
    createdAt: new Date().toISOString()
  });
  writeStore(store);
  return attemptId;
}

export function localProgressSummary(uid) {
  const store = readStore();
  const attempts = store.attempts.filter((a) => a.uid === uid);
  const sessions = store.sessions.filter((s) => s.uid === uid);

  const completedSessions = sessions.filter((s) => s.videoCompletedAt).length;
  const avgScore = attempts.length
    ? attempts.reduce((sum, a) => sum + Number(a.score ?? 0), 0) / attempts.length
    : 0;

  const weakCounts = new Map();
  for (const attempt of attempts) {
    const weakConcepts = Array.isArray(attempt.weakConcepts) ? attempt.weakConcepts : [];
    for (const concept of weakConcepts) {
      weakCounts.set(concept, (weakCounts.get(concept) || 0) + 1);
    }
  }

  const topWeak = [...weakCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([concept, count]) => ({ concept, count }));

  return {
    completedSessions,
    attemptsCount: attempts.length,
    avgScore,
    recentAttempts: attempts
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 10)
      .map((a) => ({
        id: a.id,
        topic: a.topic,
        language: a.language,
        score: a.score,
        predictedLevel: a.predictedLevel,
        confidence: a.confidence,
        createdAt: a.createdAt
      })),
    topWeak
  };
}
