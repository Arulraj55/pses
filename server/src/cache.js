import NodeCache from 'node-cache';

// Simple in-memory cache to reduce API usage.
// Mongo persistence is optional; see models for durable cache.
export const memCache = new NodeCache({ stdTTL: 60 * 60 * 24, checkperiod: 60 * 10 }); // 24h

export function cacheKey(parts) {
  return parts
    .map((p) => String(p ?? '').trim().toLowerCase())
    .filter(Boolean)
    .join('::');
}
