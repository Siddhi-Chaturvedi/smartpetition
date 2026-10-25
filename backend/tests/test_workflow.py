"""State machine: valid/invalid transitions, resolution, rejection, reopening, feedback."""
from tests.conftest import submit_grievance


def _road_grievance(client, citizen):
    return submit_grievance(
        client, citizen["headers"],
        title="Potholes causing accidents on main road",
        description=("There are huge potholes on the main road and two-wheelers are skidding. "
                     "Several minor accidents have happened this week. Please repair urgently."))


def test_full_happy_path(client, citizen, roads_officer):
    g = _road_grievance(client, citizen)
    gid = g["id"]

    r = client.post(f"/api/v1/grievances/{gid}/transition", headers=roads_officer["headers"],
                    json={"to_status": "under_review", "note": "Verifying with field staff"})
    assert r.status_code == 200 and r.json()["status"] == "under_review"

    r = client.post(f"/api/v1/grievances/{gid}/transition", headers=roads_officer["headers"],
                    json={"to_status": "in_progress", "note": "Repair crew scheduled for tomorrow"})
    assert r.status_code == 200 and r.json()["status"] == "in_progress"

    r = client.post(f"/api/v1/grievances/{gid}/transition", headers=roads_officer["headers"],
                    json={"to_status": "resolved",
                          "resolution_summary": "Road patched and compacted; surface restored."})
    assert r.status_code == 200 and r.json()["status"] == "resolved"
    assert r.json()["resolved_at"] is not None
    assert r.json()["resolution_summary"].startswith("Road patched")

    # citizen notified of resolution
    r = client.get("/api/v1/notifications", headers=citizen["headers"])
    types = [n["type"] for n in r.json()["items"]]
    assert "resolution" in types

    r = client.post(f"/api/v1/grievances/{gid}/transition", headers=citizen["headers"],
                    json={"to_status": "closed", "note": "Verified the repair, thanks"})
    assert r.status_code == 200 and r.json()["status"] == "closed"

    # timeline complete
    detail = client.get(f"/api/v1/grievances/{gid}", headers=citizen["headers"]).json()
    states = [h["to_status"] for h in detail["history"]]
    assert states == ["submitted", "under_review", "in_progress", "resolved", "closed"]


def test_invalid_transitions_rejected(client, citizen, roads_officer):
    g = _road_grievance(client, citizen)
    gid = g["id"]
    # submitted -> resolved is not a permitted edge
    r = client.post(f"/api/v1/grievances/{gid}/transition", headers=roads_officer["headers"],
                    json={"to_status": "resolved", "resolution_summary": "Skipping steps"})
    assert r.status_code == 409
    # submitted -> closed not permitted
    r = client.post(f"/api/v1/grievances/{gid}/transition", headers=citizen["headers"],
                    json={"to_status": "closed"})
    assert r.status_code == 409
    # citizen cannot move to in_progress
    r = client.post(f"/api/v1/grievances/{gid}/transition", headers=citizen["headers"],
                    json={"to_status": "in_progress"})
    assert r.status_code == 409


def test_resolution_requires_summary(client, citizen, roads_officer):
    g = _road_grievance(client, citizen)
    client.post(f"/api/v1/grievances/{g['id']}/transition", headers=roads_officer["headers"],
                json={"to_status": "in_progress"})
    r = client.post(f"/api/v1/grievances/{g['id']}/transition", headers=roads_officer["headers"],
                    json={"to_status": "resolved"})
    assert r.status_code == 409
    assert "resolution summary" in r.json()["detail"].lower()


def test_rejection_requires_reason(client, citizen, roads_officer):
    g = _road_grievance(client, citizen)
    r = client.post(f"/api/v1/grievances/{g['id']}/transition", headers=roads_officer["headers"],
                    json={"to_status": "rejected"})
    assert r.status_code == 409
    r = client.post(f"/api/v1/grievances/{g['id']}/transition", headers=roads_officer["headers"],
                    json={"to_status": "rejected",
                          "rejection_reason": "Duplicate of SP-XXXX; original case is being handled."})
    assert r.status_code == 200
    assert r.json()["rejection_reason"].startswith("Duplicate")
    # citizen notified
    r = client.get("/api/v1/notifications", headers=citizen["headers"])
    assert any(n["type"] == "rejection" for n in r.json()["items"])


