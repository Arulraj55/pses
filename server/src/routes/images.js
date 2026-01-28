import express from 'express';
import { env } from '../env.js';
import { fetchJson } from '../http.js';
import { cacheKey, memCache } from '../cache.js';
import { getCache, setCache } from '../firestoreCache.js';

export const imagesRouter = express.Router();

function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

async function readFirestoreCache(key) {
  const data = await getCache(key);
  return data?.images ?? null;
}

async function writeFirestoreCache({ key, topic, language, images }) {
  await setCache(key, { key, topic, language, images }, 7);
}

imagesRouter.get('/search', async (req, res, next) => {
  try {
    const query = String(req.query.query ?? '').trim();
    const topic = String(req.query.topic ?? query).trim();
    const language = String(req.query.language ?? '').trim();
    const fresh = String(req.query.fresh ?? '') === '1';
    const debug = String(req.query.debug ?? '') === '1';
    if (!query) return res.status(400).json({ message: 'query is required' });

    if (!env.googleCseApiKey || !env.googleCseCx) {
      return res.status(500).json({
        message: 'GOOGLE_CSE_API_KEY and GOOGLE_CSE_CX must be configured to fetch images'
      });
    }

    // Versioned key so older Pexels/Pixabay cached entries don't pollute results.
    const key = cacheKey(['img', 'cse-v1', query]);
    const mem = fresh ? null : memCache.get(key);
    if (mem?.imageUrl) return res.json({ source: 'memory', ...mem });

    const cached = fresh ? null : await readFirestoreCache(key);
    if (cached?.imageUrl) {
      memCache.set(key, cached);
      return res.json({ source: 'firestore', ...cached });
    }

    const attempts = {
      googleCse: { enabled: true, ok: false, status: null }
    };

    async function tryGoogleCseImage() {
      const base = new URL('https://www.googleapis.com/customsearch/v1');
      base.searchParams.set('key', env.googleCseApiKey);
      base.searchParams.set('cx', env.googleCseCx);
      base.searchParams.set('searchType', 'image');
      base.searchParams.set('num', '3');
      base.searchParams.set('safe', 'active');
      base.searchParams.set('imgSize', 'large');

      // Deterministic variation per topic so cards don't all show the same image.
      // (start is 1-indexed)
      const start = 1 + (hashString(query) % 5);
      base.searchParams.set('start', String(start));

      const candidates = [
        // Prefer diagram/infographic-like results first.
        { q: `${query} diagram infographic`, imgType: 'clipart', fileType: 'png' },
        // Looser fallback (still diagram-biased).
        { q: `${query} diagram`, imgType: null, fileType: null },
        // Final fallback: raw query.
        { q: query, imgType: null, fileType: null }
      ];

      for (const c of candidates) {
        const url = new URL(base.toString());
        url.searchParams.set('q', c.q);
        if (c.imgType) url.searchParams.set('imgType', c.imgType);
        else url.searchParams.delete('imgType');
        if (c.fileType) url.searchParams.set('fileType', c.fileType);
        else url.searchParams.delete('fileType');

        const data = await fetchJson(url.toString());
        const items = Array.isArray(data?.items) ? data.items : [];
        const first = items.find((it) => Boolean(it?.image?.thumbnailLink || it?.link));
        const imageUrl = first?.image?.thumbnailLink ?? first?.link ?? null;
        if (imageUrl) {
          attempts.googleCse.ok = true;
          return { imageUrl, provider: 'google-cse' };
        }
      }

      attempts.googleCse.ok = false;
      return { imageUrl: null, provider: 'none' };
    }

    let payload = null;
    try {
      payload = await tryGoogleCseImage();
    } catch {
      attempts.googleCse.status = 'error';
      payload = { imageUrl: null, provider: 'none' };
    }

    if (!payload?.imageUrl) payload = { imageUrl: null, provider: 'none' };

    memCache.set(key, payload);
    await writeFirestoreCache({ key, topic, language, images: payload });

    res.json({ source: payload.provider, ...payload, ...(debug ? { debug: { attempts } } : {}) });
  } catch (e) {
    next(e);
  }
});
