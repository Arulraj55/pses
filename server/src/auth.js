import { Buffer } from 'node:buffer';
import { getAdmin, isFirebaseAdminConfigured } from './firebaseAdmin.js';
import jwt from 'jsonwebtoken';
import { env } from './env.js';

function decodeJwtUnverified(token) {
  const parts = token?.split?.('.') ?? [];
  if (parts.length < 2) throw new Error('Malformed token');
  const payload = parts[1];
  const json = Buffer.from(payload, 'base64url').toString('utf8');
  return JSON.parse(json);
}

function extractBearer(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
}

function verifySessionToken(token) {
  if (!env.jwtSecret) return null;
  try {
    const decoded = jwt.verify(token, env.jwtSecret);
    return {
      uid: decoded.sub || decoded.uid || decoded.username || 'mongo-user',
      email: decoded.email ?? null,
      emailVerified: decoded.email_verified ?? true,
      signInProvider: (decoded.providers && decoded.providers[0]) || 'password'
    };
  } catch {
    return null;
  }
}

export function requireAuthAny(req, res, next) {
  const token = extractBearer(req);
  if (!token) return res.status(401).json({ message: 'Missing Authorization: Bearer <token>' });

  // Prefer verifying our own Mongo session JWT first when available.
  const sessionUser = verifySessionToken(token);
  if (sessionUser) {
    req.user = sessionUser;
    return next();
  }

  if (!isFirebaseAdminConfigured()) {
    try {
      const decoded = decodeJwtUnverified(token);
      req.user = {
        uid: decoded.user_id || decoded.sub || 'local-dev-user',
        email: decoded.email ?? null,
        emailVerified: decoded.email_verified ?? true,
        signInProvider: decoded?.firebase?.sign_in_provider ?? null
      };
      return next();
    } catch (err) {
      return res.status(401).json({ message: 'Invalid token (dev mode)', details: err?.message || String(err) });
    }
  }

  const admin = getAdmin();
  admin
    .auth()
    .verifyIdToken(token)
    .then((decoded) => {
      if (!decoded?.uid) return res.status(401).json({ message: 'Invalid token' });
      if (decoded.email_verified === false) {
        return res.status(403).json({ message: 'Email not verified' });
      }
      req.user = {
        uid: decoded.uid,
        email: decoded.email ?? null,
        emailVerified: decoded.email_verified ?? null,
        signInProvider: decoded?.firebase?.sign_in_provider ?? null
      };
      next();
    })
    .catch((err) => {
      // If Firebase verification fails, attempt session JWT verification (e.g., user logged in via Mongo).
      const fallback = verifySessionToken(token);
      if (fallback) {
        req.user = fallback;
        return next();
      }
      res.status(401).json({ message: 'Unauthorized', details: err?.message || String(err) });
    });
}

// Best-effort auth. If Firebase Admin isn't configured or the token is missing/invalid,
// it proceeds with `req.user = null`.
export function requireAuthOptional(req, res, next) {
  const token = extractBearer(req);
  if (!token) {
    req.user = null;
    return next();
  }

  const sessionUser = verifySessionToken(token);
  if (sessionUser) {
    req.user = sessionUser;
    return next();
  }

  if (!isFirebaseAdminConfigured()) {
    try {
      const decoded = decodeJwtUnverified(token);
      req.user = {
        uid: decoded.user_id || decoded.sub || 'local-dev-user',
        email: decoded.email ?? null,
        emailVerified: decoded.email_verified ?? true
      };
      return next();
    } catch {
      req.user = null;
      return next();
    }
  }

  const admin = getAdmin();
  admin
    .auth()
    .verifyIdToken(token)
    .then((decoded) => {
      if (!decoded?.uid) {
        req.user = null;
        return next();
      }
      req.user = {
        uid: decoded.uid,
        email: decoded.email ?? null,
        emailVerified: decoded.email_verified ?? null
      };
      next();
    })
    .catch(() => {
      // If Firebase verification fails, allow session JWTs.
      req.user = verifySessionToken(token);
      next();
    });
}

export function requireAuth(req, res, next) {
  return requireAuthAny(req, res, () => {
    if (req.user?.emailVerified === false) {
      return res.status(403).json({ message: 'Email not verified' });
    }
    next();
  });
}
