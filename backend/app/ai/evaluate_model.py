"""Evaluation script: accuracy, macro-F1, per-class precision/recall, confusion matrix.

Also evaluates the duplicate detector on a small labeled set.

Usage (from backend/):
    python -m app.ai.evaluate_model
"""
import json

import joblib
import pandas as pd
from sklearn.metrics import confusion_matrix
from sklearn.model_selection import train_test_split

from ..config import settings
from .data.generate_dataset import OUT as DATA_FILE

MODEL_DIR = settings.ai_model_dir


def evaluate_classifier() -> dict:
    bundle = joblib.load(MODEL_DIR / "classifier.joblib")
    pipe = bundle["pipeline"]
    df = pd.read_csv(DATA_FILE)
    # Same stratified split as training -> evaluates the unseen test portion
    _, X_test, _, y_test = train_test_split(
        df["text"], df["category"], test_size=0.2, random_state=42, stratify=df["category"]
    )
    pred = pipe.predict(X_test)
    labels = sorted(df["category"].unique().tolist())
    cm = confusion_matrix(y_test, pred, labels=labels).tolist()
    from sklearn.metrics import accuracy_score, classification_report, f1_score
    result = {
        "model_version": bundle["version"],
        "n_test": int(len(X_test)),
        "accuracy": round(float(accuracy_score(y_test, pred)), 4),
        "macro_f1": round(float(f1_score(y_test, pred, average="macro")), 4),
        "per_class": {
            cls: {
                "precision": round(float(v["precision"]), 4),
                "recall": round(float(v["recall"]), 4),
                "f1": round(float(v["f1-score"]), 4),
                "support": int(v["support"]),
            }
            for cls, v in classification_report(y_test, pred, output_dict=True).items()
            if cls in labels
        },
        "confusion_matrix": {"labels": labels, "matrix": cm},
        "caveat": "Evaluated on SYNTHETIC template data; not evidence of real-world accuracy.",
    }
    (MODEL_DIR / "evaluation.json").write_text(json.dumps(result, indent=2))
    return result


LABELED_DUPLICATE_PAIRS: list[tuple[str, str, bool]] = [
    ("Garbage not collected at Anna Nagar for two weeks, heaps rotting on roadside",
     "Garbage has not been collected in Anna Nagar for two weeks and heaps are rotting on the roadside", True),
    ("No water supply in Velachery since Monday, tank is dry",
     "Velachery has had no water supply since Monday and the overhead tank is completely dry", True),
    ("Potholes on the main road at Tambaram are dangerous for two-wheelers",
     "Street lights near Tambaram bus stand have not worked for a week", False),
    ("Transformer sparking near Guindy could explode, houses are adjacent",
     "The school in Guindy has no drinking water for students", False),
    ("Open manhole near the school in Adyar, children could fall in",
     "A manhole near the Adyar school has been left open and children might fall into it", True),
    ("Bus route 21G not running via Porur, commuters stranded",
     "Auto drivers at Porur refuse meter and overcharge passengers", False),
]


def evaluate_duplicates() -> dict:
    from ..services.duplicates import dedup_evaluation_metrics
    return dedup_evaluation_metrics(LABELED_DUPLICATE_PAIRS)


if __name__ == "__main__":
    clf = evaluate_classifier()
    dup = evaluate_duplicates()
    print(json.dumps({"classifier": clf, "duplicate_detection": dup}, indent=2))
