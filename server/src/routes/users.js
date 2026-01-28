import express from 'express';
import { requireAuth, requireAuthAny, requireAuthOptional } from '../auth.js';
import { getFirestore } from '../firebaseAdmin.js';
import { isMongoConnected } from '../mongo.js';
import { UserProfile } from '../models/UserProfile.js';
import { UsernameMapping } from '../models/UsernameMapping.js';
import { PendingUser } from '../models/PendingUser.js';
import { UserAuth } from '../models/UserAuth.js';
import bcrypt from 'bcryptjs';

export const usersRouter = express.Router();

usersRouter.get('/me', requireAuthOptional, async (req, res, next) => {
  try {
    if (!req.user) {
      return res.json({
        uid: null,
        email: null,
        profile: null,
        warning:
          'Server Firebase Admin is not configured. Set FIREBASE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS to enable profiles/progress.'
      });
    }

    const db = getFirestore();
    const uid = req.user.uid;

    if (db) {
      const snap = await db.collection('users').doc(uid).get();
      const profile = snap.exists ? snap.data() : null;
      return res.json({ uid, email: req.user.email, profile });
    }

    if (isMongoConnected()) {
      let doc = await UserProfile.findOne({ uid }).lean();
      // Backfill: if profile exists but verified is missing/false and we already have a username mapping,
      // treat the account as verified. This prevents login gating issues after migrations.
      if (doc && !doc.verified) {
        const hasMapping = await UsernameMapping.findOne({ uid }).lean();
        if (hasMapping) {
          await UserProfile.updateOne({ uid }, { $set: { verified: true } });
          doc = { ...doc, verified: true };
        }
      }
      const profile = doc
        ? {
            username: doc.username ?? null,
            preferredLanguage: doc.preferredLanguage ?? null,
            spokenLanguage: doc.spokenLanguage ?? null,
            spokenLanguageSecondary: doc.spokenLanguageSecondary ?? null,
            verified: Boolean(doc.verified),
            updatedAt: doc.updatedAt ?? null,
            createdAt: doc.createdAt ?? null
          }
        : null;
      return res.json({ uid, email: req.user.email, profile });
    }

    return res.status(503).json({
      message: 'No persistence configured. Set MONGODB_URI or Firebase Admin credentials.',
      status: 503
    });
  } catch (e) {
    next(e);
  }
});

// Step 1: pre-register user data in Mongo (no Firebase account yet)
usersRouter.post('/pre-register', express.json(), async (req, res, next) => {
  try {
    if (!isMongoConnected()) {
      return res.status(503).json({ message: 'MongoDB is not available. Set MONGODB_URI.' });
    }

    const username = String(req.body?.username ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '').trim();
    const preferredLanguage = String(req.body?.preferredLanguage ?? '').trim();
    const spokenLanguage = String(req.body?.spokenLanguage ?? '').trim();
    const spokenLanguageSecondary = String(req.body?.spokenLanguageSecondary ?? '').trim();

    if (!username) return res.status(400).json({ message: 'username is required' });
    if (!password || password.length < 6) return res.status(400).json({ message: 'password must be at least 6 characters' });
    if (!preferredLanguage) return res.status(400).json({ message: 'preferredLanguage is required' });

    const passwordHash = await bcrypt.hash(password, 10);

    const usernameTaken = await UsernameMapping.findOne({ username }).lean();
    if (usernameTaken) {
      return res.status(409).json({ message: 'Username already taken. Choose another.' });
    }

    const existingPending = await PendingUser.findOne({ username }).lean();
    if (existingPending) {
      await PendingUser.updateOne(
        { username },
        {
          $set: {
            passwordHash,
            preferredLanguage,
            spokenLanguage: spokenLanguage || null,
            spokenLanguageSecondary: spokenLanguageSecondary || null
          }
        }
      );
      return res.json({ ok: true, username, pending: true });
    }

    await PendingUser.create({
      username,
      passwordHash,
      preferredLanguage,
      spokenLanguage: spokenLanguage || null,
      spokenLanguageSecondary: spokenLanguageSecondary || null,
      verified: false
    });

    res.json({ ok: true, username, pending: true });
  } catch (e) {
    next(e);
  }
});

