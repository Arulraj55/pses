import express from 'express';
import cors from 'cors';
import { env } from './env.js';
import { videoRouter } from './routes/video.js';
import { quizRouter } from './routes/quiz.js';
import { imagesRouter } from './routes/images.js';
import { predictRouter } from './routes/predict.js';
import { mlRouter } from './routes/ml/index.js';
import { usersRouter } from './routes/users.js';
import { authRouter } from './routes/auth.js';
import { activityRouter } from './routes/activity.js';
import { progressRouter } from './routes/progress.js';
import { initFirebaseAdmin } from './firebaseAdmin.js';
import { connectMongo } from './mongo.js';

const app = express();

app.use(
  cors({
    origin: env.corsOrigin,
    credentials: false
  })
);

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'pses-server' });
});

app.use('/api/video', videoRouter);
app.use('/api/quiz', quizRouter);
app.use('/api/images', imagesRouter);
app.use('/api/predict', predictRouter);
app.use('/api/ml', mlRouter);
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/activity', activityRouter);
app.use('/api/progress', progressRouter);

app.use((err, req, res, next) => {
  const status = err.status ?? 500;
  res.status(status).json({
    message: err.message ?? 'Internal error',
    status,
    ...(env.nodeEnv === 'development' ? { details: err.body ?? null, stack: err.stack } : {})
  });
});

// Initialize external services (best-effort). Server should still boot if they are not configured.
try {
  initFirebaseAdmin();
} catch (e) {
  console.warn('Firebase Admin init failed:', e?.message || String(e));
}

try {
  await connectMongo();
} catch (e) {
  console.warn('MongoDB connection failed:', e?.message || String(e));
}

const server = app.listen(env.port, () => {
  console.log(`Server running on http://localhost:${env.port}`);
});

server.on('error', (err) => {
  if (err?.code === 'EADDRINUSE') {
    console.error(`Port ${env.port} is already in use. Stop the other process or change PORT in .env.`);
    process.exitCode = 1;
    return;
  }
  console.error('Server listen error:', err);
  process.exitCode = 1;
});
