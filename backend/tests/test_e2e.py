"""Notifications, health checks, and the full citizen->officer->admin E2E workflow."""
from tests.conftest import submit_grievance


def test_citizen_gets_submission_and_status_notifications(client, citizen, roads_officer):
    g = submit_grievance(
        client, citizen["headers"],
        title="Broken footpath slabs near the market road",
        description=("Loose footpath slabs near the market road are causing elderly pedestrians "
                     "to trip and fall. Several people have been injured this month already."))
    r = client.get("/api/v1/notifications", headers=citizen["headers"], params={"unread_only": True})
    assert r.status_code == 200
    items = r.json()["items"]
    assert any(n["type"] == "submission" and g["tracking_id"] in n["body"] for n in items)
    assert r.json()["unread_count"] >= 1

    # officer posts a citizen-visible update -> citizen notified
    r = client.post(f"/api/v1/grievances/{g['id']}/comments", headers=roads_officer["headers"],
                    json={"body": "Survey done; repair crew visits on Friday."})
    assert r.status_code == 201
    r = client.get("/api/v1/notifications", headers=citizen["headers"], params={"unread_only": True})
    assert any("Friday" in n["body"] for n in r.json()["items"])


def test_mark_notifications_read(client, citizen):
    submit_grievance(client, citizen["headers"])
    r = client.get("/api/v1/notifications", headers=citizen["headers"])
    nid = r.json()["items"][0]["id"]
    r = client.post(f"/api/v1/notifications/{nid}/read", headers=citizen["headers"])
    assert r.status_code == 204
    r = client.post("/api/v1/notifications/read-all", headers=citizen["headers"])
    assert r.status_code == 204
    r = client.get("/api/v1/notifications", headers=citizen["headers"], params={"unread_only": True})
    assert r.json()["unread_count"] == 0


def test_email_not_claimed_delivered_when_unconfigured(client, citizen):
    """With SMTP disabled, email_status must honestly say not_configured."""
    submit_grievance(client, citizen["headers"])
    from app.database import SessionLocal
    from app.models import Notification
    db = SessionLocal()
    try:
        n = db.query(Notification).filter(Notification.user_id == citizen["id"]).first()
        assert n.email_status == "not_configured"
    finally:
        db.close()


def test_health_endpoints(client):
    r = client.get("/api/v1/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["database"] == "ok"
    assert body["ai_model"]
    assert body["version"]
    r = client.get("/api/v1/health/ready")
    assert r.status_code == 200 and r.json()["ready"] is True


def test_root_redirects_to_docs_info(client):
    r = client.get("/")
    assert r.status_code == 200
    assert r.json()["docs"] == "/docs"


def test_openapi_available(client):
    r = client.get("/openapi.json")
    assert r.status_code == 200
    assert "/api/v1/grievances" in r.json()["paths"]


def test_end_to_end_workflow(client, citizen, roads_officer, admin):
    """Full lifecycle: submit -> triage -> assign -> progress -> resolve ->
    feedback -> close, with audit trail and analytics reflecting each step."""
    # 1. citizen submits
    g = submit_grievance(
        client, citizen["headers"],
        title="Deep potholes on the bypass road near the toll plaza",
        description=("The road surface on the bypass near the toll plaza has caved in creating a "
                     "crater and huge potholes. Trucks and two-wheelers swerve dangerously to avoid "
                     "them and two accidents happened this week. Please repair the road urgently "
                     "before the monsoon worsens it."),
        location="Bypass Road", jurisdiction="Chennai Central")
    gid = g["id"]
    assert g["status"] == "submitted"
    assert g["priority"] in ("high", "critical")
    assert g["department_name"] == "Roads & Infrastructure"

    # 2. admin sees it in system-wide listing; officer in department listing
    assert client.get(f"/api/v1/grievances/{gid}", headers=admin["headers"]).status_code == 200
    r = client.get("/api/v1/grievances", headers=roads_officer["headers"],
                   params={"search": g["tracking_id"]})
    assert r.json()["total"] == 1

    # 3. officer accepts (under review -> in progress) with internal note
    r = client.post(f"/api/v1/grievances/{gid}/comments", headers=roads_officer["headers"],
                    json={"body": "INTERNAL: site inspection confirms 2ft crater", "is_internal": True})
    assert r.status_code == 201
    r = client.post(f"/api/v1/grievances/{gid}/transition", headers=roads_officer["headers"],
                    json={"to_status": "under_review", "note": "Inspecting site"})
    assert r.status_code == 200
    r = client.post(f"/api/v1/grievances/{gid}/transition", headers=roads_officer["headers"],
                    json={"to_status": "in_progress", "note": "Contractor mobilized for filling"})
    assert r.status_code == 200

    # 4. citizen adds more info
    r = client.post(f"/api/v1/grievances/{gid}/comments", headers=citizen["headers"],
                    json={"body": "Another accident last night, please hurry"})
    assert r.status_code == 201

    # 5. resolve with summary + resolution
    r = client.post(f"/api/v1/grievances/{gid}/transition", headers=roads_officer["headers"],
                    json={"to_status": "resolved",
                          "resolution_summary": "Crater filled with hot-mix asphalt and compacted; "
                                                "surface marked for night visibility."})
    assert r.status_code == 200 and r.json()["status"] == "resolved"

    # 6. citizen gives feedback and closes
    r = client.post(f"/api/v1/grievances/{gid}/feedback", headers=citizen["headers"],
                    json={"rating": 5, "comments": "Excellent, quick response"})
    assert r.status_code == 201
    r = client.post(f"/api/v1/grievances/{gid}/transition", headers=citizen["headers"],
                    json={"to_status": "closed", "note": "Verified personally"})
    assert r.status_code == 200 and r.json()["status"] == "closed"

    # 7. audit trail contains the whole story
    r = client.get("/api/v1/admin/audit-logs", headers=admin["headers"],
                   params={"entity_type": "grievance"})
    log_actions = {i["action"] for i in r.json()["items"]}
    assert {"grievance.created", "grievance.status_changed", "feedback.submitted"} <= log_actions

    # 8. analytics reflect the resolution (avg resolution time now non-null)
    s = client.get("/api/v1/analytics/summary", headers=admin["headers"]).json()
    assert s["avg_resolution_hours"] is not None
    assert s["feedback_count"] >= 1
    assert s["feedback_avg_rating"] is not None

    # 9. detail shows complete timeline + feedback
    detail = client.get(f"/api/v1/grievances/{gid}", headers=citizen["headers"]).json()
    assert detail["feedback"]["rating"] == 5
    assert [h["to_status"] for h in detail["history"]] == [
        "submitted", "under_review", "in_progress", "resolved", "closed"]
    internal_visible_to_citizen = [c for c in detail["comments"] if c["is_internal"]]
    assert internal_visible_to_citizen == []