usersRouter.post('/profile', requireAuth, express.json(), async (req, res, next) => {
  try {
    const preferredLanguage = String(req.body?.preferredLanguage ?? '').trim();
    const username = String(req.body?.username ?? '').trim();
    const spokenLanguage = String(req.body?.spokenLanguage ?? '').trim();
    const spokenLanguageSecondary = String(req.body?.spokenLanguageSecondary ?? '').trim();
    if (!preferredLanguage) return res.status(400).json({ message: 'preferredLanguage is required' });

    if (!username) {
      return res.status(400).json({ message: 'username is required' });
    }

    const db = getFirestore();
    const uid = req.user.uid;
    const normalizedUsername = username.toLowerCase();

    if (db) {
      await db
        .collection('users')
        .doc(uid)
        .set(
          {
            email: req.user.email,
            username: normalizedUsername,
            preferredLanguage,
            spokenLanguage: spokenLanguage || null,
            spokenLanguageSecondary: spokenLanguageSecondary || null,
            updatedAt: new Date(),
            createdAt: new Date()
          },
          { merge: true }
        );

      return res.json({ ok: true, username: normalizedUsername });
    }

    if (isMongoConnected()) {
      await UserProfile.updateOne(
        { uid },
        {
          $set: {
            email: req.user.email ?? null,
            username: normalizedUsername,
            preferredLanguage,
            spokenLanguage: spokenLanguage || null,
            spokenLanguageSecondary: spokenLanguageSecondary || null
          },
          $setOnInsert: { uid }
        },
        { upsert: true }
      );
      return res.json({ ok: true, username: normalizedUsername });
    }

    return res.status(503).json({
      message: 'MongoDB is not available. Set MONGODB_URI to enable profile storage.',
      status: 503
    });
  } catch (e) {
    next(e);
  }
});

// Step 2: after Firebase verification/sign-in, mark user verified and persist profile/username
usersRouter.post('/mark-verified', requireAuth, express.json(), async (req, res, next) => {
  try {
    if (!isMongoConnected()) {
      return res.status(503).json({ message: 'MongoDB is not available. Set MONGODB_URI.' });
    }

    const username = String(req.body?.username ?? '').trim().toLowerCase();
    const preferredLanguage = String(req.body?.preferredLanguage ?? '').trim();
    const spokenLanguage = String(req.body?.spokenLanguage ?? '').trim();
    const spokenLanguageSecondary = String(req.body?.spokenLanguageSecondary ?? '').trim();
    const emailFromToken = req.user.email || `${username}@pses.local`;
    const providerFromToken = req.user?.signInProvider ?? null;

    if (!username) return res.status(400).json({ message: 'username is required' });
    if (!preferredLanguage) return res.status(400).json({ message: 'preferredLanguage is required' });

    const pending = await PendingUser.findOne({ username }).lean();
    // Allow finalization even if pending doc is missing but mapping exists for this uid
    const usernameForUid = await UsernameMapping.findOne({ uid: req.user.uid }).lean();
    if (!pending && !usernameForUid) {
      return res.status(404).json({ message: 'Pending signup not found for this username.' });
    }

    const existingMapping = await UsernameMapping.findOne({ username }).lean();
    if (existingMapping && existingMapping.uid !== req.user.uid) {
      return res.status(409).json({ message: 'Username already mapped to another account.' });
    }

    await UsernameMapping.updateOne(
      { username },
      {
        $set: {
          uid: req.user.uid,
          email: emailFromToken,
          provider: providerFromToken
        },
        $setOnInsert: { username }
      },
      { upsert: true }
    );

    await UserProfile.updateOne(
      { uid: req.user.uid },
      {
        $set: {
          email: emailFromToken,
          username,
          preferredLanguage,
          spokenLanguage: spokenLanguage || null,
          spokenLanguageSecondary: spokenLanguageSecondary || null,
          verified: true
        },
        $setOnInsert: { uid: req.user.uid }
      },
      { upsert: true }
    );

    // If this is a password-based signup, persist credentials in UserAuth.
    if (pending?.passwordHash) {
      await UserAuth.updateOne(
        { username },
        {
          $set: {
            passwordHash: pending.passwordHash,
            verified: true,
            email: emailFromToken,
            providers: ['password']
          },
          $setOnInsert: { username }
        },
        { upsert: true }
      );
    }

    if (pending) {
      await PendingUser.updateOne({ username }, { $set: { verified: true } });
    }

    res.json({ ok: true, verified: true });
  } catch (e) {
    next(e);
  }
});

