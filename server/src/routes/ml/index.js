import express from 'express';
import {
  detectWeakConcept,
  predictUnderstandingLevel,
  recommendTopics,
  scoreVideoEffectiveness
} from '../../ml/models.js';

export const mlRouter = express.Router();

mlRouter.post('/understanding', express.json(), (req, res) => {
  const body = req.body || {};
  const prediction = predictUnderstandingLevel({
    userId: body.userId,
    quizScore: Number(body.quizScore ?? 0),
    avgTimePerQuestion: Number(body.avgTimePerQuestion ?? 0),
    videoReplayCount: Number(body.videoReplayCount ?? 0),
    topicDifficultyRating: Number(body.topicDifficultyRating ?? 3)
  });
  res.json(prediction);
});

mlRouter.post('/weak-concepts', express.json(), (req, res) => {
  const body = req.body || {};
  const status = detectWeakConcept({
    topicId: body.topicId,
    topicName: body.topicName,
    avgTopicScore: Number(body.avgTopicScore ?? 0.5),
    incorrectAnswerFrequency: Number(body.incorrectAnswerFrequency ?? 0.3),
    rewatchFrequency: Number(body.rewatchFrequency ?? 1)
  });
  res.json(status);
});

mlRouter.post('/recommendations', express.json(), (req, res) => {
  const body = req.body || {};
  const recos = recommendTopics({
    avgTopicScore: Number(body.avgTopicScore ?? 0.5),
    incorrectAnswerFrequency: Number(body.incorrectAnswerFrequency ?? 0.3),
    rewatchFrequency: Number(body.rewatchFrequency ?? 1)
  });
  res.json(recos);
});

mlRouter.post('/video-effectiveness', express.json(), (req, res) => {
  const body = req.body || {};
  const score = scoreVideoEffectiveness({
    videoId: body.videoId,
    avgPostQuiz: Number(body.avgPostQuiz ?? 0.6),
    completionRate: Number(body.completionRate ?? 0.75),
    rewatchRate: Number(body.rewatchRate ?? 1),
    feedbackRating: Number(body.feedbackRating ?? 3.5)
  });
  res.json(score);
});
