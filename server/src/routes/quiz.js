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
  const t = String(text || '').replace(/^\uFEFF/, '').trim();
  if (!t) return '';

  // Prefer fenced JSON blocks.
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const unfenced = fence?.[1] ? fence[1].trim() : t;
  if (!unfenced) return '';

  // If it already looks like JSON, keep it.
  const head = unfenced.trimStart();
  if (head.startsWith('{') || head.startsWith('[')) return head;

  // Otherwise, extract the first complete JSON object/array (handles leading text).
  const startObj = unfenced.indexOf('{');
  const startArr = unfenced.indexOf('[');
  let start = -1;
  let open = '';
  let close = '';
  if (startObj !== -1 && (startArr === -1 || startObj < startArr)) {
    start = startObj;
    open = '{';
    close = '}';
  } else if (startArr !== -1) {
    start = startArr;
    open = '[';
    close = ']';
  }
  if (start === -1) return head;

  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < unfenced.length; i += 1) {
    const ch = unfenced[i];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === '\\') {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === open) depth += 1;
    if (ch === close) depth -= 1;
    if (depth === 0 && i > start) return unfenced.slice(start, i + 1).trim();
  }

  return unfenced.slice(start).trim();
}

function truncate(text, max = 2000) {
  const t = String(text ?? '');
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…(truncated ${t.length - max} chars)`;
}

function candidateText(data) {
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return '';
  return parts
    .map((p) => (typeof p?.text === 'string' ? p.text : ''))
    .filter(Boolean)
    .join('\n');
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
        generationConfig: {
          temperature: 0.4,
          // Strongly encourages a JSON-only response.
          responseMimeType: 'application/json'
        }
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

    const text = candidateText(data);
    let quiz;
    try {
      quiz = JSON.parse(extractJson(text));
    } catch (err) {
      const extracted = extractJson(text);
      return res.status(502).json({
        message: 'Gemini returned non-JSON output',
        raw: truncate(text),
        extracted: truncate(extracted),
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
