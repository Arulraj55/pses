import { initializeApp } from 'firebase/app';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  sendEmailVerification,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
  updatePassword,
  updateEmail,
  verifyBeforeUpdateEmail,
  verifyPasswordResetCode as firebaseVerifyPasswordResetCode
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

export const firebaseEnabled = Boolean(
  firebaseConfig.apiKey &&
    firebaseConfig.authDomain &&
    firebaseConfig.projectId
);

let auth = null;
if (firebaseEnabled) {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
}

export { auth };

export function watchAuth(cb) {
  if (!firebaseEnabled || !auth) {
    cb(null);
    return () => {};
  }
  return onAuthStateChanged(auth, cb);
}

export async function signup(email, password, options = {}) {
  if (!firebaseEnabled || !auth) {
    throw new Error('Firebase is not configured. Set VITE_FIREBASE_* env vars in your client .env.');
  }
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  if (!options.skipVerification) {
    await sendEmailVerification(cred.user);
  }
  return cred.user;
}

export async function resendEmailVerification() {
  if (!firebaseEnabled || !auth) {
    throw new Error('Firebase is not configured. Set VITE_FIREBASE_* env vars in your client .env.');
  }
  const u = auth.currentUser;
  if (!u) throw new Error('Not logged in. Please sign in first.');
  if (!u.email) throw new Error('This account has no email address.');
  if (u.emailVerified) return { alreadyVerified: true };
  await sendEmailVerification(u);
  return { sent: true };
}

export async function login(email, password) {
  if (!firebaseEnabled || !auth) {
    throw new Error('Firebase is not configured. Set VITE_FIREBASE_* env vars in your client .env.');
  }
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function logout() {
  if (!firebaseEnabled || !auth) return;
  await signOut(auth);
}

export async function loginWithGoogle() {
  if (!firebaseEnabled || !auth) {
    throw new Error('Firebase is not configured. Set VITE_FIREBASE_* env vars in your client .env.');
  }
  const provider = new GoogleAuthProvider();
  const cred = await signInWithPopup(auth, provider);
  return cred.user;
}

export async function setUserPassword(user, newPassword) {
  if (!firebaseEnabled || !auth) {
    throw new Error('Firebase is not configured. Set VITE_FIREBASE_* env vars in your client .env.');
  }
  if (!user) throw new Error('User instance is required to set password.');
  if (!newPassword || newPassword.length < 6) {
    throw new Error('Password must be at least 6 characters long.');
  }
  await updatePassword(user, newPassword);
}

export async function setUserEmail(user, newEmail) {
  if (!firebaseEnabled || !auth) {
    throw new Error('Firebase is not configured. Set VITE_FIREBASE_* env vars in your client .env.');
  }
  if (!user) throw new Error('User instance is required to set email.');
  if (!newEmail) throw new Error('Email is required.');
  try {
    await updateEmail(user, newEmail);
    return { emailUpdated: true };
  } catch (err) {
    const message = err?.message || '';
    const code = err?.code || '';
    if (code === 'auth/operation-not-allowed' || /verify the new email/i.test(message)) {
      await verifyBeforeUpdateEmail(user, newEmail);
      return { verificationRequired: true };
    }
    if (code === 'auth/requires-recent-login') {
      throw new Error('Please sign in again, then try updating your email.');
    }
    throw err;
  }
}

export async function sendPasswordReset(email, continueUrl) {
  if (!firebaseEnabled || !auth) {
    throw new Error('Firebase is not configured. Set VITE_FIREBASE_* env vars in your client .env.');
  }
  if (!email) throw new Error('Email is required for password reset.');
  const targetUrl = continueUrl || (typeof window !== 'undefined'
    ? `${window.location.origin}/reset-password`
    : (import.meta.env.VITE_APP_BASE_URL || 'http://localhost:5173/reset-password'));
  const actionCodeSettings = {
    url: targetUrl,
    handleCodeInApp: true
  };
  await sendPasswordResetEmail(auth, email, actionCodeSettings);
}

export async function verifyPasswordResetCode(code) {
  if (!firebaseEnabled || !auth) {
    throw new Error('Firebase is not configured. Set VITE_FIREBASE_* env vars in your client .env.');
  }
  if (!code) throw new Error('Reset code is required.');
  return firebaseVerifyPasswordResetCode(auth, code);
}
