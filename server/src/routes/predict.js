import express from 'express';
import { predictUnderstandingLevel } from '../ml/models.js';

export const predictRouter = express.Router();

predictRouter.post('/', express.json(), async (req, res, next) => {
  try {
    const payload = req.body ?? {};
    const times = Array.isArray(payload.timePerQuestionSec)
      ? payload.timePerQuestionSec.map((t) => Number(t) || 0)
      : [];
    const avgTime = times.length ? times.reduce((a, b) => a + b, 0) / times.length : 0;
    const variance = times.length
      ? times.reduce((acc, t) => acc + Math.pow(t - avgTime, 2), 0) / times.length
      : 0;
    const stdDev = Math.sqrt(variance);

    const quizScore = Number(payload.quizScore ?? 0);
    const videoReplays = Number(payload.videoReplays ?? 0);
    const perceivedDifficulty = Number(payload.perceivedDifficulty ?? 3);

    const prediction = predictUnderstandingLevel({
      userId: payload.userId,
      quizScore,
      avgTimePerQuestion: avgTime,
      videoReplayCount: videoReplays,
      topicDifficultyRating: perceivedDifficulty
    });

    res.json({
      level: prediction.label,
      confidence: prediction.confidence,
      rules: prediction.rules,
      features: {
        quizScore,
        avgTimeSec: avgTime,
        timeStdSec: stdDev,
        videoReplays,
        perceivedDifficulty
      }
    });
  } catch (e) {
    next(e);
  }
});
