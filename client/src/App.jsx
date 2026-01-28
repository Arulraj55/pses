import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  auth,
  firebaseEnabled,
  login,
  loginWithGoogle,
  logout,
  resendEmailVerification,
  signup,
  watchAuth,
} from './firebase.js';
import {
  completeSession,
  generateQuiz,
  getMe,
  getProgressSummary,
  predictLevel,
  registerUsername,
  resolveUsername,
  saveAttempt,
  saveProfile,
  scoreVideoEffectiveness,
  searchVideo,
  startSession,
  preRegister,
  markVerified,
  authLogin,
  authMe,
  authChangePassword,
  authRequestPasswordReset,
  authResetPassword,
  authResetPasswordWithEmail
} from './api.js';
import { track } from './analytics.js';

const LANGUAGE_OPTIONS = ['C', 'C++', 'Java', 'Python', 'JavaScript'];
const SPOKEN_LANGUAGE_OPTIONS = [
  'English',
  'Hindi',
  'Tamil',
  'Telugu',
  'Kannada',
  'Malayalam',
  'Marathi',
  'Bengali',
  'Gujarati',
  'Punjabi',
  'Odia',
  'Assamese',
  'Urdu',
  'Konkani',
  'Manipuri'
];

const DIFFICULTY_LEVELS = ['Easy', 'Medium', 'Hard'];
const LESS_IMPORTANT_TOPICS = new Set([
  'Mo\'s Algorithm & Offline Queries',
  'Persistent Data Structures',
  'Advanced Graphs (Bridges, Articulation, SCC)',
  'Flow Algorithms (Ford-Fulkerson, Dinic)',
  'Computational Geometry & Convex Hull'
]);

const USERNAME_PATTERN = /^[a-z0-9._-]{3,20}$/i;

function sanitizeUsername(value = '') {
  return value.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
}

function generateAliasEmail(value) {
  const base = sanitizeUsername(value) || 'pses-user';
  // Deterministic alias so username can always map back to the same email.
  return `${base}@pses.local`;
}

const DSA_TOPICS = [
  { title: 'Arrays & Lists', difficulty: 'Easy', order: 1 },
  { title: 'Strings & Pattern Matching', difficulty: 'Easy', order: 2 },
  { title: 'Linked List', difficulty: 'Easy', order: 3 },
  { title: 'Stack', difficulty: 'Easy', order: 4 },
  { title: 'Queue & Deque', difficulty: 'Easy', order: 5 },
  { title: 'Two Pointers', difficulty: 'Easy', order: 6 },
  { title: 'Sliding Window', difficulty: 'Easy', order: 7 },
  { title: 'Prefix / Difference Arrays', difficulty: 'Easy', order: 8 },
  { title: 'Hashing & Maps', difficulty: 'Easy', order: 9 },
  { title: 'Binary Search', difficulty: 'Medium', order: 10 },
  { title: 'Sorting (Merge / Quick)', difficulty: 'Medium', order: 11 },
  { title: 'Binary Trees & Traversals', difficulty: 'Medium', order: 12 },
  { title: 'Binary Search Tree', difficulty: 'Medium', order: 13 },
  { title: 'Heap / Priority Queue', difficulty: 'Medium', order: 14 },
  { title: 'Trie & Prefix Trees', difficulty: 'Medium', order: 15 },
  { title: 'Graph Traversal (BFS / DFS)', difficulty: 'Medium', order: 16 },
  { title: 'Topological Sort', difficulty: 'Medium', order: 17 },
  { title: 'Greedy Patterns', difficulty: 'Medium', order: 18 },
  { title: 'Disjoint Set (DSU / Union Find)', difficulty: 'Medium', order: 19 },
  { title: 'Shortest Paths (Dijkstra / 0-1 BFS)', difficulty: 'Medium', order: 20 },
  { title: 'Bellman-Ford & Floyd-Warshall', difficulty: 'Medium', order: 21 },
  { title: 'Minimum Spanning Tree (Kruskal / Prim)', difficulty: 'Medium', order: 22 },
  { title: 'Segment Tree & Lazy Propagation', difficulty: 'Hard', order: 23 },
  { title: 'Fenwick Tree (BIT)', difficulty: 'Hard', order: 24 },
  { title: 'Sparse Table & RMQ', difficulty: 'Hard', order: 25 },
  { title: 'Heavy Light Decomposition', difficulty: 'Hard', order: 26 },
  { title: 'Lowest Common Ancestor & Binary Lifting', difficulty: 'Hard', order: 27 },
  { title: 'Suffix Array / Suffix Automaton', difficulty: 'Hard', order: 28 },
  { title: 'Advanced Strings (KMP, Z, Rolling Hash)', difficulty: 'Hard', order: 29 },
  { title: 'Dynamic Programming Basics', difficulty: 'Hard', order: 30 },
  { title: 'DP on Subsequences / Knapsack', difficulty: 'Hard', order: 31 },
  { title: 'DP on Trees', difficulty: 'Hard', order: 32 },
  { title: 'Digit DP', difficulty: 'Hard', order: 33 },
  { title: 'Bitmask DP', difficulty: 'Hard', order: 34 },
  { title: 'Game Theory & Grundy Numbers', difficulty: 'Hard', order: 35 },
  { title: 'Meet in the Middle & Divide-Conquer DP', difficulty: 'Hard', order: 36 },
  { title: 'Mo\'s Algorithm & Offline Queries', difficulty: 'Hard', order: 37 },
  { title: 'Persistent Data Structures', difficulty: 'Hard', order: 38 },
  { title: 'DSU on Tree / Small to Large', difficulty: 'Hard', order: 39 },
  { title: 'Advanced Graphs (Bridges, Articulation, SCC)', difficulty: 'Hard', order: 40 },
  { title: 'Flow Algorithms (Ford-Fulkerson, Dinic)', difficulty: 'Hard', order: 41 },
  { title: 'Number Theory (GCD, Sieve, Modular Arithmetic)', difficulty: 'Hard', order: 42 },
  { title: 'Chinese Remainder & Modular Inverse', difficulty: 'Hard', order: 43 },
  { title: 'Combinatorics & Counting Techniques', difficulty: 'Hard', order: 44 },
  { title: 'Matrix Exponentiation & Linear Recurrence', difficulty: 'Hard', order: 45 },
  { title: 'Probability & Expected Value DP', difficulty: 'Hard', order: 46 },
  { title: 'Computational Geometry & Convex Hull', difficulty: 'Hard', order: 47 },
  { title: 'Advanced Bit Manipulation', difficulty: 'Hard', order: 48 }
];

