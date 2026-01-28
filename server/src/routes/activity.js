import express from 'express';
import { requireAuth } from '../auth.js';
import { getFirestore } from '../firebaseAdmin.js';
import { localCompleteSession, localSaveAttempt, localStartSession } from '../storage/progressStore.js';

export const activityRouter = express.Router();

activityRouter.post('/sessions/start', requireAuth, express.json(), async (req, res, next) => {
  try {
    const { section, topic, language, videoId } = req.body ?? {};
    if (!section || !topic || !language || !videoId) {
      return res.status(400).json({ message: 'section, topic, language, videoId are required' });
    }

    const db = getFirestore();
    if (db) {
      const doc = await db.collection('learningSessions').add({
        uid: req.user.uid,
        section,
        topic,
        language,
        videoId,
        replayCount: 0,
        videoStartedAt: new Date(),
        createdAt: new Date()
      });
      return res.json({ sessionId: doc.id });
    }

    const sessionId = localStartSession(req.user.uid, {
      section,
      topic,
      language,
      videoId,
      replayCount: 0,
      videoStartedAt: new Date().toISOString()
    });
    res.json({ sessionId });
  } catch (e) {
    next(e);
  }
});

activityRouter.post('/sessions/complete', requireAuth, express.json(), async (req, res, next) => {
  try {
    const { sessionId, replayCount } = req.body ?? {};
    if (!sessionId) return res.status(400).json({ message: 'sessionId is required' });

    const db = getFirestore();
    if (db) {
      await db
        .collection('learningSessions')
        .doc(String(sessionId))
        .set(
          {
            uid: req.user.uid,
            replayCount: Number(replayCount ?? 0),
            videoCompletedAt: new Date(),
            updatedAt: new Date()
          },
          { merge: true }
        );
      return res.json({ ok: true });
    }

    localCompleteSession(req.user.uid, String(sessionId), {
      replayCount: Number(replayCount ?? 0),
      videoCompletedAt: new Date().toISOString()
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

activityRouter.post('/attempts', requireAuth, express.json(), async (req, res, next) => {
  try {
    const payload = req.body ?? {};

    const required = ['section', 'topic', 'language', 'score', 'timePerQuestionSec', 'perceivedDifficulty', 'videoReplays', 'predictedLevel'];
    for (const k of required) {
      if (payload[k] === undefined || payload[k] === null || payload[k] === '') {
        return res.status(400).json({ message: `${k} is required` });
      }
    }

    const db = getFirestore();
    if (db) {
      const doc = await db.collection('quizAttempts').add({
        uid: req.user.uid,
        ...payload,
        createdAt: new Date()
      });
      return res.json({ attemptId: doc.id });
    }

    const attemptId = localSaveAttempt(req.user.uid, payload);
    res.json({ attemptId });
  } catch (e) {
    next(e);
  }
});
