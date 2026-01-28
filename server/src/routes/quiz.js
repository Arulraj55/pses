import express from 'express';
import { env } from '../env.js';
import { fetchJson } from '../http.js';
import { cacheKey, memCache } from '../cache.js';
import { getCache, setCache } from '../firestoreCache.js';

export const quizRouter = express.Router();

let resolvedGeminiModel = null;

async function listGeminiModels() {
  const url = new URL('https://generativelanguage.googleapis.com/v1/models');
  url.searchParams.set('key', env.geminiApiKey);
  const data = await fetchJson(url.toString());
  return Array.isArray(data?.models) ? data.models : [];
}

function pickModel(models) {
  const eligible = models.filter((m) => (m?.supportedGenerationMethods || []).includes('generateContent'));
  const ids = eligible
    .map((m) => String(m?.name || ''))
    .filter(Boolean)
    .map((n) => n.replace(/^models\//, ''));

  const preferred = [
    'gemini-1.5-flash',
    'gemini-1.5-pro',
    'gemini-1.0-pro'
  ];
  for (const p of preferred) {
    const hit = ids.find((id) => id === p || id.startsWith(`${p}-`));
    if (hit) return hit;
  }
  return ids[0] || null;
}

function geminiPrompt({ topic, language }) {
  return `Create exactly 10 concept-understanding multiple-choice questions (MCQ) for the topic: "${topic}" in the context of "${language}".

Rules:
- Output MUST be valid JSON only, no markdown.
- JSON shape: {"topic":"...","language":"...","questions":[{"id":1,"concept":"...","question":"...","options":["A","B","C","D"],"answerIndex":0,"explanation":"..."}]}
- Keep options short.
- Make questions conceptual (not memorization).
- Ensure answerIndex points to the correct option.
`;
}

function extractJson(text) {
  const t = String(text || '').trim();
  if (!t) return '';

  // Prefer fenced JSON blocks.
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fence?.[1]) return fence[1].trim();

  // Otherwise, grab the first JSON-looking object.
  const first = t.indexOf('{');
  const last = t.lastIndexOf('}');
  if (first !== -1 && last !== -1 && last > first) return t.slice(first, last + 1).trim();

  return t;
}

async function readFirestoreCache(key) {
  const data = await getCache(key);
  return data?.quiz ?? null;
}

async function writeFirestoreCache({ key, topic, language, quiz }) {
  await setCache(key, { key, topic, language, quiz }, 30);
}

quizRouter.post('/generate', express.json(), async (req, res, next) => {
  try {
    const topic = String(req.body?.topic ?? '').trim();
    const language = String(req.body?.language ?? '').trim();
    if (!topic || !language) return res.status(400).json({ message: 'topic and language are required' });
    if (!env.geminiApiKey) return res.status(500).json({ message: 'GEMINI_API_KEY not configured' });

    const key = cacheKey(['quiz', topic, language]);

    const mem = memCache.get(key);
    if (mem) return res.json({ source: 'memory', ...mem });

    const cached = await readFirestoreCache(key);
    if (cached) {
      memCache.set(key, cached);
      return res.json({ source: 'firestore', ...cached });
    }

    const configuredModel = String(env.geminiModel || '').trim();
    const chosenModel = resolvedGeminiModel || configuredModel;

    async function callGemini(modelId) {
      const url = new URL(`https://generativelanguage.googleapis.com/v1/models/${encodeURIComponent(modelId)}:generateContent`);
      url.searchParams.set('key', env.geminiApiKey);

      const body = {
        contents: [{ role: 'user', parts: [{ text: geminiPrompt({ topic, language }) }] }],
        generationConfig: { temperature: 0.4 }
      };

      return await fetchJson(url.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
    }

    let data;
    try {
      data = await callGemini(chosenModel);
    } catch (e) {
      const msg = String(e?.message || '');
      const isNotFound = e?.status === 404 || msg.includes('is not found for API version') || msg.includes('NOT_FOUND');
      if (!isNotFound || resolvedGeminiModel) throw e;

      // Auto-resolve a model that your key/project supports.
      const models = await listGeminiModels();
      const fallback = pickModel(models);
      if (!fallback) {
        e.message = `${msg} (No generateContent models available for this API key/project. Check billing/API access.)`;
        throw e;
      }
      resolvedGeminiModel = fallback;
      data = await callGemini(fallback);
    }

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    let quiz;
    try {
      quiz = JSON.parse(extractJson(text));
    } catch (err) {
      return res.status(502).json({
        message: 'Gemini returned non-JSON output',
        raw: text,
        extracted: extractJson(text),
        parseError: err?.message ?? String(err)
      });
    }

    const payload = { quiz };
    memCache.set(key, payload);
    await writeFirestoreCache({ key, topic, language, quiz: payload });

    res.json({ source: 'gemini', model: resolvedGeminiModel || configuredModel, ...payload });
  } catch (e) {
    if (String(e?.message || '').includes('is not found for API version')) {
      e.message = `${e.message} (Tip: the server will try to auto-pick a supported model; if it still fails, your API key/project likely has no generateContent models enabled.)`;
    }
    next(e);
  }
});
