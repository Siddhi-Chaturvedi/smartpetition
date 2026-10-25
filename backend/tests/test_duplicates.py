"""Duplicate detection: candidates, explainability, review workflow, no auto-rejection."""
import uuid

from tests.conftest import submit_grievance


DUP_TITLE = "Garbage not collected in KK Nagar street for two weeks"
DUP_DESC = ("Garbage has not been collected in our KK Nagar street for two weeks. "
            "Heaps are rotting on the roadside, stray dogs scatter them at night, "
            "and the stench is unbearable. Mosquitoes are breeding too.")


def _original(client, citizen):
    return submit_grievance(client, citizen["headers"], title=DUP_TITLE, description=DUP_DESC,
                            location="KK Nagar", jurisdiction="Chennai South")


def test_preview_finds_similar(client, citizen):
    _original(client, citizen)
    r = client.post("/api/v1/grievances/preview-duplicates", headers=citizen["headers"], json={
        "title": "Garbage piling up in KK Nagar, not collected for fortnight",
        "description": ("Our KK Nagar street has rotting garbage heaps on the roadside for two weeks "
                        "because collection stopped. Stray dogs scatter the waste at night and the "
                        "smell is unbearable. Please restart collection."),
        "category": "sanitation", "location": "KK Nagar"})
    assert r.status_code == 200
    items = r.json()
    assert len(items) >= 1
    top = items[0]
    assert top["score"] > 0.5
    assert top["matched_terms"], "candidates must be explainable"
    assert top["tracking_id"].startswith("SP-")


def test_preview_ignores_dissimilar(client, citizen):
    r = client.post("/api/v1/grievances/preview-duplicates", headers=citizen["headers"], json={
        "title": "School teacher vacancy in a different district",
        "description": ("The mathematics teacher post at the government school has been vacant "
                        "for a semester and board exam students are losing the year completely."),
        "category": "education", "location": "Elsewhere"})
    assert r.status_code == 200
    assert all(i["score"] < 0.6 for i in r.json())


def test_duplicates_recorded_but_never_auto_rejected(client, citizen):
    orig = _original(client, citizen)
    near_dup = submit_grievance(
        client, citizen["headers"],
        title="Garbage still not collected in KK Nagar street",
        description=("It has been two more weeks and the garbage heaps in KK Nagar are still "
                     "rotting on the roadside. Dogs scatter them and the stench is unbearable. "
                     "Mosquito breeding is getting worse. Please act now."),
        location="KK Nagar", jurisdiction="Chennai South")
    # the near-duplicate is STILL accepted and stored
    assert near_dup["id"] != orig["id"]
    assert near_dup["status"] == "submitted"
    # and candidates were recorded against it
    detail = client.get(f"/api/v1/grievances/{near_dup['id']}", headers=citizen["headers"]).json()
    cands = detail["duplicate_candidates"]
    assert any(c["candidate_grievance_id"] == orig["id"] for c in cands)
    matched = next(c for c in cands if c["candidate_grievance_id"] == orig["id"])
    assert matched["score"] > 0.4
    assert matched["review_status"] == "pending"
    assert matched["method"] in ("tfidf", "keyword", "embeddings")


def test_duplicate_review_workflow(client, citizen, admin):
    orig = _original(client, citizen)
    dup = submit_grievance(
        client, citizen["headers"],
        title=f"Repeated garbage complaint KK Nagar {uuid.uuid4().hex[:6]}",
        description=("Garbage heaps continue rotting on the KK Nagar roadside for weeks; "
                     "dogs scatter them, stench unbearable, mosquitoes breeding heavily."),
        location="KK Nagar")
    detail = client.get(f"/api/v1/grievances/{dup['id']}", headers=admin["headers"]).json()
    cand = next((c for c in detail["duplicate_candidates"]
                 if c["candidate_grievance_id"] == orig["id"]), None)
    assert cand is not None, "expected the original as a recorded candidate"

    r = client.post(f"/api/v1/grievances/duplicates/{cand['id']}/review",
                    headers=admin["headers"], params={"decision": "confirmed_duplicate"})
    assert r.status_code == 200
    reviewed = next(c for c in r.json()["duplicate_candidates"] if c["id"] == cand["id"])
    assert reviewed["review_status"] == "confirmed_duplicate"
    # both grievances still exist (nothing deleted)
    assert client.get(f"/api/v1/grievances/{orig['id']}", headers=admin["headers"]).status_code == 200
    assert client.get(f"/api/v1/grievances/{dup['id']}", headers=admin["headers"]).status_code == 200

    r = client.post(f"/api/v1/grievances/duplicates/{cand['id']}/review",
                    headers=admin["headers"], params={"decision": "dismissed"})
    assert r.status_code == 200


def test_duplicate_review_requires_staff(client, citizen):
    _original(client, citizen)
    dup = submit_grievance(client, citizen["headers"],
                           title="Another KK Nagar garbage pile complaint",
                           description=DUP_DESC.replace("two weeks", "three weeks"),
                           location="KK Nagar")
    detail = client.get(f"/api/v1/grievances/{dup['id']}", headers=citizen["headers"]).json()
    if detail["duplicate_candidates"]:
        cid = detail["duplicate_candidates"][0]["id"]
        r = client.post(f"/api/v1/grievances/duplicates/{cid}/review",
                        headers=citizen["headers"], params={"decision": "dismissed"})
        assert r.status_code == 403


def test_duplicate_detection_evaluation_metrics():
    """Precision/recall on the labeled pair set must be computed honestly."""
    from app.ai.evaluate_model import LABELED_DUPLICATE_PAIRS
    from app.services.duplicates import dedup_evaluation_metrics
    m = dedup_evaluation_metrics(LABELED_DUPLICATE_PAIRS)
    assert m["tp"] + m["fp"] + m["fn"] + m["tn"] == len(LABELED_DUPLICATE_PAIRS)
    assert m["precision"] >= 0.7
    assert m["recall"] >= 0.5
    assert 0.0 <= m["f1"] <= 1.0
