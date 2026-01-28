import fs from 'node:fs';
import path from 'node:path';

const STORE_PATH = path.resolve(process.cwd(), 'server', '.username-store.json');
const defaultStore = { usernames: [] };

const cloneDefault = () => JSON.parse(JSON.stringify(defaultStore));

function ensureStoreDir() {
  const dir = path.dirname(STORE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readStore() {
  try {
    if (!fs.existsSync(STORE_PATH)) {
      ensureStoreDir();
      fs.writeFileSync(STORE_PATH, JSON.stringify(defaultStore, null, 2), 'utf8');
      return cloneDefault();
    }
    const raw = fs.readFileSync(STORE_PATH, 'utf8');
    return raw ? JSON.parse(raw) : cloneDefault();
  } catch {
    return cloneDefault();
  }
}

function writeStore(data) {
  ensureStoreDir();
  fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2), 'utf8');
}

function normalizeUsername(username) {
  return String(username || '')
    .trim()
    .toLowerCase();
}

export function saveUsernameRecord({ uid, username, email }) {
  const normalized = normalizeUsername(username);
  if (!normalized) throw new Error('USERNAME_REQUIRED');
  if (!uid) throw new Error('UID_REQUIRED');
  if (!email) throw new Error('EMAIL_REQUIRED');

  const store = readStore();
  const existing = store.usernames.find((entry) => entry.username === normalized);
  const timestamp = new Date().toISOString();

  if (existing && existing.uid !== uid) {
    const err = new Error('USERNAME_CONFLICT');
    err.code = 'USERNAME_CONFLICT';
    throw err;
  }

  const record = {
    username: normalized,
    email,
    uid,
    updatedAt: timestamp,
    createdAt: existing?.createdAt || timestamp
  };

  if (existing) {
    Object.assign(existing, record);
  } else {
    store.usernames.push(record);
  }

  writeStore(store);
  return record;
}

export function resolveUsernameRecord(username) {
  const normalized = normalizeUsername(username);
  if (!normalized) return null;
  const store = readStore();
  return store.usernames.find((entry) => entry.username === normalized) || null;
}
