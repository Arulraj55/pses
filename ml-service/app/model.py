from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Tuple

import joblib
import numpy as np
from sklearn.linear_model import LogisticRegression

MODEL_PATH = os.path.join(os.path.dirname(__file__), "model.joblib")


@dataclass
class FeatureVector:
    score: float
    avg_time: float
    time_std: float
    replays: float
    difficulty: float


def featurize(quiz_score: float, time_per_q: list[float], video_replays: int, perceived_difficulty: int) -> FeatureVector:
    times = np.array(time_per_q, dtype=float) if time_per_q else np.array([], dtype=float)
    avg_time = float(times.mean()) if times.size else 0.0
    time_std = float(times.std()) if times.size else 0.0

    return FeatureVector(
        score=float(quiz_score),
        avg_time=avg_time,
        time_std=time_std,
        replays=float(video_replays),
        difficulty=float(perceived_difficulty),
    )


def _generate_synthetic(n: int = 4000, seed: int = 7) -> Tuple[np.ndarray, np.ndarray]:
    rng = np.random.default_rng(seed)

    # score: 0..1
    score = rng.beta(2.2, 1.8, size=n)
    # avg time: seconds, skewed; cap at 180
    avg_time = np.clip(rng.lognormal(mean=3.2, sigma=0.45, size=n), 5, 180)
    time_std = np.clip(rng.lognormal(mean=2.1, sigma=0.55, size=n), 0.5, 120)
    replays = np.clip(rng.poisson(lam=1.3, size=n), 0, 10)
    difficulty = rng.integers(1, 6, size=n)

    # Heuristic labeling to form a stable baseline
    # Higher score, lower time, fewer replays, lower difficulty -> advanced
    z = (
        2.6 * score
        - 0.006 * avg_time
        - 0.003 * time_std
        - 0.18 * replays
        - 0.10 * (difficulty - 3)
    )

    # Convert z to 3 classes with thresholds
    y = np.zeros(n, dtype=int)
    y[z > 1.25] = 2  # Advanced
    y[(z > 0.45) & (z <= 1.25)] = 1  # Intermediate
    y[z <= 0.45] = 0  # Beginner

    X = np.stack([score, avg_time, time_std, replays, difficulty], axis=1)
    return X, y


def load_or_train() -> LogisticRegression:
    if os.path.exists(MODEL_PATH):
        return joblib.load(MODEL_PATH)

    X, y = _generate_synthetic()

    clf = LogisticRegression(
        multi_class="multinomial",
        max_iter=400,
        n_jobs=None,
        class_weight=None,
        random_state=7,
    )
    clf.fit(X, y)

    joblib.dump(clf, MODEL_PATH)
    return clf


def predict_level(clf: LogisticRegression, features: FeatureVector) -> tuple[str, float]:
    X = np.array([[features.score, features.avg_time, features.time_std, features.replays, features.difficulty]], dtype=float)
    proba = clf.predict_proba(X)[0]
    idx = int(np.argmax(proba))
    label = {0: "Beginner", 1: "Intermediate", 2: "Advanced"}[idx]
    conf = float(proba[idx])
    return label, conf