const LANGUAGE_CONCEPT_TOPICS = {
  C: [
    { title: 'C Basics & Syntax', difficulty: 'Easy', order: 1 },
    { title: 'Variables, Types, and Operators', difficulty: 'Easy', order: 2 },
    { title: 'Control Flow (if / loops)', difficulty: 'Easy', order: 3 },
    { title: 'Functions & Scope', difficulty: 'Easy', order: 4 },
    { title: 'Arrays and Strings', difficulty: 'Easy', order: 5 },
    { title: 'Pointers', difficulty: 'Medium', order: 6 },
    { title: 'Structs, Enums, and Unions', difficulty: 'Medium', order: 7 },
    { title: 'File I/O', difficulty: 'Medium', order: 8 },
    { title: 'Memory Management', difficulty: 'Medium', order: 9 },
    { title: 'Bitwise Operations', difficulty: 'Medium', order: 10 },
    { title: 'Debugging with GDB', difficulty: 'Medium', order: 11 },
    { title: 'Multi-File Projects & Build', difficulty: 'Medium', order: 12 },
    { title: 'Network Programming (Sockets)', difficulty: 'Hard', order: 13 },
    { title: 'Concurrency (Threads)', difficulty: 'Hard', order: 14 },
    { title: 'Performance & Optimization', difficulty: 'Hard', order: 15 }
  ],
  'C++': [
    { title: 'C++ Basics & Syntax', difficulty: 'Easy', order: 1 },
    { title: 'Classes & Objects', difficulty: 'Easy', order: 2 },
    { title: 'Inheritance & Polymorphism', difficulty: 'Easy', order: 3 },
    { title: 'STL Containers', difficulty: 'Easy', order: 4 },
    { title: 'STL Algorithms', difficulty: 'Easy', order: 5 },
    { title: 'Smart Pointers', difficulty: 'Medium', order: 6 },
    { title: 'Move Semantics & RAII', difficulty: 'Medium', order: 7 },
    { title: 'Templates (Basics)', difficulty: 'Medium', order: 8 },
    { title: 'Operator Overloading', difficulty: 'Medium', order: 9 },
    { title: 'Exception Handling', difficulty: 'Medium', order: 10 },
    { title: 'Concurrency (std::thread)', difficulty: 'Medium', order: 11 },
    { title: 'Template Metaprogramming', difficulty: 'Hard', order: 12 },
    { title: 'constexpr and Compile-Time Programming', difficulty: 'Hard', order: 13 },
    { title: 'C++20 Concepts and Ranges', difficulty: 'Hard', order: 14 },
    { title: 'Coroutines and Async Tasks', difficulty: 'Hard', order: 15 }
  ],
  Java: [
    { title: 'Java Basics & Syntax', difficulty: 'Easy', order: 1 },
    { title: 'Classes, Objects, and Methods', difficulty: 'Easy', order: 2 },
    { title: 'Inheritance and Interfaces', difficulty: 'Easy', order: 3 },
    { title: 'Collections Framework', difficulty: 'Easy', order: 4 },
    { title: 'Exceptions and Error Handling', difficulty: 'Easy', order: 5 },
    { title: 'Generics', difficulty: 'Medium', order: 6 },
    { title: 'Streams API', difficulty: 'Medium', order: 7 },
    { title: 'JVM Memory Model', difficulty: 'Medium', order: 8 },
    { title: 'Concurrency (Threads & Executors)', difficulty: 'Medium', order: 9 },
    { title: 'I/O and NIO', difficulty: 'Medium', order: 10 },
    { title: 'JDBC & Databases', difficulty: 'Medium', order: 11 },
    { title: 'Modules and Large-Scale Builds', difficulty: 'Hard', order: 12 },
    { title: 'Memory Model & Atomics', difficulty: 'Hard', order: 13 },
    { title: 'Reactive Programming (Project Reactor)', difficulty: 'Hard', order: 14 },
    { title: 'Security, OAuth, and JWT', difficulty: 'Hard', order: 15 }
  ],
  Python: [
    { title: 'Python Basics & Syntax', difficulty: 'Easy', order: 1 },
    { title: 'Data Types & Control Flow', difficulty: 'Easy', order: 2 },
    { title: 'Functions & Modules', difficulty: 'Easy', order: 3 },
    { title: 'Lists, Tuples, and Dicts', difficulty: 'Easy', order: 4 },
    { title: 'File Handling', difficulty: 'Easy', order: 5 },
    { title: 'OOP in Python', difficulty: 'Medium', order: 6 },
    { title: 'Error Handling & Logging', difficulty: 'Medium', order: 7 },
    { title: 'Virtual Environments & Packaging', difficulty: 'Medium', order: 8 },
    { title: 'Testing (pytest)', difficulty: 'Medium', order: 9 },
    { title: 'Threading and Multiprocessing', difficulty: 'Medium', order: 10 },
    { title: 'Asyncio Basics', difficulty: 'Medium', order: 11 },
    { title: 'Metaclasses and Descriptors', difficulty: 'Hard', order: 12 },
    { title: 'Asyncio Advanced Patterns', difficulty: 'Hard', order: 13 },
    { title: 'Task Queues (Celery / RQ)', difficulty: 'Hard', order: 14 },
    { title: 'Performance (Cython / Numba)', difficulty: 'Hard', order: 15 }
  ],
  JavaScript: [
    { title: 'JavaScript Basics & Syntax', difficulty: 'Easy', order: 1 },
    { title: 'Functions and Scope', difficulty: 'Easy', order: 2 },
    { title: 'Objects and Arrays', difficulty: 'Easy', order: 3 },
    { title: 'DOM Basics', difficulty: 'Easy', order: 4 },
    { title: 'ES6+ Features', difficulty: 'Easy', order: 5 },
    { title: 'Promises and Async/Await', difficulty: 'Medium', order: 6 },
    { title: 'Modules and Tooling', difficulty: 'Medium', order: 7 },
    { title: 'State Management Patterns', difficulty: 'Medium', order: 8 },
    { title: 'Testing (Jest)', difficulty: 'Medium', order: 9 },
    { title: 'Performance Profiling', difficulty: 'Medium', order: 10 },
    { title: 'Functional Patterns (RxJS)', difficulty: 'Hard', order: 11 },
    { title: 'Web Components & Shadow DOM', difficulty: 'Hard', order: 12 },
    { title: 'Security (XSS / CSP / CSRF)', difficulty: 'Hard', order: 13 },
    { title: 'Node.js Backend Basics', difficulty: 'Hard', order: 14 },
    { title: 'Advanced Debugging & Monitoring', difficulty: 'Hard', order: 15 }
  ]
};

const DSA_STUDY_FLOW = [];

const LANGUAGE_STUDY_FLOW_TEMPLATE = [];

function getLanguageStudyFlow(language) {
  const label = language || 'your language';
  return LANGUAGE_STUDY_FLOW_TEMPLATE.map((step) => ({
    step: step.step,
    title: step.title(label),
    highlights: step.highlights(label),
    description: step.description
  }));
}

function getStudyFlow(section, language) {
  return section === 'DSA' ? DSA_STUDY_FLOW : getLanguageStudyFlow(language);
}

function isLessImportantTopic(title) {
  return LESS_IMPORTANT_TOPICS.has(title);
}

function getWebIcon(urlString) {
  try {
    const parsed = new URL(urlString);
    return `https://www.google.com/s2/favicons?sz=64&domain_url=${parsed.origin}`;
  } catch {
    return null;
  }
}

