"""AI classification, urgency scoring, model info, re-analysis, category correction."""

from tests.conftest import submit_grievance


def test_classify_endpoint(client, citizen):
    r = client.post("/api/v1/ai/classify", headers=citizen["headers"],
                    json={"text": "Garbage has not been collected for two weeks and heaps are rotting on the roadside near our street."})
    assert r.status_code == 200
    body = r.json()
    assert body["category"] == "sanitation"
    assert body["confidence"] > 0.5
    assert body["method"] in ("ml_model", "fallback_rules")
    assert body["model_version"]
    assert len(body["top_categories"]) >= 1
    assert body["recommended_department"] == "Sanitation & Public Health"
    assert isinstance(body["urgency_factors"], list) and body["urgency_factors"]


def test_classify_requires_auth(client):
    assert client.post("/api/v1/ai/classify", json={"text": "garbage everywhere"}).status_code == 401


def test_classification_covers_all_categories(client, citizen):
    samples = {
        "roads": "Massive potholes on the highway service road are damaging vehicles every day.",
        "water supply": "Drinking water supply has been cut and taps are dry in the whole colony.",
        "electricity": "Power cut every evening and the transformer is overloaded and sparking.",
        "sanitation": "The storm water drain is choked and garbage is piling up attracting rats.",
        "transport": "Bus route has been discontinued and the bus stop shelter is broken.",
        "education": "The government school teacher vacancy means students have no classes.",
        "healthcare": "The hospital casualty ward has no doctor and medicines are out of stock.",
    }
    for expected, text in samples.items():
        r = client.post("/api/v1/ai/classify", headers=citizen["headers"], json={"text": text})
        got = r.json()["category"]
        assert got == expected, f"expected {expected}, got {got} for: {text}"


def test_urgency_scoring_transparent(client, citizen):
    # critical hazard
    r = client.post("/api/v1/ai/classify", headers=citizen["headers"], json={
        "text": "A live electrical wire is hanging low over the street and a child could be electrocuted any time. Emergency needed today."})
    body = r.json()
    assert body["priority"] == "critical"
    assert body["urgency_score"] >= 0.7
    assert any("Electrical safety hazard" in f for f in body["urgency_factors"])

    # mundane request
    r = client.post("/api/v1/ai/classify", headers=citizen["headers"], json={
        "text": "Please change the name board of our street, it has faded over time."})
    body = r.json()
    assert body["priority"] in ("low", "medium")
    assert body["urgency_score"] < 0.45


def test_model_info_honest(client, citizen):
    r = client.get("/api/v1/ai/model-info", headers=citizen["headers"])
    assert r.status_code == 200
    body = r.json()
    assert body["available"] in (True, False)
    assert "SYNTHETIC" in body["dataset_note"]
    if body["available"]:
        assert "TF-IDF" in body["method"]
    else:
        assert "fallback" in body["method"].lower()


def test_prediction_recorded_separately_from_human_decision(client, citizen, admin):
    g = submit_grievance(
        client, citizen["headers"],
        title="Issue near the school boundary wall",
        description=("The boundary wall of the school has developed large cracks and is leaning. "
                     "It could collapse on the street where children walk. Requesting urgent inspection."))
    gid = g["id"]
    ai_cat = g["ai_predictions"][-1]["predicted_category"]

    # admin corrects the category to roads (human decision)
    cats = client.get("/api/v1/categories", headers=citizen["headers"]).json()
    roads_cat = next(c for c in cats if c["name"] == "roads")
    r = client.post(f"/api/v1/grievances/{gid}/category-correction", headers=admin["headers"],
                    json={"category_id": roads_cat["id"], "reason": "Wall is on public road right-of-way"})
    assert r.status_code == 200
    assert r.json()["category_name"] == "roads"

    # AI record remains intact and separate
    detail = client.get(f"/api/v1/grievances/{gid}", headers=admin["headers"]).json()
    assert detail["ai_predictions"][-1]["predicted_category"] == ai_cat

    # correction audited
    r = client.get("/api/v1/admin/audit-logs", headers=admin["headers"],
                   params={"action": "ai.category_override"})
    assert r.json()["total"] >= 1


def test_reanalyze_endpoint(client, citizen, admin):
    g = submit_grievance(client, citizen["headers"])
    r = client.post(f"/api/v1/ai/grievances/{g['id']}/reanalyze", headers=admin["headers"])
    assert r.status_code == 200
    assert r.json()["ok"] is True
    detail = client.get(f"/api/v1/grievances/{g['id']}", headers=admin["headers"]).json()
    assert len(detail["ai_predictions"]) >= 2


def test_evaluation_metrics_available(client, admin):
    """evaluation.json exists after training; endpoint returns per-class metrics."""
    from app.config import settings
    if not (settings.ai_model_dir / "evaluation.json").exists():
        from app.ai.evaluate_model import evaluate_classifier
        evaluate_classifier()
    r = client.get("/api/v1/ai/evaluation", headers=admin["headers"])
    assert r.status_code == 200
    body = r.json()
    assert "accuracy" in body and "macro_f1" in body
    assert "per_class" in body and "confusion_matrix" in body
    assert "caveat" in body


def test_fallback_classifier_is_labeled():
    """Unit-level: the rules fallback never pretends to be the ML model."""
    from app.services.ai_classifier import ClassifierService
    svc = ClassifierService()
    real_path = svc.model_path
    try:
        import app.services.ai_classifier as mod
        mod.settings.ai_model_dir = mod.Path("/nonexistent-dir")  # force fallback
        svc.load()
        assert svc.available is False
        out = svc.predict("The road is full of potholes near my house")
        assert out["method"] == "fallback_rules"
        assert out["category"] == "roads"
        assert out["confidence"] < 0.7  # deliberately modest confidence
    finally:
        mod.settings.ai_model_dir = real_path
        svc.load()
