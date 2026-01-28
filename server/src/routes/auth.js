import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import nodemailer from 'nodemailer';
import { env } from '../env.js';
import { isMongoConnected } from '../mongo.js';
import { UserAuth } from '../models/UserAuth.js';
import { UserProfile } from '../models/UserProfile.js';
import { UsernameMapping } from '../models/UsernameMapping.js';

export const authRouter = express.Router();

function signSession(payload) {
  if (!env.jwtSecret) {
    const err = new Error('JWT_SECRET is not configured');
    err.status = 500;
    throw err;
  }
  return jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
}

function sha256Base64Url(input) {
  return crypto.createHash('sha256').update(String(input)).digest('base64url');
}

function buildResetLink(token) {
  const base = String(env.appBaseUrl || '').replace(/\/$/, '');
  const url = new URL(base || 'http://localhost:5173');
  url.searchParams.set('resetToken', token);
  return url.toString();
}

function getMailer() {
  if (!env.smtpHost || !env.smtpPort || !env.smtpUser || !env.smtpPass || !env.smtpFrom) return null;
  return nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpPort === 465,
    auth: {
      user: env.smtpUser,
      pass: env.smtpPass
    }
  });
}

authRouter.post('/login', express.json(), async (req, res, next) => {
  try {
    if (!isMongoConnected()) {
      return res.status(503).json({ message: 'MongoDB is not available. Set MONGODB_URI.' });
    }

    const username = String(req.body?.username ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '').trim();
    if (!username) return res.status(400).json({ message: 'username is required' });
    if (!password) return res.status(400).json({ message: 'password is required' });

    const auth = await UserAuth.findOne({ username }).lean();
    console.log('[login] Found UserAuth for %s: id=%s, hasPasswordHash=%s', username, auth?._id, Boolean(auth?.passwordHash));
    if (!auth?.passwordHash) {
      return res.status(401).json({ message: 'Invalid username/password.' });
    }

    const ok = await bcrypt.compare(password, auth.passwordHash);
    console.log('[login] Password compare result for %s: %s', username, ok);
    if (!ok) return res.status(401).json({ message: 'Invalid username/password.' });

    const profile = await UserProfile.findOne({ username }).lean();
    if (!profile?.verified) {
      return res.status(403).json({ message: 'Account not verified yet.' });
    }

    const token = signSession({
      sub: profile.uid || auth._id?.toString?.() || username,
      username,
      email: profile.email ?? auth.email ?? null,
      email_verified: true,
      providers: auth.providers ?? ['password']
    });

    res.json({ ok: true, token, user: { username, email: profile.email ?? auth.email ?? null } });
  } catch (e) {
    next(e);
  }
});