def test_reopen_by_citizen(client, citizen, roads_officer):
    g = _road_grievance(client, citizen)
    gid = g["id"]
    client.post(f"/api/v1/grievances/{gid}/transition", headers=roads_officer["headers"],
                json={"to_status": "in_progress"})
    client.post(f"/api/v1/grievances/{gid}/transition", headers=roads_officer["headers"],
                json={"to_status": "resolved", "resolution_summary": "Patched."})
    r = client.post(f"/api/v1/grievances/{gid}/transition", headers=citizen["headers"],
                    json={"to_status": "reopened", "note": "The patch broke again within days"})
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "reopened"
    assert body["reopen_count"] == 1
    assert body["resolved_at"] is None  # resolution cleared

    # officer can pick it up again
    r = client.post(f"/api/v1/grievances/{gid}/transition", headers=roads_officer["headers"],
                    json={"to_status": "in_progress", "note": "Re-inspecting"})
    assert r.status_code == 200


def test_reopen_limit_enforced(client, citizen, roads_officer):
    g = _road_grievance(client, citizen)
    gid = g["id"]
    for _ in range(2):
        client.post(f"/api/v1/grievances/{gid}/transition", headers=roads_officer["headers"],
                    json={"to_status": "in_progress"})
        client.post(f"/api/v1/grievances/{gid}/transition", headers=roads_officer["headers"],
                    json={"to_status": "resolved", "resolution_summary": "Done."})
        r = client.post(f"/api/v1/grievances/{gid}/transition", headers=citizen["headers"],
                        json={"to_status": "reopened", "note": "Still broken"})
        assert r.status_code == 200
    client.post(f"/api/v1/grievances/{gid}/transition", headers=roads_officer["headers"],
                json={"to_status": "in_progress"})
    client.post(f"/api/v1/grievances/{gid}/transition", headers=roads_officer["headers"],
                json={"to_status": "resolved", "resolution_summary": "Done again."})
    r = client.post(f"/api/v1/grievances/{gid}/transition", headers=citizen["headers"],
                    json={"to_status": "reopened", "note": "Third time"})
    assert r.status_code == 409
    assert "twice" in r.json()["detail"]


def test_allowed_transitions_endpoint(client, citizen, roads_officer):
    g = _road_grievance(client, citizen)
    r = client.get(f"/api/v1/grievances/{g['id']}/allowed-transitions",
                   headers=citizen["headers"])
    assert r.status_code == 200
    assert r.json()["current"] == "submitted"
    assert r.json()["allowed"] == []  # citizen cannot move a submitted case
    r = client.get(f"/api/v1/grievances/{g['id']}/allowed-transitions",
                   headers=roads_officer["headers"])
    assert set(r.json()["allowed"]) == {"under_review", "in_progress", "rejected"}


def test_feedback_only_after_resolution(client, citizen, roads_officer):
    g = _road_grievance(client, citizen)
    gid = g["id"]
    r = client.post(f"/api/v1/grievances/{gid}/feedback", headers=citizen["headers"],
                    json={"rating": 4, "comments": "ok"})
    assert r.status_code == 409

    client.post(f"/api/v1/grievances/{gid}/transition", headers=roads_officer["headers"],
                json={"to_status": "in_progress"})
    client.post(f"/api/v1/grievances/{gid}/transition", headers=roads_officer["headers"],
                json={"to_status": "resolved", "resolution_summary": "Fixed."})
    r = client.post(f"/api/v1/grievances/{gid}/feedback", headers=citizen["headers"],
                    json={"rating": 4, "comments": "Good work, timely repair"})
    assert r.status_code == 201
    # duplicate feedback rejected
    r = client.post(f"/api/v1/grievances/{gid}/feedback", headers=citizen["headers"],
                    json={"rating": 2, "comments": "changed my mind"})
    assert r.status_code == 409
    # invalid rating
    r = client.post(f"/api/v1/grievances/{gid}/feedback", headers=citizen["headers"],
                    json={"rating": 9, "comments": "x"})
    assert r.status_code == 422


def test_priority_override_with_reason(client, citizen, roads_officer):
    g = _road_grievance(client, citizen)
    gid = g["id"]
    r = client.post(f"/api/v1/grievances/{gid}/priority-override",
                    headers=roads_officer["headers"],
                    json={"priority": "critical", "reason": "School bus route; children at risk"})
    assert r.status_code == 200
    assert r.json()["priority"] == "critical"
    assert r.json()["priority_override_reason"].startswith("School bus")
    # reason is mandatory
    r = client.post(f"/api/v1/grievances/{gid}/priority-override",
                    headers=roads_officer["headers"],
                    json={"priority": "low", "reason": ""})
    assert r.status_code == 422
    # citizen cannot override
    r = client.post(f"/api/v1/grievances/{gid}/priority-override",
                    headers=citizen["headers"],
                    json={"priority": "low", "reason": "please lower it"})
    assert r.status_code == 403