usersRouter.post('/register-username', requireAuth, express.json(), async (req, res, next) => {
  try {
    const username = String(req.body?.username ?? '').trim();
    const email = String(req.body?.email ?? '').trim();
    if (!username) return res.status(400).json({ message: 'username is required' });
    if (!email) return res.status(400).json({ message: 'email is required' });

    let savedRecord;
    const normalizedUsername = username.toLowerCase();
    const db = getFirestore();

    if (db) {
      await db.runTransaction(async (tx) => {
        const usernameDoc = db.collection('usernames').doc(normalizedUsername);
        const snap = await tx.get(usernameDoc);
        if (snap.exists && snap.data().uid !== req.user.uid) {
          const err = new Error('USERNAME_CONFLICT');
          err.status = 409;
          throw err;
        }
        tx.set(usernameDoc, {
          uid: req.user.uid,
          email,
          username: normalizedUsername,
          updatedAt: new Date(),
          createdAt: snap.exists ? snap.data().createdAt : new Date()
        });
        const profileDoc = db.collection('users').doc(req.user.uid);
        tx.set(
          profileDoc,
          { email, username: normalizedUsername, updatedAt: new Date() },
          { merge: true }
        );
      });
      savedRecord = { username: normalizedUsername, email, uid: req.user.uid };
      return res.json({ ok: true, username: savedRecord.username });
    }

    if (isMongoConnected()) {
      const existing = await UsernameMapping.findOne({ username: normalizedUsername }).lean();
      if (existing && existing.uid !== req.user.uid) {
        return res.status(409).json({ message: 'Username already taken. Please choose another one.' });
      }

      await UsernameMapping.updateOne(
        { username: normalizedUsername },
        {
          $set: { uid: req.user.uid, email },
          $setOnInsert: { username: normalizedUsername }
        },
        { upsert: true }
      );

      await UserProfile.updateOne(
        { uid: req.user.uid },
        {
          $set: {
            email,
            username: normalizedUsername
          },
          $setOnInsert: { uid: req.user.uid }
        },
        { upsert: true }
      );

      savedRecord = { username: normalizedUsername, email, uid: req.user.uid };
      return res.json({ ok: true, username: savedRecord.username });
    }

    return res.status(503).json({
      message: 'MongoDB is not available. Set MONGODB_URI to enable username registration.',
      status: 503
    });
  } catch (e) {
    if (e.code === 'USERNAME_CONFLICT' || e.status === 409) {
      return res.status(409).json({ message: 'Username already taken. Please choose another one.' });
    }
    next(e);
  }
});

usersRouter.post('/resolve-username', express.json(), async (req, res, next) => {
  try {
    const username = String(req.body?.username ?? '').trim();
    if (!username) return res.status(400).json({ message: 'username is required' });

    const db = getFirestore();
    if (db) {
      const snap = await db.collection('usernames').doc(username.toLowerCase()).get();
      if (!snap.exists) return res.status(404).json({ message: 'Not found' });
      return res.json({ username: snap.id, uid: snap.data().uid, email: snap.data().email, provider: snap.data().provider ?? null });
    }

    if (isMongoConnected()) {
      const normalized = username.toLowerCase();
      const doc = await UsernameMapping.findOne({ username: normalized }).lean();
      if (!doc) return res.status(404).json({ message: 'Not found' });
      return res.json({ username: doc.username, uid: doc.uid, email: doc.email, provider: doc.provider ?? null });
    }

    return res.status(503).json({
      message: 'MongoDB is not available. Set MONGODB_URI to enable username lookup.',
      status: 503
    });
  } catch (e) {
    next(e);
  }
});
