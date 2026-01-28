import admin from 'firebase-admin';

let initialized = false;

function tryParseServiceAccount(jsonString) {
  try {
    return JSON.parse(jsonString);
  } catch {
    return null;
  }
}

export function initFirebaseAdmin() {
  if (initialized) return;

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (serviceAccountJson) {
    const serviceAccount = tryParseServiceAccount(serviceAccountJson);
    if (!serviceAccount) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is set but is not valid JSON');
    }

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    initialized = true;
    return;
  }

  // Fallback: Application Default Credentials, commonly via GOOGLE_APPLICATION_CREDENTIALS
  // https://firebase.google.com/docs/admin/setup
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault()
    });
    initialized = true;
    return;
  }

  // Not configured; keep initialized=false.
}

export function isFirebaseAdminConfigured() {
  return Boolean(
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_APPLICATION_CREDENTIALS
  );
}

export function getAdmin() {
  if (!initialized) initFirebaseAdmin();
  if (!initialized) return null;
  return admin;
}

export function getFirestore() {
  const adm = getAdmin();
  if (!adm) return null;
  return adm.firestore();
}