/* ========================================
   AUTH PANEL
======================================== */
function AuthPanel({ onAuthed, onProfileChanged, spokenLanguage, spokenLanguageSecondary, onSpokenLanguageChange, onSpokenLanguageChangeSecondary, requiresVerification }) {
  const [authScreen, setAuthScreen] = useState('login'); // login | signup | verify | reset
  const [username, setUsername] = useState(() => {
    if (typeof window === 'undefined') return '';
    return window.localStorage.getItem('psesUsername') || '';
  });
  const [password, setPassword] = useState('');
  const [preferredLanguage, setPreferredLanguage] = useState('Java');
  const LANGUAGE_OPTIONS = ['Python', 'Java', 'C', 'C++', 'JavaScript'];
  const [error, setError] = useState('');
  const [cloudWarning, setCloudWarning] = useState('');
  const [busy, setBusy] = useState(false);
  const [pendingEmail, setPendingEmail] = useState('');
  const [pendingSignup, setPendingSignup] = useState(() => {
    if (typeof window === 'undefined') return null;
    try {
      const raw = window.localStorage.getItem('psesPendingSignup');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }); // stores username/password/langs before Firebase creation
  const [emailStatus, setEmailStatus] = useState('');
  const [step1Complete, setStep1Complete] = useState(false);
  const [signupLanguage, setSignupLanguage] = useState(spokenLanguage || SPOKEN_LANGUAGE_OPTIONS[0]);
  const [signupLanguage2, setSignupLanguage2] = useState(spokenLanguageSecondary || SPOKEN_LANGUAGE_OPTIONS[1] || SPOKEN_LANGUAGE_OPTIONS[0]);
  const [resetIdentifier, setResetIdentifier] = useState('');
  const [resetStatus, setResetStatus] = useState('');
  const [resetBusy, setResetBusy] = useState(false);
  const [resetStage, setResetStage] = useState('confirm');
  const [resolvedResetEmail, setResolvedResetEmail] = useState('');
  const [resolvedResetProvider, setResolvedResetProvider] = useState(null);
  const [resetOldPassword, setResetOldPassword] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetNewPassword2, setResetNewPassword2] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [verificationStatus, setVerificationStatus] = useState('');
  const finalizingRef = useRef(false);

  // Force reset form if resetToken in URL (even after redirect)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    const resetToken = url.searchParams.get('resetToken');
    if (resetToken && authScreen !== 'reset') {
      setAuthScreen('reset');
      setResetStage('confirm');
      if (resetToken) setResetToken(resetToken);
      const usernameParam = url.searchParams.get('username');
      if (usernameParam) setResetIdentifier(usernameParam);
    }
  }, [authScreen]);

  async function getIdTokenWithRetry(userInstance, { forceRefresh = true } = {}) {
    const delays = [0, 400, 1200];
    let lastErr = null;
    for (const delayMs of delays) {
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
      try {
        try {
          await userInstance.reload();
        } catch {
          /* ignore */
        }
        return await userInstance.getIdToken(forceRefresh);
      } catch (e) {
        lastErr = e;
        const code = e?.code || '';
        // Retry the common transient cases.
        if (code === 'auth/invalid-credential' || code === 'auth/network-request-failed') {
          continue;
        }
        throw e;
      }
    }
    const code = lastErr?.code ? ` (${lastErr.code})` : '';
    throw new Error(`Could not finalize sign-in${code}. Please reload and try again.`);
  }

  useEffect(() => {
    setSignupLanguage(spokenLanguage || SPOKEN_LANGUAGE_OPTIONS[0]);
    setSignupLanguage2(spokenLanguageSecondary || SPOKEN_LANGUAGE_OPTIONS[1] || SPOKEN_LANGUAGE_OPTIONS[0]);
  }, [spokenLanguage, spokenLanguageSecondary]);

  useEffect(() => {
    setError('');
    setCloudWarning('');
    setPendingEmail('');
    setEmailStatus('');
    setVerificationStatus('');
    setResetIdentifier('');
    setResetStatus('');
    const paramsFromUrl = (() => {
      if (typeof window === 'undefined') return '';
      try {
        const url = new URL(window.location.href);
        return {
          resetToken: url.searchParams.get('resetToken') || '',
          username: url.searchParams.get('username') || ''
        };
      } catch {
        return { resetToken: '', username: '' };
      }
    })();

    const autoStage = authScreen === 'reset' && paramsFromUrl.resetToken
      ? 'confirm'
      : 'input';
    setResetStage(autoStage);
    setResolvedResetEmail('');
    setResolvedResetProvider(null);
    setResetOldPassword('');
    setResetNewPassword('');
    setResetNewPassword2('');
    setResetToken(authScreen === 'reset' && paramsFromUrl.resetToken ? paramsFromUrl.resetToken : '');
    if (authScreen === 'reset' && paramsFromUrl.username) {
      setResetIdentifier(paramsFromUrl.username);
    }
    setPassword('');
  }, [authScreen]);

  // If user arrives via emailed reset link, switch to reset screen automatically.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    const token = url.searchParams.get('resetToken');
    const usernameParam = url.searchParams.get('username');
    if (!token) return;
    setAuthScreen('reset');
    setResetStage('confirm');
    if (token) setResetToken(token);
    if (usernameParam) setResetIdentifier(usernameParam);
  }, []);

  useEffect(() => {
    if (requiresVerification) {
      setAuthScreen('verify');
      setStep1Complete(true);
    }
  }, [requiresVerification]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem('psesUsername', sanitizeUsername(username) || username);
    } catch {
      /* ignore */
    }
  }, [username]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (pendingSignup) {
        window.localStorage.setItem('psesPendingSignup', JSON.stringify(pendingSignup));
      } else {
        window.localStorage.removeItem('psesPendingSignup');
      }
    } catch {
      /* ignore */
    }
  }, [pendingSignup]);

  // Auto-finalize if a verified Firebase user exists and pending signup data is still around (e.g., after reload)
  useEffect(() => {
    const userInstance = auth?.currentUser;
    const pending = getPendingSignupData();
    if (!userInstance) return;
    if (!pending?.username && !userInstance.emailVerified && !userInstance.phoneNumber) return;
    if (!userInstance.emailVerified && !userInstance.phoneNumber) return;
    if (finalizingRef.current) return;

    const emailForProfile = userInstance.email || generateAliasEmail((pending?.username) || sanitizeUsername(userInstance.email?.split('@')[0] || ''));
    finalizingRef.current = true;
    markVerifiedWithPending(userInstance, emailForProfile)
      .catch((e) => {
        setError(e?.message || 'Verified, but failed to finalize signup. Restart signup.');
      })
      .finally(() => {
        finalizingRef.current = false;
      });
  }, [auth?.currentUser]);

  const normalizedUsername = sanitizeUsername(username);
  const usernameValid = USERNAME_PATTERN.test(normalizedUsername);
  const profileComplete = Boolean(
    usernameValid &&
    password.trim().length >= 6 &&
    preferredLanguage &&
    signupLanguage &&
    signupLanguage2
  );
  const loginReady = Boolean(normalizedUsername && password.trim().length >= 6);
  const altMethodsLocked = !step1Complete;
  const primarySignupDisabled = busy || !profileComplete;
  const primaryLoginDisabled = busy || !loginReady;

  function handleProfileSyncError(err) {
    const msg = err?.message || String(err);
    if (msg.includes('Firebase Admin is not configured') || msg.includes('FIREBASE_ADMIN_NOT_CONFIGURED')) {
      setCloudWarning('Profile sync is disabled because Firebase Admin credentials are missing on the server. You can keep using the app locally.');
      return true;
    }
    return false;
  }

  function getPendingSignupData() {
    if (pendingSignup?.username) return pendingSignup;
    if (typeof window !== 'undefined') {
      try {
        const raw = window.localStorage.getItem('psesPendingSignup');
        const parsed = raw ? JSON.parse(raw) : null;
        if (parsed?.username) return parsed;
      } catch {
        /* ignore */
      }
    }
    return null;
  }

  async function markVerifiedWithPending(userInstance, emailForProfile) {
    const pendingFromStorage = getPendingSignupData();
    const pending = pendingFromStorage ? { ...pendingFromStorage } : {};
    if (!pending.username) {
      // If user is verified but local pending is gone, still attempt to finalize with username from displayName/email local part
      const fallbackUsername = sanitizeUsername(userInstance.displayName || userInstance.email?.split('@')[0] || '');
      if (!fallbackUsername) {
        throw new Error('Signup info missing. Please restart signup.');
      }
      pending.username = fallbackUsername;
    }
    pending.preferredLanguage = pending.preferredLanguage || 'Java';

    onProfileChanged({ preferredLanguage: pending.preferredLanguage, username: pending.username });
    onSpokenLanguageChange?.(pending.spokenLanguage);
    onSpokenLanguageChangeSecondary?.(pending.spokenLanguageSecondary);

    // Force-refresh the token so server sees updated email_verified claim after verification.
    // Token fetch can be transiently flaky right after Google popup; retry a couple times.
    const token = await getIdTokenWithRetry(userInstance, { forceRefresh: true });
    await markVerified(token, {
      username: pending.username,
      preferredLanguage: pending.preferredLanguage,
      spokenLanguage: pending.spokenLanguage,
      spokenLanguageSecondary: pending.spokenLanguageSecondary
    });

    try {
      await saveProfile(token, {
        preferredLanguage: pending.preferredLanguage,
        username: pending.username,
        email: emailForProfile,
        spokenLanguage: pending.spokenLanguage,
        spokenLanguageSecondary: pending.spokenLanguageSecondary
      });
    } catch (profileErr) {
      handleProfileSyncError(profileErr);
    }

    await registerUsername(token, pending.username, emailForProfile);
    setPendingSignup(null);
    // Immediately update profile with preferred language so UI shows correct value after signup
    setProfile({ ...(profile || {}), preferredLanguage: pending.preferredLanguage || preferredLanguage, username: pending.username });
    setPage('sections');
    setAuthScreen('login');
  }

  async function submitSignup(e) {
    e.preventDefault();
    setError('');
    setCloudWarning('');
    if (!profileComplete) {
      setError('Please complete your details before creating an account.');
      return;
    }
    setBusy(true);
    try {
      if (!usernameValid) {
        throw new Error('Username must be 3-20 characters using letters, numbers, ., -, _.' );
      }
      // Step 1: store signup data in Mongo (no Firebase account yet)
      await preRegister({
        username: normalizedUsername,
        password,
        preferredLanguage,
        spokenLanguage: signupLanguage,
        spokenLanguageSecondary: signupLanguage2
      });
      setPendingSignup({
        username: normalizedUsername,
        password,
        preferredLanguage,
        spokenLanguage: signupLanguage,
        spokenLanguageSecondary: signupLanguage2
      });
      setStep1Complete(true);
      setAuthScreen('verify');
    } catch (err) {
      setError(err?.message || 'Unable to complete the request. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function submitLogin(e) {
    e.preventDefault();
    setError('');
    setCloudWarning('');
    if (!loginReady) {
      setError('Enter your username and password to continue.');
      return;
    }
    setBusy(true);
    try {
      // Mongo-based sign-in (username/password)
      const resp = await authLogin(normalizedUsername || username, password);
      const token = resp?.token;
      if (!token) throw new Error('Login succeeded but no token was returned.');
      try {
        window.localStorage.setItem('psesSessionToken', token);
      } catch {
        /* ignore */
      }

      const sessionUser = {
        __session: true,
        isGuest: false,
        emailVerified: true,
        phoneNumber: null,
        email: resp?.user?.email ?? null,
        displayName: resp?.user?.username ?? null,
        getIdToken: async () => token,
        reload: async () => {}
      };
      onAuthed(sessionUser);
    } catch (err) {
      setError(err?.message || 'Unable to complete the request. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function signInGoogle() {
    setError('');
    setBusy(true);
    try {
      const userInstance = await loginWithGoogle();
      // If user is signing in (not completing signup), don't overwrite mappings.
      const pending = getPendingSignupData();
      if (pending?.username) {
        const emailForProfile = userInstance.email || generateAliasEmail(normalizedUsername);
        await markVerifiedWithPending(userInstance, emailForProfile);
      }
      onAuthed(userInstance);
    } catch (err) {
      const code = err?.code ? ` (${err.code})` : '';
      setError(err?.message || `Google sign-in failed${code}.`);
    } finally {
      setBusy(false);
    }
  }

  async function beginResetFlow() {
    setError('');
    setResetStatus('');
    if (!resetIdentifier.trim()) {
      setError('Enter your username to continue.');
      return;
    }
    setResetBusy(true);
    try {
      const identifier = resetIdentifier.trim();
      if (identifier.includes('@')) {
        throw new Error('Please enter your username (not an email address).');
      }

      const normalized = sanitizeUsername(identifier);

      // Request backend to send reset link (no Firebase)
      await authRequestPasswordReset(normalized);
      setResolvedResetEmail('');
      setResolvedResetProvider(null);
      // Store username in localStorage so we can retrieve it when setting new password
      try {
        window.localStorage.setItem('psesResetUsername', normalized);
      } catch {
        /* ignore */
      }

      setResetStatus('Reset link sent. Check your email inbox/spam.');
    } catch (err) {
      if (err?.status === 404 || /not found/i.test(err?.message || '')) {
        setError('Account not found. Please re-check your username.');
      } else {
        setError(err?.message || 'Unable to find that account.');
      }
    } finally {
      setResetBusy(false);
    }
  }

  async function submitPasswordResetFromLink() {
    setError('');
    setResetStatus('');

    const token = resetToken;
    if (!resetNewPassword || resetNewPassword.length < 6) {
      setError('New password must be at least 6 characters.');
      return;
    }
    if (resetNewPassword !== resetNewPassword2) {
      setError('New passwords do not match.');
      return;
    }

    setResetBusy(true);
    try {
      const normalizedUsername = sanitizeUsername(resetIdentifier || '') || undefined;
      if (token) {
        await authResetPassword(token, resetNewPassword);
      } else {
        if (!normalizedUsername) throw new Error('Username is required to reset password.');
        await authResetPasswordWithEmail('', resetNewPassword, normalizedUsername);
      }
      setResetStatus('Password updated. You can sign in with your new password now.');
      setResetNewPassword('');
      setResetNewPassword2('');
      setResetToken('');
      if (typeof window !== 'undefined') {
        const url = new URL(window.location.href);
        url.searchParams.delete('resetToken');
        window.history.replaceState({}, '', url.toString());
      }
    } catch (err) {
      setError(err?.message || 'Failed to reset password');
    } finally {
      setResetBusy(false);
    }
  }


  useEffect(() => {
    if (authScreen !== 'verify') return undefined;
    let cancelled = false;
    let timer = null;

    async function pollVerification() {
      if (!auth?.currentUser) return;
      try {
        await auth.currentUser.reload();
        if (auth.currentUser.emailVerified) {
          setError('');
          setVerificationStatus('Email verified! Please reload the page.');
          const userInstance = auth.currentUser;
          const emailForProfile = userInstance.email || generateAliasEmail(normalizedUsername);
          try {
            await markVerifiedWithPending(userInstance, emailForProfile);
            onAuthed(auth.currentUser);
            return;
          } catch (e) {
            setError(e?.message || 'Verified, but failed to finalize signup. Restart signup.');
            return;
          }
        }
      } catch {
        /* ignore transient reload issues */
      }
      if (!cancelled) {
        timer = setTimeout(pollVerification, 4000);
      }
    }

    pollVerification();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [authScreen, onAuthed, normalizedUsername]);


  async function createFirebaseAndSendVerification() {
    setError('');
    setEmailStatus('');
    const pending = getPendingSignupData();
    if (!pending?.username || !pending?.password) {
      setError('Finish signup first.');
      return;
    }
    const emailToUse = pendingEmail.trim() || generateAliasEmail(pending.username);
    setBusy(true);
    try {
      const createdUser = await signup(emailToUse, pending.password, { skipVerification: false });
      setEmailStatus(`Verification link sent to ${emailToUse}. Check your inbox or spam.`);
      onAuthed(createdUser);
    } catch (err) {
      setError(err?.message || 'Failed to start verification.');
    } finally {
      setBusy(false);
    }
  }

  const heroTitle =
    authScreen === 'signup' ? 'Create account'
    : authScreen === 'verify' ? 'Verify your account'
    : authScreen === 'reset' ? 'Reset password'
    : 'Sign in';
  const heroCopy =
    authScreen === 'signup' ? 'Create a username and password.'
    : authScreen === 'verify' ? 'Verify to enter the app.'
    : authScreen === 'reset' ? 'Set a new password for your account.'
    : 'Use your username and password.';

  return (
    <div className="authCard authCardPro">
      <div className="authHero">
        <div className="authHeroIcon">🔐</div>
        <div>
          <h2>{heroTitle}</h2>
          <p className="authHeroCopy">{heroCopy}</p>
        </div>
      </div>

      {authScreen === 'signup' && (
        <div className="authSplit">
          <form className="authSection authSectionPrimary" onSubmit={submitSignup}>

            <div className="formGroup">
              <label>Username</label>
              <input
                type="text"
                placeholder="pses_warrior"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={step1Complete}
                required
              />
              <small className="muted">3-20 characters · letters, numbers, dot, dash, underscore.</small>
            </div>
            <div className="formGroup">
              <label>Password</label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <small className="muted">At least 6 characters</small>
            </div>
            <div className="formGroup">
              <label>Preferred Language</label>
              <select
                value={preferredLanguage}
                onChange={e => setPreferredLanguage(e.target.value)}
                disabled={step1Complete}
                required
              >
                {LANGUAGE_OPTIONS.map(lang => (
                  <option key={lang} value={lang}>{lang}</option>
                ))}
              </select>
              <small className="muted">Choose your main programming language.</small>
            </div>

            <div className="authGrid">
              <div className="formGroup">
                <label>First language</label>
                <select value={signupLanguage} onChange={(e) => setSignupLanguage(e.target.value)}>
                  {SPOKEN_LANGUAGE_OPTIONS.map((l) => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
                <small className="muted">Search prioritizes this language.</small>
              </div>
              <div className="formGroup">
                <label>Second language</label>
                <select value={signupLanguage2} onChange={(e) => setSignupLanguage2(e.target.value)}>
                  {SPOKEN_LANGUAGE_OPTIONS.map((l) => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
                <small className="muted">Used if content is not available in the first.</small>
              </div>
            </div>

            <button type="submit" disabled={primarySignupDisabled}>
              {busy ? 'Please wait...' : 'Create Account'}
            </button>

            <button
              type="button"
              className="ghost"
              onClick={() => setAuthScreen('login')}
              disabled={busy}
              style={{ marginTop: 8 }}
            >
              Back to sign in
            </button>
          </form>
        </div>
      )}

      {authScreen === 'verify' && (
        <div className="authSplit">
          <div className="authSection authSectionPrimary">
            <p className="authHint">
              We are checking for verification automatically. Open the link in your email to continue.
            </p>
            {verificationStatus && <small className="statusSuccess">{verificationStatus}</small>}

            <div className="formGroup">
              <label>Email</label>
              <input
                type="email"
                placeholder="you@example.com"
                value={pendingEmail}
                onChange={(e) => setPendingEmail(e.target.value)}
                disabled={busy}
              />
              <button
                type="button"
                className="ghost"
                disabled={busy || !pendingEmail.trim()}
                onClick={createFirebaseAndSendVerification}
              >
                {busy ? 'Sending...' : 'Send verification link'}
              </button>
              {emailStatus && <small className="statusSuccess">{emailStatus}</small>}
            </div>

            <div className="methodDivider"><span>or</span></div>

            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={signInGoogle}
            >
              <span role="img" aria-hidden="true">⚡</span>
              Verify with Google
            </button>

            <button
              type="button"
              className="ghost"
              onClick={() => setAuthScreen('login')}
              disabled={busy}
              style={{ marginTop: 8 }}
            >
              Back to sign in
            </button>
          </div>
        </div>
      )}

      {authScreen === 'login' && (
        <div className="authSplit">
          <form className="authSection authSectionPrimary" onSubmit={submitLogin}>

            <div className="formGroup">
              <label>Username</label>
              <input
                type="text"
                placeholder="your username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
            <div className="formGroup">
              <label>Password</label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <button type="submit" disabled={primaryLoginDisabled}>
  			{busy ? 'Signing in...' : 'Sign In'}
  		  </button>

            <button
              type="button"
              className="ghost"
              style={{ marginTop: 8 }}
              onClick={() => setAuthScreen('reset')}
            >
              Forgot password?
            </button>

            <button
              type="button"
              className="secondary"
              style={{ marginTop: 8 }}
              onClick={() => setAuthScreen('signup')}
              disabled={busy}
            >
              Create account
            </button>
          </form>
        </div>
      )}

      {authScreen === 'reset' && (
        <div className="authSplit">
          <div className="authSection authSectionPrimary">
            {/* Removed 'Set new password' badge */}
            <p className="authHint">Enter a new password to finish resetting your account.</p>
            <div className="formGroup">
              <label>Username</label>
              <input
                type="text"
                placeholder="username"
                value={resetIdentifier}
                onChange={(e) => setResetIdentifier(e.target.value)}
                disabled={resetBusy}
              />
            </div>
            <div className="formGroup">
              <label>New password</label>
              <input
                type="password"
                placeholder="at least 6 characters"
                value={resetNewPassword}
                onChange={(e) => setResetNewPassword(e.target.value)}
                disabled={resetBusy}
              />
            </div>
            <div className="formGroup">
              <label>Confirm new password</label>
              <input
                type="password"
                placeholder="repeat new password"
                value={resetNewPassword2}
                onChange={(e) => setResetNewPassword2(e.target.value)}
                disabled={resetBusy}
              />
            </div>
            <button
              type="button"
              className="ghost"
              disabled={resetBusy}
              onClick={submitPasswordResetFromLink}
            >
              {resetBusy ? 'Updating...' : 'Update password'}
            </button>
            {resetStatus && <small className="statusSuccess">{resetStatus}</small>}

            <button
              type="button"
              className="ghost"
              onClick={() => setAuthScreen('login')}
              disabled={resetBusy}
              style={{ marginTop: 8 }}
            >
              Back to sign in
            </button>
          </div>
        </div>
      )}

      {error && <div className="error">{error}</div>}
    </div>
  );
}


/* ========================================
   MAIN APP
======================================== */
export default function App() {
  const [user, setUser] = useState(null);
  const [emailVerified, setEmailVerified] = useState(false);
  const [profile, setProfile] = useState(null);
  const [page, setPage] = useState('auth');
  const [section, setSection] = useState('DSA');

  const [topic, setTopic] = useState(DSA_TOPICS[0].title);
  const [language, setLanguage] = useState('Java');

  const [step, setStep] = useState('select');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [video, setVideo] = useState(null);
  const [videoList, setVideoList] = useState([]);
  const [referenceLinks, setReferenceLinks] = useState([]);
  const [faviconFailures, setFaviconFailures] = useState({});
  const [replays, setReplays] = useState(0);
  const [sessionId, setSessionId] = useState(null);

  const [quiz, setQuiz] = useState(null);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState({});
  const [questionStartAt, setQuestionStartAt] = useState(null);
  const [timePerQuestionSec, setTimePerQuestionSec] = useState([]);

  const [difficulty, setDifficulty] = useState(3);
  const [result, setResult] = useState(null);
  const [videoEffectiveness, setVideoEffectiveness] = useState(null);
  const [progress, setProgress] = useState(null);
  const [topicCards, setTopicCards] = useState([]);
  const [topicSearch, setTopicSearch] = useState('');
  const [webVideosEnabled, setWebVideosEnabled] = useState(null); // retained for backward compatibility
  const [spokenLanguage, setSpokenLanguage] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.localStorage.getItem('psesSpokenLanguage') || SPOKEN_LANGUAGE_OPTIONS[0];
    }
    return SPOKEN_LANGUAGE_OPTIONS[0];
  });
  const [spokenLanguageSecondary, setSpokenLanguageSecondary] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.localStorage.getItem('psesSpokenLanguage2') || SPOKEN_LANGUAGE_OPTIONS[1] || SPOKEN_LANGUAGE_OPTIONS[0];
    }
    return SPOKEN_LANGUAGE_OPTIONS[1] || SPOKEN_LANGUAGE_OPTIONS[0];
  });
  const [topicDifficulty, setTopicDifficulty] = useState(() => {
    if (typeof window === 'undefined') return {};
    try {
      const raw = window.localStorage.getItem('psesTopicDifficulty');
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });
  const studyFlow = useMemo(() => getStudyFlow(section, language), [section, language]);

  const historyReadyRef = useRef(false);
  const lastNavStateRef = useRef(null);
  const suppressNextHistoryPush = useRef(false);
  function themeVarsFor(title) {
    const s = String(title || '');
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    const hue1 = h % 360;
    const hue2 = (hue1 + 44 + (h % 23)) % 360;
    return { '--h1': String(hue1), '--h2': String(hue2) };
  }

  function findDefaultDifficulty(title) {
    const fromDsa = DSA_TOPICS.find((t) => t.title === title);
    if (fromDsa) return fromDsa.difficulty;
    for (const lang of LANGUAGE_OPTIONS) {
      const hit = (LANGUAGE_CONCEPT_TOPICS[lang] || []).find((t) => t.title === title);
      if (hit) return hit.difficulty;
    }
    return DIFFICULTY_LEVELS[0];
  }

  function getTopicDifficulty(title) {
    return topicDifficulty[title] || findDefaultDifficulty(title);
  }

  function setTopicDifficultyFor(title, level) {
    setTopicDifficulty((prev) => ({ ...prev, [title]: level }));
  }

  function difficultyValue(title) {
    const label = getTopicDifficulty(title);
    if (label === 'Hard') return 5;
    if (label === 'Medium') return 3;
    return 1;
  }

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const initialState = { page, step, section, topic, language };
    window.history.replaceState(initialState, '');
    lastNavStateRef.current = initialState;
    historyReadyRef.current = true;

    const onPop = (event) => {
      const state = event.state;
      if (!state) return;
      suppressNextHistoryPush.current = true;
      setPage(state.page ?? 'auth');
      setStep(state.step ?? 'select');
      if (state.section) setSection(state.section);
      if (state.topic) setTopic(state.topic);
      if (state.language) setLanguage(state.language);
    };

    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!historyReadyRef.current) return;
    if (suppressNextHistoryPush.current) {
      suppressNextHistoryPush.current = false;
      return;
    }

    const nextState = { page, step, section, topic, language };
    const prev = lastNavStateRef.current;
    const same =
      prev &&
      prev.page === nextState.page &&
      prev.step === nextState.step &&
      prev.section === nextState.section &&
      prev.topic === nextState.topic &&
      prev.language === nextState.language;

    if (!same) {
      window.history.pushState(nextState, '');
      lastNavStateRef.current = nextState;
    }
  }, [page, step, section, topic, language]);

  const [sessionToken, setSessionToken] = useState(() => {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem('psesSessionToken');
  });

  function isSessionUser(u) {
    return Boolean(u && u.__session);
  }

  async function handleLogout() {
    try {
      window.localStorage.removeItem('psesSessionToken');
    } catch {
      /* ignore */
    }
    setSessionToken(null);
    setUser(null);
    setProfile(null);
    setPage('auth');
    try {
      await logout();
    } catch {
      /* ignore */
    }
  }

  // Restore Mongo session if present
  useEffect(() => {
    const token = sessionToken;
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const me = await authMe(token);
        if (cancelled) return;
        const sessionUser = {
          __session: true,
          isGuest: false,
          emailVerified: true,
          phoneNumber: null,
          email: me?.user?.email ?? null,
          displayName: me?.user?.username ?? null,
          getIdToken: async () => token,
          reload: async () => {}
        };
        setUser(sessionUser);
        setEmailVerified(true);
        setPage((p) => (p === 'auth' ? 'sections' : p));
      } catch {
        // invalid/expired token
        try {
          window.localStorage.removeItem('psesSessionToken');
        } catch {
          /* ignore */
        }
        setSessionToken(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionToken]);

  useEffect(() => {
    // If using Mongo session auth, don't let Firebase auth override user state.
    if (sessionToken) return () => {};
    const unsub = watchAuth((u) => {
      setUser(u);
      const isGoogle = Boolean(u?.providerData?.some?.((p) => p?.providerId === 'google.com'));
      setEmailVerified(Boolean(u?.isGuest || u?.emailVerified || u?.phoneNumber || isGoogle));
    });
    return () => unsub();
  }, [sessionToken]);

  useEffect(() => {
    if (!user) {
      setPage('auth');
      setEmailVerified(false);
      return;
    }
    const isGoogle = Boolean(user?.providerData?.some?.((p) => p?.providerId === 'google.com'));
    const verified = Boolean(
      user?.isGuest ||
      !firebaseEnabled ||
      user?.emailVerified ||
      user?.phoneNumber ||
      isGoogle ||
      profile?.verified
    );
    setEmailVerified(verified);
    if (!verified) {
      setPage('auth');
    } else {
      setPage((p) => (p === 'auth' ? 'sections' : p));
    }
  }, [user, profile]);

  async function refreshVerificationStatus() {
    setError('');
    if (!user || user.isGuest) return;
    if (isSessionUser(user)) {
      // Mongo sessions are already verified by the server.
      setEmailVerified(true);
      setError('');
      return;
    }
    try {
      setBusy(true);
      await user.reload();
      await user.getIdToken(true);
      setEmailVerified(Boolean(user.emailVerified));
      if (user.emailVerified) {
        track('email_verified', {});
        setError('');
      } else {
        setError('Not verified yet. Open the verification email, click the link, then try again.');
      }
    } catch (e) {
      setError(e?.message || 'Failed to refresh verification status');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    async function loadProfile() {
      if (!user || user.isGuest) {
        setProfile(null);
        return;
      }
      try {
        const token = await user.getIdToken();
        const me = await getMe(token);
        setProfile(me?.profile ?? null);
        if (me?.profile?.preferredLanguage) {
          setLanguage(me.profile.preferredLanguage);
        }
      } catch {
        setProfile(null);
      }
    }
    loadProfile();
  }, [user]);

  useEffect(() => {
    if (page !== 'learn' || step !== 'select') return;
    const list = section === 'DSA' ? DSA_TOPICS : (LANGUAGE_CONCEPT_TOPICS[language] || []);
    setTopicCards(list);
    if (!list.find((t) => t.title === topic) && list.length) {
      setTopic(list[0].title);
    }
    if (topic) {
      setDifficulty(difficultyValue(topic));
    }
  }, [page, step, section, language, topic]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem('psesSpokenLanguage', spokenLanguage);
    } catch {
      /* ignore */
    }
  }, [spokenLanguage]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem('psesSpokenLanguage2', spokenLanguageSecondary);
    } catch {
      /* ignore */
    }
  }, [spokenLanguageSecondary]);

  useEffect(() => {
    setFaviconFailures({});
  }, [referenceLinks]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem('psesTopicDifficulty', JSON.stringify(topicDifficulty));
    } catch {
      /* ignore */
    }
  }, [topicDifficulty]);

  const current = quiz?.questions?.[idx] ?? null;

  const scoreInfo = useMemo(() => {
    if (!quiz?.questions) return { score: 0, correct: 0, total: 0, weakConcepts: [] };
    const total = quiz.questions.length;
    let correct = 0;
    const wrong = [];
    for (const q of quiz.questions) {
      const a = answers[q.id];
      if (a == null) continue;
      if (a === q.answerIndex) correct += 1;
      else wrong.push(q.concept || 'Unknown');
    }
    const score = total ? correct / total : 0;
    const counts = new Map();
    for (const c of wrong) counts.set(c, (counts.get(c) || 0) + 1);
    const weakConcepts = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([c]) => c);
    return { score, correct, total, weakConcepts };
  }, [quiz, answers]);

  async function startLearning() {
    setError('');
    setBusy(true);
    setResult(null);
    setVideoEffectiveness(null);
    setQuiz(null);
    setVideo(null);
    setReferenceLinks([]);
    setWebVideosEnabled(null);
    setReplays(0);
    setAnswers({});
    setIdx(0);
    setTimePerQuestionSec([]);
    setQuestionStartAt(null);
    setDifficulty(difficultyValue(topic));

    try {
      if (firebaseEnabled && Boolean(user?.email) && !emailVerified) {
        throw new Error('Please verify your email before learning.');
      }
      track('topic_selected', { topic, language });

      const vid = await searchVideo(topic, language, {
        max: 6,
        webMax: 0,
        spoken: spokenLanguage,
        spokenSecondary: spokenLanguageSecondary,
        section
      });
      const vids = Array.isArray(vid?.videos) && vid.videos.length ? vid.videos : (vid ? [vid] : []);
      setVideoList(vids);
      setReferenceLinks(Array.isArray(vid?.referenceLinks) ? vid.referenceLinks : []);
      if (typeof vid?.webVideosEnabled === 'boolean') setWebVideosEnabled(vid.webVideosEnabled);
      setVideo(vids[0] || (vid?.videoId ? vid : null));

      try {
        if (user && !user.isGuest) {
          const token = await user.getIdToken();
          const started = await startSession(token, { section, topic, language, videoId: (vids[0] || vid)?.videoId });
          setSessionId(started?.sessionId ?? null);
        }
      } catch {
        setSessionId(null);
      }

      setStep('video');
      setPage('learn');
      track('video_loaded', { topic, language });
    } catch (e) {
      setError(e?.message || 'Failed to start');
    } finally {
      setBusy(false);
    }
  }

  async function startQuiz() {
    setError('');
    setBusy(true);
    try {
      track('video_completed', { topic, language, replays });

      try {
        if (sessionId && user && !user.isGuest) {
          const token = await user.getIdToken();
          await completeSession(token, { sessionId, replayCount: replays });
        }
      } catch { /* ignore */ }

      const q = await generateQuiz(topic, language);
      const quizObj = q?.quiz;
      if (!quizObj?.questions?.length) throw new Error('Quiz unavailable');

      setQuiz(quizObj);
      setIdx(0);
      setQuestionStartAt(Date.now());
      setStep('quiz');
      track('quiz_started', { topic, language });
    } catch (e) {
      setError(e?.message || 'Failed to generate quiz');
    } finally {
      setBusy(false);
    }
  }

  function selectAnswer(qid, answerIndex) {
    setAnswers((prev) => ({ ...prev, [qid]: answerIndex }));
  }

  function nextQuestion() {
    if (!current) return;
    const selected = answers[current.id];
    if (selected == null) {
      setError('Please select an option.');
      return;
    }
    setError('');

    const now = Date.now();
    const elapsedSec = questionStartAt ? Math.max(0, (now - questionStartAt) / 1000) : 0;
    setTimePerQuestionSec((prev) => {
      const next = [...prev];
      next[idx] = elapsedSec;
      return next;
    });

    if (idx + 1 < quiz.questions.length) {
      setIdx((i) => i + 1);
      setQuestionStartAt(Date.now());
    } else {
      setStep('result');
    }
  }

  async function runPrediction() {
    setError('');
    setBusy(true);
    try {
      const payload = {
        quizScore: scoreInfo.score,
        timePerQuestionSec,
        videoReplays: replays,
        perceivedDifficulty: difficulty
      };
      const pred = await predictLevel(payload);
      setResult(pred);

      const videoPayload = {
        videoId: video?.videoId || `${section}-${topic}`,
        avgPostQuiz: scoreInfo.score,
        completionRate: 1,
        rewatchRate: Math.max(0.1, replays || 0),
        feedbackRating: difficulty
      };

      const [videoRes] = await Promise.allSettled([
        scoreVideoEffectiveness(videoPayload)
      ]);
      const videoInsight = videoRes.status === 'fulfilled' ? videoRes.value : null;

      setVideoEffectiveness(videoInsight);

      try {
        if (user && !user.isGuest) {
          const token = await user.getIdToken();
          await saveAttempt(token, {
            section,
            topic,
            language,
            score: scoreInfo.score,
            timePerQuestionSec,
            perceivedDifficulty: difficulty,
            videoReplays: replays,
            weakConcepts: scoreInfo.weakConcepts,
            predictedLevel: pred?.level,
            confidence: pred?.confidence ?? null
          });
        }
      } catch { /* ignore */ }

      track('quiz_completed', {
        topic,
        language,
        score: scoreInfo.score,
        level: pred?.level
      });
    } catch (e) {
      setError(e?.message || 'Prediction failed');
    } finally {
      setBusy(false);
    }
  }

  async function loadProgress() {
    setError('');
    setBusy(true);
    try {
      if (!user || user.isGuest) throw new Error('Login required to view progress.');
      if (firebaseEnabled && Boolean(user?.email) && !emailVerified) throw new Error('Verify email to view progress.');
      const token = await user.getIdToken();
      const data = await getProgressSummary(token);
      setProgress(data);
      setPage('progress');
    } catch (e) {
      setError(e?.message || 'Failed to load progress');
    } finally {
      setBusy(false);
    }
  }

  const recommendation = useMemo(() => {
    if (!result) return null;
    const shouldRewatch = result.level === 'Beginner' || scoreInfo.score < 0.6;
    return {
      action: shouldRewatch ? 'Rewatch the video' : 'Do a quick revision',
      reason: shouldRewatch
        ? 'Your current understanding looks incomplete.'
        : 'You have a solid base; focus on weak concepts.',
      icon: shouldRewatch ? '🔄' : '✅'
    };
  }, [result, scoreInfo.score]);

  const levelIcon = useMemo(() => {
    if (!result?.level) return '📊';
    if (result.level === 'Expert') return '🏆';
    if (result.level === 'Intermediate') return '📈';
    return '📚';
  }, [result?.level]);


  return (
    <div className={`container ${(page === 'learn' && step === 'select') ? 'containerFull' : ''}`}>
      {/* HEADER */}
      {user && page !== 'auth' && (
        <div className="header">
          <div className="logo">
            <div className="logoIcon">P</div>
            <div>
              <h1 className="title">PSES</h1>
              <p className="subtitle">Programming Skill Enhancement System</p>
            </div>
          </div>

          <div className="nav">
            <button
              type="button"
              className={`navBtn ${page === 'sections' ? 'active' : ''}`}
              onClick={() => setPage('sections')}
            >
              📚 Sections
            </button>
            <button
              type="button"
              className={`navBtn ${page === 'progress' ? 'active' : ''}`}
              onClick={loadProgress}
              disabled={busy}
            >
              📊 Progress
            </button>
            {page === 'learn' && step === 'select' && (
              <button
                type="button"
                className="navBtn ghost"
                onClick={() => {
                  const el = document.getElementById('filters');
                  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
              >
                🧰 Filters
              </button>
            )}
            <div className="navSpacer" />
            <div className="langGroup">
              <span className="langPill">{spokenLanguage}</span>
              <span className="langPill alt">{spokenLanguageSecondary}</span>
            </div>
            <button
              type="button"
              className="navBtn logout"
                onClick={handleLogout}
              title={user?.email || 'Logout'}
            >
              Logout
            </button>
          </div>
        </div>
      )}

      {/* AUTH PAGE */}
      {page === 'auth' && (
        <AuthPanel
          onAuthed={(u) => {
            setUser(u);
            if (u && u.__session) {
              try {
                const token = window.localStorage.getItem('psesSessionToken');
                setSessionToken(token);
              } catch {
                /* ignore */
              }
            }
          }}
          onProfileChanged={setProfile}
          spokenLanguage={spokenLanguage}
          spokenLanguageSecondary={spokenLanguageSecondary}
          onSpokenLanguageChange={setSpokenLanguage}
          onSpokenLanguageChangeSecondary={setSpokenLanguageSecondary}
          requiresVerification={Boolean(
            user &&
            !user.isGuest &&
            firebaseEnabled &&
            !user.emailVerified &&
            !user.phoneNumber &&
            !user?.providerData?.some?.((p) => p?.providerId === 'google.com') &&
            !profile?.verified
          )}
        />
      )}

      {/* LOGGED IN CONTENT */}
      {user && page !== 'auth' && (
        <>
          {/* Email verification warning */}
          {firebaseEnabled && !user.isGuest && Boolean(user?.email) && !emailVerified && (
            <div className="guestBanner">
              <span className="icon">📧</span>
              <p>Please verify your email address, then refresh status to continue.</p>
              <button
                type="button"
                className="secondary"
                style={{ width: 'auto' }}
                disabled={busy}
                onClick={async () => {
                  setError('');
                  try {
                    setBusy(true);
                    const r = await resendEmailVerification();
                    if (r?.alreadyVerified) {
                      setError('Your email is already verified. Click refresh to continue.');
                    } else {
                      setError('Verification email sent. Check inbox/spam, then click refresh.');
                    }
                  } catch (e) {
                    setError(e?.message || 'Failed to resend verification email');
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? 'Sending…' : 'Resend email'}
              </button>
              <button
                type="button"
                className="secondary"
                style={{ width: 'auto', marginLeft: 'auto' }}
                disabled={busy}
                onClick={refreshVerificationStatus}
              >
                {busy ? 'Checking…' : "I've verified → Refresh"}
              </button>
            </div>
          )}

          {/* Guest banner */}
          {user.isGuest && (
            <div className="guestBanner">
              <span className="icon">👤</span>
              <p>You're using guest mode. Progress won't be saved.</p>
            </div>
          )}

          {/* SECTIONS PAGE */}
          {page === 'sections' && (
            <div className="sectionPage">
              <div className="card sectionCover">
              <div className="cardHeader">
                <div>
                  <h2 className="cardTitle">Choose a Learning Section</h2>
                  <p className="cardSubtitle">Select what you want to learn today</p>
                </div>
                {profile?.preferredLanguage && (
                  <span className="badge neutral">Preferred: {profile.preferredLanguage}</span>
                )}
              </div>

              <div className="sectionGrid">
                <div
                  className="sectionCard"
                  onClick={() => {
                    setSection('DSA');
                    setTopic(DSA_TOPICS[0].title);
                    setStep('select');
                    setPage('learn');
                  }}
                >
                  <div className="sectionHero" style={themeVarsFor('DSA')}>
                    <div className="sectionHeroKicker">Section</div>
                    <div className="sectionHeroTitle">DSA</div>
                  </div>
                  <div className="sectionBody">
                    <div className="sectionTitle">Data Structures & Algorithms</div>
                    <div className="sectionMeta">
                      Master fundamental DSA concepts with interactive video lessons and quizzes.
                      Choose any topic and learn it in your preferred language.
                    </div>
                    <button type="button">Start Learning →</button>
                  </div>
                </div>

                <div
                  className="sectionCard"
                  onClick={() => {
                    setSection('LANGUAGE');
                    const pl = profile?.preferredLanguage || language;
                    setLanguage(pl);
                    const list = LANGUAGE_CONCEPT_TOPICS[pl] || [];
                    setTopic((list[0] && list[0].title) || 'Object Oriented Programming');
                    setStep('select');
                    setPage('learn');
                  }}
                >
                  <div className="sectionHero" style={themeVarsFor(profile?.preferredLanguage || language)}>
                    <div className="sectionHeroKicker">Preferred</div>
                    <div className="sectionHeroTitle">{profile?.preferredLanguage || language}</div>
                  </div>
                  <div className="sectionBody">
                    <div className="sectionTitle">Programming Language Concepts</div>
                    <div className="sectionMeta">
                      Deep dive into {profile?.preferredLanguage || language} concepts.
                      Topics are automatically tailored to your preferred language.
                    </div>
                    <button type="button">Start Learning →</button>
                  </div>
                </div>
              </div>

              {error && <div className="error">{error}</div>}
              </div>
            </div>
          )}

          {/* PROGRESS PAGE */}
          {page === 'progress' && (
            <div className="card">
              <div className="cardHeader">
                <div>
                  <h2 className="cardTitle">📊 Your Progress</h2>
                  <p className="cardSubtitle">Track your learning journey</p>
                </div>
                <button className="secondary" style={{ width: 'auto' }} onClick={() => setPage('sections')}>
                  ← Back
                </button>
              </div>

              {progress && (
                <>
                  <div className="statsGrid">
                    <div className="statCard">
                      <div className="statValue">{progress.completedSessions ?? 0}</div>
                      <div className="statLabel">Sessions Completed</div>
                    </div>
                    <div className="statCard">
                      <div className="statValue">{progress.attemptsCount ?? 0}</div>
                      <div className="statLabel">Quiz Attempts</div>
                    </div>
                    <div className="statCard">
                      <div className="statValue">{Math.round((progress.avgScore ?? 0) * 100)}%</div>
                      <div className="statLabel">Average Score</div>
                    </div>
                  </div>

                  <div className="hr" />

                  <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>🔴 Weak Concepts</h3>
                  {(progress.topWeak || []).length > 0 ? (
                    <div className="weakList">
                      {progress.topWeak.map((x, i) => (
                        <span key={i} className="weakItem">{x.concept} ({x.count})</span>
                      ))}
                    </div>
                  ) : (
                    <p><small className="muted">No weak concepts identified yet.</small></p>
                  )}

                  <div className="hr" />

                  <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>📝 Recent Attempts</h3>
                  {(progress.recentAttempts || []).length > 0 ? (
                    <div className="attemptList">
                      {progress.recentAttempts.map((a) => (
                        <div key={a.id} className="attemptItem">
                          <div className="attemptInfo">
                            <h4>{a.topic}</h4>
                            <p>{a.language} • {a.predictedLevel}</p>
                          </div>
                          <div className="attemptScore">{Math.round((a.score || 0) * 100)}%</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p><small className="muted">No attempts yet. Start learning!</small></p>
                  )}
                </>
              )}

              {error && <div className="error">{error}</div>}
            </div>
          )}

          {/* LEARN - SELECT TOPIC */}
          {page === 'learn' && step === 'select' && (
            <div className="catalogPage">
              <div className="catalogHero">
                <div>
                  <div className="catalogKicker">Learning Board</div>
                  <h2 className="catalogTitle">{section === 'DSA' ? 'Data Structures & Algorithms' : `${language} Language Concepts`}</h2>
                  <div className="catalogSub">Choose a topic and start learning with a focused video lesson and a quick quiz.</div>
                </div>

                <div className="catalogHeroRight">
                  <div className="catalogSearch">
                    <input
                      placeholder="Search topics… (Arrays, Linked List, DP, etc.)"
                      value={topicSearch}
                      onChange={(e) => setTopicSearch(e.target.value)}
                    />
                    <button
                      type="button"
                      className="secondary"
                      style={{ width: 'auto' }}
                      onClick={() => setTopicSearch('')}
                    >
                      Clear
                    </button>
                  </div>

                  <div className="catalogHeroActions">
                    <button className="secondary" style={{ width: 'auto' }} onClick={() => setPage('sections')}>
                      ← Sections
                    </button>
                  </div>
                </div>
              </div>

              <div className="catalogBody">
                <aside className="catalogSidebar">
                  <div id="filters" className="filterCard filtersCard">
                    <div className="filterTitle">Filters</div>
                    <div className="filterRow">
                      <div className="filterLabel">Section</div>
                      <div className="chipRow">
                        <span className={`chip ${section === 'DSA' ? '' : 'neutral'}`}>DSA</span>
                        <span className={`chip ${section === 'LANGUAGE' ? '' : 'neutral'}`}>Language</span>
                      </div>
                    </div>

                    <div className="filterRow">
                      <div className="filterLabel">Language</div>
                      <select
                        value={language}
                        onChange={(e) => setLanguage(e.target.value)}
                        disabled={section === 'LANGUAGE'}
                      >
                        {LANGUAGE_OPTIONS.map((l) => <option key={l} value={l}>{l}</option>)}
                      </select>
                      <div className="filterHint">Coding lessons follow this programming language.</div>
                    </div>

                    <div className="filterRow">
                      <div className="filterLabel">Learning Language</div>
                      <select
                        value={spokenLanguage}
                        onChange={(e) => setSpokenLanguage(e.target.value)}
                      >
                        {SPOKEN_LANGUAGE_OPTIONS.map((l) => <option key={l} value={l}>{l}</option>)}
                      </select>
                      <div className="filterHint">We’ll search videos in this language first.</div>
                    </div>

                    <div className="filterRow">
                      <div className="filterLabel">Second Language</div>
                      <select
                        value={spokenLanguageSecondary}
                        onChange={(e) => setSpokenLanguageSecondary(e.target.value)}
                      >
                        {SPOKEN_LANGUAGE_OPTIONS.map((l) => <option key={l} value={l}>{l}</option>)}
                      </select>
                      <div className="filterHint">Fallback search before English.</div>
                    </div>
                  </div>

                  {topic?.trim() && (
                    <div className="filterCard checkoutCard">
                      <div className="filterTitle">Checkout</div>
                      <div className="filterHint">Selected topic</div>
                      <div className="selectedTopic">{topic}</div>
                      <button disabled={busy} onClick={startLearning}>
                        {busy ? 'Loading...' : '🚀 Start Learning'}
                      </button>
                      <div className="filterHint" style={{ marginTop: 10 }}>
                        Your progress is synced automatically.
                      </div>
                    </div>
                  )}
                </aside>

                <main className="catalogMain">
                  <div className="catalogMetaRow">
                    <div className="topicCount">
                      {(section === 'DSA' ? DSA_TOPICS.length : (LANGUAGE_CONCEPT_TOPICS[language] || []).length)} items
                      {topicSearch.trim() ? ` • filtered` : ''}
                    </div>
                    <div className="topicCount">Lessons in {spokenLanguage}</div>
                  </div>

                  {error && <div className="error">{error}</div>}

                  {studyFlow?.length > 0 && (
                    <div className="studyFlowBoard">
                      {studyFlow.map((flow) => (
                        <div key={flow.step} className="studyStepCard">
                          <div className="stepIndex">{flow.step}</div>
                          <div>
                            <div className="stepTitle">{flow.title}</div>
                            <div className="stepHighlights">{flow.highlights}</div>
                            <p className="stepDescription">{flow.description}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="productGrid">
                    {(
                      (topicCards.length
                        ? topicCards
                        : (section === 'DSA'
                          ? DSA_TOPICS
                          : (LANGUAGE_CONCEPT_TOPICS[language] || [])))
                    )
                      .filter(({ title }) => String(title).toLowerCase().includes(topicSearch.trim().toLowerCase()))
                      .map(({ title, difficulty, order }, idx) => {
                        const optional = isLessImportantTopic(title);
                        return (
                          <button
                            key={title}
                            type="button"
                            className={`productCard ${topic === title ? 'active' : ''}`}
                            onClick={() => setTopic(title)}
                          >
                            <div className="stepTag">Step {order || idx + 1}</div>
                            <div className="productTopic">{title}</div>
                            <div className="productMeta">
                              <div className="difficultyNote">Difficulty: {difficulty || findDefaultDifficulty(title)}</div>
                              {optional && <span className="optionalChip">Less important</span>}
                            </div>
                          </button>
                        );
                      })}
                  </div>
                </main>
              </div>
            </div>
          )}

          {/* LEARN - VIDEO */}
          {page === 'learn' && step === 'video' && video && (
            <div className="card">
              <div className="cardHeader">
                <div>
                  <span className="badge">🎥 Video Lesson</span>
                  <p className="cardSubtitle" style={{ marginTop: 4 }}>Topic: {topic}</p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="secondary" style={{ width: 'auto' }} onClick={() => setStep('select')}>
                    ← Back to Topics
                  </button>
                  <button className="secondary" style={{ width: 'auto' }} onClick={() => setStep('quiz')}>
                    Skip to Quiz
                  </button>
                </div>
              </div>


              <div className="videoWrap">
                {video?.videoId ? (
                  <iframe
                    title={video.title || 'Lesson' }
                    src={`https://www.youtube.com/embed/${video.videoId}`}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: '0' }}
                  />
                ) : (
                  <div className="webOnlyNotice">
                    No YouTube embed found for this topic. Use the Web videos below.
                  </div>
                )}
              </div>

              {Array.isArray(videoList) && videoList.length > 1 && (
                <div className="moreVideos">
                  <div className="moreVideosTitle">More videos</div>
                  <div className="moreVideosRow">
                    {videoList.map((v, index) => {
                      const videoKey = v.videoId || v.link || v.url;
                      const activeKey = video?.videoId || video?.link || video?.url;
                      const isActive = Boolean(videoKey && activeKey && videoKey === activeKey);
                      return (
                        <button
                          key={videoKey || `${topic}-${index}`}
                          type="button"
                          className={`moreVideoItem ${isActive ? 'active' : ''}`}
                          onClick={() => {
                            setVideo(v);
                            track('video_changed', { topic, language, videoId: v.videoId });
                          }}
                          title={v.title}
                        >
                          <div className="moreVideoThumb">
                            {v.thumbnail ? <img src={v.thumbnail} alt="" /> : <div className="moreVideoThumbFallback" />}
                          </div>
                          <div className="moreVideoText">
                            <div className="moreVideoName">{v.title}</div>
                            <div className="moreVideoMeta">{v.channelTitle || 'YouTube'}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {Array.isArray(referenceLinks) && referenceLinks.length > 0 && (
                <div className="webVideos">
                  <div className="moreVideosTitle">Reference links</div>
                  <div className="webVideosList">
                    {referenceLinks.map((w) => {
                      const favicon = faviconFailures[w.link] ? null : getWebIcon(w.link);
                      const hasIcon = Boolean(favicon);
                      return (
                        <a
                          key={w.link}
                          className={`webVideoItem ${hasIcon ? '' : 'noThumb'}`.trim()}
                          href={w.link}
                          target="_blank"
                          rel="noreferrer"
                          title={w.title}
                          onClick={() => track('reference_link_opened', { topic, language, url: w.link })}
                        >
                          {hasIcon && (
                            <div className="webVideoThumb">
                              <img
                                src={favicon}
                                alt=""
                                loading="lazy"
                                onError={() => setFaviconFailures((prev) => ({ ...prev, [w.link]: true }))}
                              />
                            </div>
                          )}
                          <div className="webVideoText">
                            <div className="webVideoName">{w.title}</div>
                            <div className="webVideoMeta">{w.link}</div>
                          </div>
                        </a>
                      );
                    })}
                  </div>
                </div>
              )}

              {video?.videoId && (
                <div className="videoInfo">
                  {video.thumbnail && (
                    <img src={video.thumbnail} alt="" className="videoThumbnail" />
                  )}
                  <div className="videoDetails">
                    <h3>{video.channelTitle || 'YouTube'}</h3>
                    <p>{video.description?.slice(0, 120)}...</p>
                  </div>
                </div>
              )}

              <div className="row mt-16">
                <button type="button" className="secondary" onClick={() => setReplays((r) => r + 1)}>
                  🔄 Replay ({replays})
                </button>
                <button type="button" disabled={busy} onClick={startQuiz}>
                  {busy ? 'Generating Quiz...' : '✅ Video Done → Start Quiz'}
                </button>
              </div>

              {error && <div className="error">{error}</div>}
            </div>
          )}

          {/* LEARN - QUIZ */}
          {page === 'learn' && step === 'quiz' && current && (
            <div className="card">
              <div className="cardHeader">
                <div>
                  <span className="badge">📝 Quiz</span>
                  <p className="cardSubtitle" style={{ marginTop: 4 }}>Concept: {current.concept}</p>
                </div>
                <button className="secondary" style={{ width: 'auto' }} onClick={() => setStep('video')}>
                  ← Back to Video
                </button>
              </div>

              <div className="questionProgress">
                <span style={{ fontSize: 13, color: 'var(--muted)' }}>
                  Question {idx + 1} of {quiz.questions.length}
                </span>
                <div className="progressBar">
                  <div
                    className="progressFill"
                    style={{ width: `${((idx + 1) / quiz.questions.length) * 100}%` }}
                  />
                </div>
              </div>

              <div className="questionText">{current.question}</div>

              <div className="optionsList">
                {current.options.map((opt, i) => (
                  <button
                    key={i}
                    type="button"
                    className={`optionBtn ${answers[current.id] === i ? 'selected' : ''}`}
                    onClick={() => selectAnswer(current.id, i)}
                  >
                    <div className="optionRadio" />
                    <span>{opt}</span>
                  </button>
                ))}
              </div>

              {error && <div className="error">{error}</div>}

              <button onClick={nextQuestion}>
                {idx + 1 < quiz.questions.length ? 'Next Question →' : 'Finish Quiz ✓'}
              </button>
            </div>
          )}

          {/* LEARN - RESULT */}
          {page === 'learn' && step === 'result' && (
            <div className="card">
              <div className="cardHeader">
                <div>
                  <span className="badge success">✓ Completed</span>
                  <h2 className="cardTitle" style={{ marginTop: 8 }}>Quiz Results</h2>
                </div>
              </div>

              <div className="statsGrid">
                <div className="statCard">
                  <div className="statValue">{Math.round(scoreInfo.score * 100)}%</div>
                  <div className="statLabel">Score</div>
                </div>
                <div className="statCard">
                  <div className="statValue">{scoreInfo.correct}/{scoreInfo.total}</div>
                  <div className="statLabel">Correct Answers</div>
                </div>
                <div className="statCard">
                  <div className="statValue">{replays}</div>
                  <div className="statLabel">Video Replays</div>
                </div>
              </div>

              <button disabled={busy} onClick={runPrediction}>
                {busy ? 'Analyzing...' : '🧠 Predict My Understanding Level'}
              </button>

              {result && (
                <>
                  <div className="levelDisplay">
                    <div className="levelIcon">{levelIcon}</div>
                    <div className="levelTitle">{result.level}</div>
                    <div className="levelConfidence">
                      Confidence: {Math.round((result.confidence || 0) * 100)}%
                    </div>
                  </div>

                  {scoreInfo.weakConcepts.length > 0 && (
                    <>
                      <h4 style={{ margin: '16px 0 8px' }}>Weak Concepts</h4>
                      <div className="weakList">
                        {scoreInfo.weakConcepts.map((c, i) => (
                          <span key={i} className="weakItem">{c}</span>
                        ))}
                      </div>
                    </>
                  )}

                  {recommendation && (
                    <div className="recommendation">
                      <span className="icon">{recommendation.icon}</span>
                      <div>
                        <h4>{recommendation.action}</h4>
                        <p>{recommendation.reason}</p>
                      </div>
                    </div>
                  )}

                  {videoEffectiveness && (
                    <div className="insightCard">
                      <div className="insightHeader">
                        <h4>Video Effectiveness</h4>
                        <span className="insightLabel">Aggregated from recent attempts</span>
                      </div>
                      <div className="videoScore">
                        <div className="videoScoreValue">{videoEffectiveness.effectiveness?.toFixed(1)}</div>
                        <div className="videoScoreLabel">Score / 100</div>
                      </div>
                      <div className="insightGrid">
                        <div>
                          <div className="insightLabel">Post-Quiz Avg</div>
                          <div className="insightValue">{Math.round((videoEffectiveness.aggregates?.avgPostQuiz || 0) * 100)}%</div>
                        </div>
                        <div>
                          <div className="insightLabel">Completion Rate</div>
                          <div className="insightValue">{Math.round((videoEffectiveness.aggregates?.completionRate || 0) * 100)}%</div>
                        </div>
                        <div>
                          <div className="insightLabel">Rewatch Rate</div>
                          <div className="insightValue">{(videoEffectiveness.aggregates?.rewatchRate || 0).toFixed(1)}</div>
                        </div>
                        <div>
                          <div className="insightLabel">Feedback</div>
                          <div className="insightValue">{(videoEffectiveness.aggregates?.feedback || 0).toFixed(1)}/5</div>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}

              {error && <div className="error">{error}</div>}

              <div className="hr" />
              <div className="row">
                <button className="secondary" onClick={() => setStep('select')}>
                  Try Another Topic
                </button>
                <button className="secondary" onClick={() => setPage('sections')}>
                  Back to Sections
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
