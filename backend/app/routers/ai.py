"""AI endpoints: on-demand classification, model info, re-analysis, evaluations."""
import json
from pathlib import Path

from fastapi import APIRouter, HTTPException

from ..config import settings
from ..deps import CurrentUser, DbDep, RequireAdmin, RequireOfficerOrAdmin
from ..models import AIPrediction, AIAnalysisStatus, Grievance
from ..schemas import ClassifyRequest, ClassifyResponse
from ..services.ai_classifier import classifier, full_analysis
from ..services.audit import record_audit

router = APIRouter(prefix="/ai", tags=["ai"])


@router.post("/classify", response_model=ClassifyResponse)
def classify(payload: ClassifyRequest, user: CurrentUser, db: DbDep):
    """Classify arbitrary text (used by the submission form for live hints)."""
    result = full_analysis(db, payload.text)
    return ClassifyResponse(
        category=result["category"], confidence=result["confidence"],
        top_categories=result["top_categories"], method=result["method"],
        model_version=result["model_version"], priority=result["urgency_level"],
        urgency_score=result["urgency_score"], urgency_factors=result["urgency_factors"],
        recommended_department=result["recommended_department"],
    )


@router.get("/model-info")
def model_info(user: CurrentUser):
    """Public to authenticated users: transparency about the model in use."""
    return {
        "available": classifier.available,
        "version": classifier.version,
        "method": "trained TF-IDF + Logistic Regression" if classifier.available
                  else "rule-based fallback (no trained model found — run backend: python -m app.ai.train_model)",
        "categories": ["roads", "water supply", "electricity", "sanitation",
                       "transport", "education", "healthcare", "other"],
        "confidence_threshold": settings.ai_confidence_threshold,
        "dataset_note": "Trained on SYNTHETIC template-generated demo data. Metrics do not "
                        "represent real-world accuracy. See backend/app/ai/data/generate_dataset.py.",
    }


@router.get("/evaluation")
def evaluation(user: RequireAdmin):
    """Stored evaluation metrics (accuracy, macro-F1, per-class P/R, confusion matrix)."""
    path: Path = settings.ai_model_dir / "evaluation.json"
    if not path.exists():
        raise HTTPException(404, "No evaluation found. Run: python -m app.ai.evaluate_model")
    return json.loads(path.read_text())


@router.post("/grievances/{grievance_id}/reanalyze")
def reanalyze(grievance_id: int, user: RequireOfficerOrAdmin, db: DbDep):
    """Re-run AI analysis on an existing grievance (e.g. after model retraining)."""
    g = db.get(Grievance, grievance_id)
    if g is None:
        raise HTTPException(404, "Grievance not found")
    if user.role.value == "officer" and g.department_id != user.department_id:
        raise HTTPException(403, "Not your department")
    try:
        analysis = full_analysis(db, f"{g.title}. {g.description}")
        db.add(AIPrediction(
            grievance_id=g.id, model_version=analysis["model_version"], method=analysis["method"],
            predicted_category=analysis["category"], confidence=analysis["confidence"],
            top_categories_json=analysis["top_categories_json"],
            urgency_score=analysis["urgency_score"], urgency_level=analysis["urgency_level"],
            urgency_factors_json=analysis["urgency_factors_json"],
            recommended_department=analysis["recommended_department"],
        ))
        g.ai_analysis_status = (AIAnalysisStatus.needs_review
                                if analysis["confidence"] < settings.ai_confidence_threshold
                                else AIAnalysisStatus.completed)
        record_audit(db, user, "ai.reanalyzed", "grievance", g.id,
                     {"category": analysis["category"], "confidence": analysis["confidence"]})
        db.commit()
        return {"ok": True, "prediction": analysis}
    except Exception as exc:  # noqa: BLE001
        g.ai_analysis_status = AIAnalysisStatus.failed
        db.commit()
        raise HTTPException(500, f"AI analysis failed: {type(exc).__name__}")
