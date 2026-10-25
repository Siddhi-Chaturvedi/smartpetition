"""AI grievance classification service.

Primary: TF-IDF (word+char n-grams) + Logistic Regression trained on the
bundled synthetic dataset (see app/ai/train_model.py). The model and its
version are persisted to disk with joblib.

Fallback: an EXPLICITLY LABELED keyword rule engine (method='fallback_rules')
used only when no trained model file exists. It never masquerades as an ML
prediction.
"""
import json
import re
from pathlib import Path

import joblib
from sqlalchemy.orm import Session

from ..config import settings
from ..models import Category

MODEL_FILE = "classifier.joblib"
CATEGORIES = [
    "roads", "water supply", "electricity", "sanitation",
    "transport", "education", "healthcare", "other",
]

_FALLBACK_RULES: list[tuple[str, str]] = [
    (r"road|pothole|street ?light|highway|footpath|pavement|traffic signal|speed breaker|encroach", "roads"),
    (r"water|tap|pipe ?line|leakage|supply|drinking|bore ?well|tanker|sewage", "water supply"),
    (r"electric|power|current|voltage|transformer|black ?out|wire|meter|bill.*electric", "electricity"),
    (r"garbage|waste|litter|dump|toilet|sanitation|drain|mosquito|sweep|clean", "sanitation"),
    (r"bus|metro|train|transport|auto|taxi|ticket|route|stand", "transport"),
    (r"school|teacher|student|education|mid ?day meal|scholarship|college|classroom", "education"),
    (r"hospital|doctor|health|clinic|medicine|patient|ambulance|vaccin|nurse", "healthcare"),
]


class ClassifierService:
    def __init__(self) -> None:
        self._pipeline = None
        self._version = "none"
        self._loaded_at: float = 0.0
        self.load()

    @property
    def model_path(self) -> Path:
        return settings.ai_model_dir / MODEL_FILE

    def load(self) -> bool:
        """Load (or reload) the trained model. Returns True when an ML model is available."""
        if self.model_path.exists():
            try:
                bundle = joblib.load(self.model_path)
                self._pipeline = bundle["pipeline"]
                self._version = bundle.get("version", "unknown")
                return True
            except Exception:  # noqa: BLE001 - corrupt model -> honest fallback
                self._pipeline = None
        self._pipeline = None
        self._version = "none"
        return False

    @property
    def available(self) -> bool:
        return self._pipeline is not None

    @property
    def version(self) -> str:
        return self._version

    # ------------------------------------------------------------------ inference
    def predict(self, text: str) -> dict:
        text = (text or "").strip()
        if not text:
            return self._empty()
        if self._pipeline is not None:
            return self._predict_ml(text)
        return self._predict_fallback(text)

    def _predict_ml(self, text: str) -> dict:
        clf = self._pipeline["clf"]
        vec = self._pipeline["vec"]
        probs = clf.predict_proba(vec.transform([text]))[0]
        classes = list(clf.classes_)
        ranked = sorted(zip(classes, probs), key=lambda x: -x[1])
        best, best_p = ranked[0]
        return {
            "category": best,
            "confidence": round(float(best_p), 4),
            "top_categories": [{"category": c, "confidence": round(float(p), 4)} for c, p in ranked[:3]],
            "method": "ml_model",
            "model_version": self._version,
        }

    def _predict_fallback(self, text: str) -> dict:
        t = text.lower()
        hits: dict[str, int] = {}
        for pattern, cat in _FALLBACK_RULES:
            n = len(re.findall(pattern, t))
            if n:
                hits[cat] = hits.get(cat, 0) + n
        if hits:
            ranked = sorted(hits.items(), key=lambda x: -x[1])
            best = ranked[0][0]
            total = sum(hits.values())
            conf = round(0.30 + 0.30 * (hits[best] / total), 4)  # deliberately modest
            return {
                "category": best,
                "confidence": conf,
                "top_categories": [{"category": c, "confidence": round(0.3 + 0.3 * n / total, 4)}
                                   for c, n in ranked[:3]],
                "method": "fallback_rules",
                "model_version": "rules-v1",
            }
        return {
            "category": "other",
            "confidence": 0.2,
            "top_categories": [{"category": "other", "confidence": 0.2}],
            "method": "fallback_rules",
            "model_version": "rules-v1",
        }

    def _empty(self) -> dict:
        return {"category": "other", "confidence": 0.0, "top_categories": [],
                "method": "fallback_rules" if not self.available else "ml_model",
                "model_version": self._version}

    # ------------------------------------------------------------------ department rec
    def recommend_department(self, db: Session, category_name: str) -> str:
        cat = db.query(Category).filter(Category.name.ilike(category_name)).first()
        if cat and cat.department:
            return cat.department.name
        return ""


classifier = ClassifierService()


def full_analysis(db: Session, text: str) -> dict:
    """Classification + urgency + department recommendation in one call."""
    from .urgency import score_urgency

    pred = classifier.predict(text)
    score, priority, factors = score_urgency(text, pred["category"])
    dept = classifier.recommend_department(db, pred["category"])
    pred.update({
        "urgency_score": score,
        "urgency_level": priority.value,
        "urgency_factors": factors,
        "recommended_department": dept,
        "top_categories_json": json.dumps(pred["top_categories"]),
        "urgency_factors_json": json.dumps(factors),
    })
    return pred