// Step 1: request reset link (sent to email). This updates Mongo only (UserAuth).
authRouter.post('/request-password-reset', express.json(), async (req, res, next) => {
  try {
    if (!isMongoConnected()) {
      return res.status(503).json({ message: 'MongoDB is not available. Set MONGODB_URI.' });
    }

    const username = String(req.body?.username ?? '').trim().toLowerCase();
    if (!username) return res.status(400).json({ message: 'username is required' });

    const profile = await UserProfile.findOne({ username }).lean();
    if (!profile?.verified) {
      return res.status(403).json({ message: 'Account not verified yet.' });
    }

    const email = profile.email;
    if (!email) {
      return res.status(400).json({ message: 'No email is linked to this account.' });
    }

    // Ensure a UserAuth record exists.
    const auth = await UserAuth.findOne({ username });
    const authDoc = auth || (await UserAuth.create({ username, email, verified: true, providers: ['password'] }));

    // Sign a short-lived reset token.
    if (!env.jwtSecret) return res.status(500).json({ message: 'JWT_SECRET is not configured' });
    const now = Date.now();
    const expMs = 1000 * 60 * 30; // 30 minutes
    const jti = crypto.randomBytes(16).toString('hex');
    const token = jwt.sign({ typ: 'pwreset', username, jti }, env.jwtSecret, { expiresIn: Math.floor(expMs / 1000) });

    authDoc.resetTokenHash = sha256Base64Url(token);
    authDoc.resetTokenExpiresAt = new Date(now + expMs);
    if (!authDoc.email) authDoc.email = email;
    await authDoc.save();

    const link = buildResetLink(token);
    const transporter = getMailer();

    if (!transporter) {
      return res.json({ ok: true, devLink: link, warning: 'SMTP not configured; returning link in response.' });
    }

    await transporter.sendMail({
      from: env.smtpFrom,
      to: email,
      subject: 'Reset your PSES password',
      text: `Click this link to reset your password (valid for 30 minutes):\n\n${link}\n\nIf you did not request this, ignore this email.`
    });

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// Step 2: finalize reset using token + new password (updates Mongo UserAuth only).
authRouter.post('/reset-password', express.json(), async (req, res, next) => {
  try {
    if (!isMongoConnected()) {
      return res.status(503).json({ message: 'MongoDB is not available. Set MONGODB_URI.' });
    }

    const token = String(req.body?.token ?? '').trim();
    const newPassword = String(req.body?.newPassword ?? '').trim();
    if (!token) return res.status(400).json({ message: 'token is required' });
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ message: 'newPassword must be at least 6 characters' });
    }
    if (!env.jwtSecret) return res.status(500).json({ message: 'JWT_SECRET is not configured' });

    let decoded;
    try {
      decoded = jwt.verify(token, env.jwtSecret);
    } catch {
      return res.status(400).json({ message: 'Invalid or expired reset link.' });
    }

    if (decoded?.typ !== 'pwreset' || !decoded?.username) {
      return res.status(400).json({ message: 'Invalid reset link.' });
    }

    const username = String(decoded.username).toLowerCase();
    const auth = await UserAuth.findOne({ username });
    if (!auth?.resetTokenHash || !auth?.resetTokenExpiresAt) {
      return res.status(400).json({ message: 'Reset link is no longer valid. Please request a new one.' });
    }
    if (auth.resetTokenExpiresAt.getTime() < Date.now()) {
      return res.status(400).json({ message: 'Reset link has expired. Please request a new one.' });
    }
    if (auth.resetTokenHash !== sha256Base64Url(token)) {
      return res.status(400).json({ message: 'Reset link is invalid. Please request a new one.' });
    }

    console.log('[reset-password] BEFORE update:', { username, passwordHash: auth.passwordHash });
    auth.passwordHash = await bcrypt.hash(newPassword, 10);
    auth.resetTokenHash = null;
    auth.resetTokenExpiresAt = null;
    if (!auth.providers?.includes('password')) {
      auth.providers = [...(auth.providers || []), 'password'];
    }
    await auth.save();
    console.log('[reset-password] AFTER update:', { username, passwordHash: auth.passwordHash });

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// Use this when Firebase sent the reset email, the client verified the oobCode, and we just need to
// persist the new password in Mongo by email.
authRouter.post('/reset-password-firebase', express.json(), async (req, res, next) => {
  try {
    console.log('[reset-password-firebase] Request body:', JSON.stringify(req.body, null, 2));
    if (!isMongoConnected()) {
      console.log('[reset-password-firebase] MongoDB not connected');
      return res.status(503).json({ message: 'MongoDB is not available. Set MONGODB_URI.' });
    }

    const email = String(req.body?.email || '').trim().toLowerCase();
    const usernameFromBody = String(req.body?.username || '').trim().toLowerCase();
    const newPassword = String(req.body?.newPassword || '').trim();
    console.log('[reset-password-firebase] Parsed: email=%s, username=%s, passwordLen=%d', email, usernameFromBody, newPassword.length);
    if (!email && !usernameFromBody) {
      return res.status(400).json({ message: 'email or username is required' });
    }
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ message: 'newPassword must be at least 6 characters' });
    }

    // Find the user by email or username, then update UserAuth.
    let resolvedUsername = usernameFromBody;
    if (!resolvedUsername && email) {
      const profile = await UserProfile.findOne({ email }).lean();
      if (!profile) {
        const emailRegex = new RegExp(`^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
        const profileInsensitive = await UserProfile.findOne({ email: emailRegex }).lean();
        if (profileInsensitive?.username) {
          resolvedUsername = String(profileInsensitive.username).toLowerCase();
        }
      } else if (profile?.username) {
        resolvedUsername = String(profile.username).toLowerCase();
      }
    }

    if (!resolvedUsername && email) {
      const emailRegex = new RegExp(`^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
      const mapping = await UsernameMapping.findOne({ email: emailRegex }).lean();
      if (mapping?.username) {
        resolvedUsername = String(mapping.username).toLowerCase();
      }
    }
    console.log('[reset-password-firebase] resolvedUsername:', resolvedUsername || '(none)');

    const passwordHash = await bcrypt.hash(newPassword, 10);

    const matchFilters = [];
    if (resolvedUsername) matchFilters.push({ username: resolvedUsername });
    if (email) {
      const emailRegex = new RegExp(`^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
      matchFilters.push({ email: emailRegex });
    }

    let updateResult = { matchedCount: 0, modifiedCount: 0 };
    console.log('[reset-password-firebase] matchFilters:', JSON.stringify(matchFilters));
    if (matchFilters.length > 0) {
      // Log before update
      const beforeDocs = await UserAuth.find({ $or: matchFilters }).lean();
      console.log('[reset-password-firebase] BEFORE update:', beforeDocs.map(d => ({ username: d.username, passwordHash: d.passwordHash })));
      updateResult = await UserAuth.updateMany(
        { $or: matchFilters },
        {
          $set: {
            passwordHash,
            resetTokenHash: null,
            resetTokenExpiresAt: null,
            ...(email ? { email } : {}),
            providers: ['password']
          }
        }
      );
      // Log after update
      const afterDocs = await UserAuth.find({ $or: matchFilters }).lean();
      console.log('[reset-password-firebase] AFTER update:', afterDocs.map(d => ({ username: d.username, passwordHash: d.passwordHash })));
    }
    console.log('[reset-password-firebase] updateResult: matched=%d, modified=%d', updateResult.matchedCount, updateResult.modifiedCount);

    if (updateResult.matchedCount > 0) {
      const updated = resolvedUsername
        ? await UserAuth.findOne({ username: resolvedUsername }).lean()
        : await UserAuth.findOne({ email: new RegExp(`^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }).lean();
      return res.json({ ok: true, username: updated?.username || resolvedUsername, updated: updateResult.modifiedCount });
    }

    if (!resolvedUsername) {
      return res.status(404).json({ message: 'Credentials not found for this account.' });
    }

    const created = await UserAuth.create({
      username: resolvedUsername,
      passwordHash,
      email: email || null,
      verified: true,
      providers: ['password']
    });

    res.json({ ok: true, username: created.username, created: true });
  } catch (e) {
    next(e);
  }
});

authRouter.get('/me', async (req, res) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
  if (!token || !env.jwtSecret) return res.status(401).json({ message: 'Unauthorized' });
  try {
    const decoded = jwt.verify(token, env.jwtSecret);
    res.json({
      ok: true,
      user: {
        username: decoded.username ?? null,
        email: decoded.email ?? null,
        providers: decoded.providers ?? []
      }
    });
  } catch {
    res.status(401).json({ message: 'Unauthorized' });
  }
});

authRouter.post('/change-password', express.json(), async (req, res, next) => {
  try {
    if (!isMongoConnected()) {
      return res.status(503).json({ message: 'MongoDB is not available. Set MONGODB_URI.' });
    }

    const username = String(req.body?.username ?? '').trim().toLowerCase();
    const oldPassword = String(req.body?.oldPassword ?? '').trim();
    const newPassword = String(req.body?.newPassword ?? '').trim();

    if (!username) return res.status(400).json({ message: 'username is required' });
    if (!oldPassword) return res.status(400).json({ message: 'oldPassword is required' });
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ message: 'newPassword must be at least 6 characters' });
    }

    const auth = await UserAuth.findOne({ username });
    if (!auth?.passwordHash) {
      return res.status(401).json({ message: 'Invalid username/password.' });
    }

    const ok = await bcrypt.compare(oldPassword, auth.passwordHash);
    if (!ok) return res.status(401).json({ message: 'Invalid username/password.' });

    const newHash = await bcrypt.hash(newPassword, 10);
    auth.passwordHash = newHash;
    await auth.save();

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
