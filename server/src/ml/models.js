import path from 'node:path';
import fs from 'node:fs';

/**
 * Helper to load persisted JSON data. When the file does not exist,
 * the provided fallback value is written and returned.
 */
function loadJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(fallback, null, 2), 'utf8');
    return fallback;
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.warn(`Failed to parse model store at ${filePath}, resetting.`, err);
    fs.writeFileSync(filePath, JSON.stringify(fallback, null, 2), 'utf8');
    return fallback;
  }
}

function saveJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

const MODEL_DIR = path.resolve(process.cwd(), 'server', '.model-cache');

const USER_LEVEL_STORE = path.join(MODEL_DIR, 'user-level.json');
const TOPIC_STORE = path.join(MODEL_DIR, 'topic-status.json');
const VIDEO_STORE = path.join(MODEL_DIR, 'video-metrics.json');

const defaultUserLevelData = {
  users: {}
};

const defaultTopicData = {
  topics: {}
};

const defaultVideoData = {
  videos: {}
};

/**
 * Basic decision tree like logic encoded as nested conditions.
 * In production this would call into a proper ML inference endpoint.
 */
export function predictUnderstandingLevel(sample) {
  const store = loadJson(USER_LEVEL_STORE, defaultUserLevelData);
  const { userId = 'unknown_user' } = sample;

  const rules = [];
  if (sample.quizScore >= 0.85 && sample.avgTimePerQuestion <= 12 && sample.videoReplayCount <= 1) {
    rules.push('high-score-fast');
  }
  if (sample.quizScore >= 0.65 && sample.avgTimePerQuestion <= 20) {
    rules.push('steady-performance');
  }
  if (sample.videoReplayCount >= 3 || sample.avgTimePerQuestion >= 30) {
    rules.push('needs-revision');
  }
  if (sample.topicDifficultyRating >= 4 && sample.quizScore >= 0.75) {
    rules.push('tough-topic-handled');
  }

  let label = 'Beginner';
  if (sample.quizScore >= 0.8 && sample.avgTimePerQuestion < 18 && sample.videoReplayCount <= 2) {
    label = 'Advanced';
  } else if (sample.quizScore >= 0.6) {
    label = 'Intermediate';
  }
  if (sample.quizScore < 0.45 || sample.videoReplayCount > 4) {
    label = 'Beginner';
  }

  const confidence = Math.min(0.99, Math.max(0.45, sample.quizScore * (rules.length ? 1.05 : 0.85)));

  store.users[userId] = {
    ...sample,
    predictedLevel: label,
    confidence,
    updatedAt: Date.now()
  };
  saveJson(USER_LEVEL_STORE, store);

  return { label, confidence, rules };
}

/**
 * Rule-based classifier backed by per-topic aggregates.
 */
export function detectWeakConcept(sample) {
  const store = loadJson(TOPIC_STORE, defaultTopicData);
  const key = sample.topicId || sample.topicName || 'unknown_topic';

  const topicEntry = store.topics[key] || {
    avgTopicScore: sample.avgTopicScore,
    incorrectAnswerFrequency: sample.incorrectAnswerFrequency,
    rewatchFrequency: sample.rewatchFrequency,
    samples: 0
  };

  const total = topicEntry.samples + 1;
  topicEntry.avgTopicScore = (topicEntry.avgTopicScore * topicEntry.samples + sample.avgTopicScore) / total;
  topicEntry.incorrectAnswerFrequency = (
    topicEntry.incorrectAnswerFrequency * topicEntry.samples + sample.incorrectAnswerFrequency
  ) / total;
  topicEntry.rewatchFrequency = (topicEntry.rewatchFrequency * topicEntry.samples + sample.rewatchFrequency) / total;
  topicEntry.samples = total;
  store.topics[key] = topicEntry;
  saveJson(TOPIC_STORE, store);

  let status = 'Moderate';
  if (topicEntry.avgTopicScore >= 0.8 && topicEntry.incorrectAnswerFrequency <= 0.2) {
    status = 'Strong';
  } else if (topicEntry.avgTopicScore <= 0.5 || topicEntry.incorrectAnswerFrequency >= 0.35 || topicEntry.rewatchFrequency >= 2) {
    status = 'Weak';
  }

  const clusterHint = (
    topicEntry.avgTopicScore * 0.5
    - topicEntry.incorrectAnswerFrequency * 0.3
    - Math.min(1, topicEntry.rewatchFrequency / 3) * 0.2
  );

  return {
    status,
    aggregates: topicEntry,
    clusterHint
  };
}

/**
 * KNN-like similarity search using cosine distance between learners.
 */
export function recommendTopics(sample) {
  const store = loadJson(TOPIC_STORE, defaultTopicData);
  const vectors = Object.entries(store.topics).map(([topicId, stats]) => ({
    topicId,
    vector: [stats.avgTopicScore, stats.incorrectAnswerFrequency, stats.rewatchFrequency]
  }));

  const target = [sample.avgTopicScore ?? 0.5, sample.incorrectAnswerFrequency ?? 0.3, sample.rewatchFrequency ?? 1];

  function cosineSim(a, b) {
    const dot = a.reduce((acc, val, idx) => acc + val * b[idx], 0);
    const normA = Math.sqrt(a.reduce((acc, val) => acc + val * val, 0));
    const normB = Math.sqrt(b.reduce((acc, val) => acc + val * val, 0));
    if (!normA || !normB) return 0;
    return dot / (normA * normB);
  }

  const scored = vectors
    .map((v) => ({ topicId: v.topicId, score: cosineSim(target, v.vector) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  return {
    recommendations: scored,
    totalTopics: vectors.length
  };
}

/**
 * Linear regression-like scoring with simple feature weights.
 */
export function scoreVideoEffectiveness(sample) {
  const store = loadJson(VIDEO_STORE, defaultVideoData);
  const key = sample.videoId || 'unknown_video';
  const entry = store.videos[key] || {
    avgPostQuiz: sample.avgPostQuiz,
    completionRate: sample.completionRate,
    rewatchRate: sample.rewatchRate,
    feedback: sample.feedbackRating,
    samples: 0
  };

  const total = entry.samples + 1;
  entry.avgPostQuiz = (entry.avgPostQuiz * entry.samples + sample.avgPostQuiz) / total;
  entry.completionRate = (entry.completionRate * entry.samples + sample.completionRate) / total;
  entry.rewatchRate = (entry.rewatchRate * entry.samples + sample.rewatchRate) / total;
  entry.feedback = (entry.feedback * entry.samples + sample.feedbackRating) / total;
  entry.samples = total;

  store.videos[key] = entry;
  saveJson(VIDEO_STORE, store);

  const effectiveness = Math.max(
    0,
    Math.min(
      100,
      entry.avgPostQuiz * 100 * 0.45 + entry.completionRate * 100 * 0.25 - entry.rewatchRate * 10 + entry.feedback * 10
    )
  );

  return {
    effectiveness,
    aggregates: entry
  };
}
