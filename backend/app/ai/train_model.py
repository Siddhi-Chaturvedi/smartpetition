"""Reproducible training script for the SmartPetition category classifier.

Pipeline: text -> FeatureUnion(word TF-IDF, char TF-IDF) -> Logistic Regression.
Saves a joblib bundle containing the pipeline, the class list, the model
version, training metrics, and the dataset provenance.

Usage (from backend/):
    python -m app.ai.train_model
"""
import json
import platform
from datetime import datetime, timezone
from pathlib import Path

import joblib
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, classification_report, f1_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import FeatureUnion, Pipeline

from ..config import settings

DATA_FILE = Path(__file__).resolve().parent / "data" / "synthetic_grievances.csv"
MODEL_DIR = settings.ai_model_dir


def build_pipeline() -> Pipeline:
    return Pipeline([
        ("vec", FeatureUnion([
            ("word", TfidfVectorizer(ngram_range=(1, 2), min_df=2, sublinear_tf=True, stop_words="english")),
            ("char", TfidfVectorizer(analyzer="char_wb", ngram_range=(2, 4), min_df=3, sublinear_tf=True)),
        ])),
        ("clf", LogisticRegression(max_iter=2000, C=4.0, class_weight="balanced")),
    ])


def train() -> dict:
    if not DATA_FILE.exists():
        from .data.generate_dataset import main as gen
        gen()
    df = pd.read_csv(DATA_FILE)
    X_train, X_test, y_train, y_test = train_test_split(
        df["text"], df["category"], test_size=0.2, random_state=42, stratify=df["category"]
    )
    pipe = build_pipeline()
    pipe.fit(X_train, y_train)

    pred = pipe.predict(X_test)
    acc = accuracy_score(y_test, pred)
    macro_f1 = f1_score(y_test, pred, average="macro")
    report = classification_report(y_test, pred, output_dict=True)

    version = f"tfidf-logreg-v1-{datetime.now(timezone.utc):%Y%m%d}"
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    bundle = {
        "pipeline": pipe,
        "version": version,
        "classes": sorted(df["category"].unique().tolist()),
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "metrics": {"accuracy": round(float(acc), 4), "macro_f1": round(float(macro_f1), 4)},
        "classification_report": report,
        "dataset": {
            "file": str(DATA_FILE.name),
            "rows": int(len(df)),
            "provenance": "SYNTHETIC template-generated demo data (see generate_dataset.py). "
                          "Metrics below are on a held-out split of SYNTHETIC data and do NOT "
                          "represent real-world accuracy.",
        },
        "environment": {"python": platform.python_version()},
    }
    joblib.dump(bundle, MODEL_DIR / "classifier.joblib")
    (MODEL_DIR / "evaluation.json").write_text(
        json.dumps({k: bundle[k] for k in ("version", "trained_at", "metrics",
                                           "classification_report", "dataset")}, indent=2)
    )
    print(f"Trained {version}: accuracy={acc:.4f} macro_f1={macro_f1:.4f} -> {MODEL_DIR/'classifier.joblib'}")
    return bundle


if __name__ == "__main__":
    train()
