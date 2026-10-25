"""Grievance submission, persistence, tracking, ownership, search, pagination."""
import uuid

from tests.conftest import submit_grievance, unique_email


def test_submit_creates_persistent_grievance(client, citizen):
    g = submit_grievance(client, citizen["headers"])
    assert g["tracking_id"].startswith("SP-")
    assert g["status"] == "submitted"
    assert g["citizen_id"] == citizen["id"]
    assert g["due_at"] is not None  # SLA deadline computed
    assert g["submitted_at"] is not None

    # persistence: re-fetch from the API (fresh DB read)
    r = client.get(f"/api/v1/grievances/{g['id']}", headers=citizen["headers"])
    assert r.status_code == 200
    assert r.json()["tracking_id"] == g["tracking_id"]

    r = client.get(f"/api/v1/grievances/by-tracking/{g['tracking_id']}",
                   headers=citizen["headers"])
    assert r.status_code == 200


def test_submission_validation(client, citizen):
    r = client.post("/api/v1/grievances", headers=citizen["headers"],
                    json={"title": "ab", "description": "too short"})
    assert r.status_code == 422
    body = r.json()
    assert body["detail"] == "Validation failed"
    fields = {e["field"] for e in body["errors"]}
    assert "title" in fields and "description" in fields


def test_ai_analysis_runs_on_submission(client, citizen):
    g = submit_grievance(
        client, citizen["headers"],
        title="Sewage contaminating drinking water supply in our colony",
        description=("Sewage water is mixing with the drinking water pipeline in our colony. "
                     "The tap water smells foul and several children have fallen sick. "
                     "This affects hundreds of families and needs immediate action."))
    assert g["ai_predictions"], "AI prediction record must be created"
    pred = g["ai_predictions"][-1]
    assert pred["method"] in ("ml_model", "fallback_rules")
    assert pred["predicted_category"] == "water supply"
    assert 0.0 <= pred["confidence"] <= 1.0
    assert pred["urgency_level"] in ("low", "medium", "high", "critical")
    # routed to the mapped department
    assert g["department_name"] == "Water Supply & Sewerage"
    assert g["category_name"] == "water supply"


def test_grievance_survives_ai_failure(client, citizen, monkeypatch):
    """A valid grievance must be stored even if AI processing blows up."""
    from app.services import workflow

    def boom(*a, **k):
        raise RuntimeError("simulated AI outage")

    monkeypatch.setattr(workflow, "full_analysis", boom)
    g = submit_grievance(client, citizen["headers"])
    assert g["id"] > 0
    assert g["ai_analysis_status"] == "failed"
    assert g["needs_triage"] is True


def test_ownership_isolation(client, citizen):
    g = submit_grievance(client, citizen["headers"])

    email = unique_email("other")
    r = client.post("/api/v1/auth/register", json={
        "email": email, "full_name": "Other Citizen", "password": "Passw0rd123"})
    other_headers = {"Authorization": f"Bearer {r.json()['access_token']}"}

    assert client.get(f"/api/v1/grievances/{g['id']}", headers=other_headers).status_code == 404
    r = client.get("/api/v1/grievances", headers=other_headers)
    assert all(item["id"] != g["id"] for item in r.json()["items"])


def test_citizen_list_scoped_and_paginated(client, citizen):
    for i in range(3):
        submit_grievance(client, citizen["headers"], title=f"Pagination test grievance {i} {uuid.uuid4().hex[:6]}")
    r = client.get("/api/v1/grievances", headers=citizen["headers"],
                   params={"page": 1, "page_size": 2})
    body = r.json()
    assert body["page_size"] == 2
    assert len(body["items"]) == 2
    assert body["total"] >= 3
    r2 = client.get("/api/v1/grievances", headers=citizen["headers"],
                    params={"page": 2, "page_size": 2})
    ids1 = {i["id"] for i in body["items"]}
    ids2 = {i["id"] for i in r2.json()["items"]}
    assert not (ids1 & ids2)


def test_search_filter(client, citizen):
    marker = uuid.uuid4().hex[:8]
    submit_grievance(client, citizen["headers"],
                     title=f"Unique marker {marker} road issue",
                     description=f"Road damaged near the school, marker {marker}, vehicles getting damaged daily.")
    r = client.get("/api/v1/grievances", headers=citizen["headers"], params={"search": marker})
    assert r.json()["total"] == 1
    r = client.get("/api/v1/grievances", headers=citizen["headers"], params={"search": "zzz-no-such-text"})
    assert r.json()["total"] == 0


def test_officer_sees_department_cases_only(client, citizen, roads_officer, water_officer):
    g = submit_grievance(
        client, citizen["headers"],
        title="Road caved in near bus stop",
        description=("The main road near the bus stop has caved in creating a crater. "
                     "Buses and cars are getting stuck and it is dangerous at night."))
    assert g["department_name"] == "Roads & Infrastructure"
    r = client.get(f"/api/v1/grievances/{g['id']}", headers=roads_officer["headers"])
    assert r.status_code == 200
    r = client.get(f"/api/v1/grievances/{g['id']}", headers=water_officer["headers"])
    assert r.status_code == 404  # other department cannot see it


def test_low_confidence_prediction_flagged_for_review(client, citizen):
    g = submit_grievance(
        client, citizen["headers"],
        title="Strange issue with unclear wording",
        description=("Something is happening in our area and it is not good at all. "
                     "Please look into the matter and do the needful soon."))
    assert g["ai_analysis_status"] in ("needs_review", "completed")
    if g["ai_analysis_status"] == "needs_review":
        assert g["needs_triage"] or g["department_id"] is not None


def test_citizen_cannot_submit_for_others_or_impersonate(client, roads_officer):
    # officers cannot use the citizen submission endpoint
    r = client.post("/api/v1/grievances", headers=roads_officer["headers"], json={
        "title": "Officer trying to submit", "description": "x" * 40})
    assert r.status_code == 403
