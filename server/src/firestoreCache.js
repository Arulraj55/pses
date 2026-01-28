import { getFirestore } from './firebaseAdmin.js';

export async function getCache(key) {
  const db = getFirestore();
  if (!db) return null;
  const snap = await db.collection('topicCache').doc(key).get();
  if (!snap.exists) return null;
  const data = snap.data();

  const expiresAt = data?.expiresAt?.toDate ? data.expiresAt.toDate() : null;
  if (expiresAt && expiresAt.getTime() < Date.now()) return null;

  return data;
}

export async function setCache(key, data, ttlDays) {
  const db = getFirestore();
  if (!db) return;

  const now = new Date();
  const expiresAt = ttlDays ? new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000) : null;

  await db
    .collection('topicCache')
    .doc(key)
    .set(
      {
        ...data,
        updatedAt: new Date(),
        ...(expiresAt ? { expiresAt } : {})
      },
      { merge: true }
    );
}
