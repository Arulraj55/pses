import express from 'express';
import { requireAuth } from '../auth.js';
import { getFirestore } from '../firebaseAdmin.js';
import { localProgressSummary } from '../storage/progressStore.js';

export const progressRouter = express.Router();

progressRouter.get('/summary', requireAuth, async (req, res, next) => {
  try {
    const db = getFirestore();
    const uid = req.user.uid;

    if (!db) {
      const summary = localProgressSummary(uid);
      return res.json(summary);
    }

    const attemptsSnap = await db
      .collection('quizAttempts')
      .where('uid', '==', uid)
      .orderBy('createdAt', 'desc')
      .limit(25)
      .get();

    const attempts = attemptsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const sessionsSnap = await db
      .collection('learningSessions')
      .where('uid', '==', uid)
      .get();

    const sessions = sessionsSnap.docs.map((d) => d.data());
    const completedSessions = sessions.filter((s) => Boolean(s.videoCompletedAt)).length;

    const avgScore = attempts.length
      ? attempts.reduce((sum, a) => sum + Number(a.score ?? 0), 0) / attempts.length
      : 0;

    const weakCounts = new Map();
    for (const a of attempts) {
      const weak = Array.isArray(a.weakConcepts) ? a.weakConcepts : [];
      for (const c of weak) weakCounts.set(c, (weakCounts.get(c) || 0) + 1);
    }
    const topWeak = [...weakCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([concept, count]) => ({ concept, count }));

    res.json({
      completedSessions,
      attemptsCount: attempts.length,
      avgScore,
      recentAttempts: attempts.slice(0, 10).map((a) => ({
        id: a.id,
        topic: a.topic,
        language: a.language,
        score: a.score,
        predictedLevel: a.predictedLevel,
        confidence: a.confidence,
        createdAt: a.createdAt
      })),
      topWeak
    });
  } catch (e) {
    next(e);
  }
});
