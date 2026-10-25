"""SLA deadlines, escalation sweep, notifications, manual trigger."""
from datetime import timedelta

from tests.conftest import submit_grievance


def _make_overdue(client, citizen, hours=100):
    g = submit_grievance(
        client, citizen["headers"],
        title="Chronic street light outage on main avenue",
        description=("Street lights on the main avenue have not worked for a long period. "
                     "The stretch is dark and unsafe for pedestrians and school children."),
        location="SLA Test Nagar")
    # simulate time passing: push due date into the past directly in the DB
    from app.database import SessionLocal
    from app.models import Grievance
    from app.models import utcnow
    db = SessionLocal()
    try:
        row = db.get(Grievance, g["id"])
        row.due_at = utcnow() - timedelta(hours=hours)
        db.commit()
    finally:
        db.close()
    return g


def test_sla_deadline_computed_on_submission(client, citizen):
    g = submit_grievance(client, citizen["headers"])
    assert g["due_at"] is not None
    assert g["submitted_at"] is not None


def test_manual_sweep_escalates_overdue(client, citizen, admin):
    g = _make_overdue(client, citizen, hours=100)

    r = client.post("/api/v1/admin/sla/run-sweep", headers=admin["headers"])
    assert r.status_code == 200
    stats = r.json()
    assert stats["overdue"] >= 1
    assert stats["escalations_created"] >= 1

    detail = client.get(f"/api/v1/grievances/{g['id']}", headers=admin["headers"]).json()
    assert detail["status"] == "escalated"
    assert detail["is_overdue"] is True
    # escalation recorded in history
    assert any(h["to_status"] == "escalated" and "SLA" in h["note"] for h in detail["history"])

    # escalation event persisted
    r = client.get("/api/v1/admin/escalations", headers=admin["headers"])
    assert r.status_code == 200
    assert any(e["grievance_id"] == g["id"] for e in r.json())


def test_sweep_is_idempotent(client, citizen, admin):
    g = _make_overdue(client, citizen, hours=10)
    client.post("/api/v1/admin/sla/run-sweep", headers=admin["headers"]).json()
    client.post("/api/v1/admin/sla/run-sweep", headers=admin["headers"]).json()
    # second sweep must not create a new escalation for the same level
    from app.database import SessionLocal
    from app.models import EscalationEvent
    db = SessionLocal()
    try:
        events = db.query(EscalationEvent).filter(EscalationEvent.grievance_id == g["id"]).all()
        levels = [e.level for e in events]
        assert len(levels) == len(set(levels)), "duplicate escalation levels must not repeat"
    finally:
        db.close()


def test_escalation_notifies_assignee_and_admins(client, citizen, admin):
    _make_overdue(client, citizen, hours=200)  # deep overdue -> high level
    client.post("/api/v1/admin/sla/run-sweep", headers=admin["headers"])
    # admin should have an escalation notification
    r = client.get("/api/v1/notifications", headers=admin["headers"], params={"unread_only": True})
    assert any("Escalation" in n["title"] or "OVERDUE" in n["title"] for n in r.json()["items"])


def test_overdue_filter_in_listing(client, citizen, admin):
    _make_overdue(client, citizen, hours=50)
    r = client.get("/api/v1/grievances", headers=admin["headers"], params={"overdue": "true"})
    assert r.status_code == 200
    assert r.json()["total"] >= 1
    assert all(i["is_overdue"] for i in r.json()["items"])


def test_sla_rules_crud(client, admin, citizen):
    r = client.post("/api/v1/admin/sla-rules", headers=admin["headers"], json={
        "scope": "category", "scope_value": "transport",
        "resolution_hours": 48, "escalation_hours": 24})
    assert r.status_code == 201
    rule_id = r.json()["id"]
    # upsert updates in place
    r = client.post("/api/v1/admin/sla-rules", headers=admin["headers"], json={
        "scope": "category", "scope_value": "transport",
        "resolution_hours": 60, "escalation_hours": 30})
    assert r.json()["id"] == rule_id
    assert r.json()["resolution_hours"] == 60

    # new transport grievance uses the category rule (60h)
    g = submit_grievance(
        client, citizen["headers"],
        title="Bus shelter broken at the terminus",
        description=("The bus shelter roof at the terminus has collapsed and passengers "
                     "stand in sun and rain. Seating is broken too. Requesting rebuild."))
    assert g["category_name"] == "transport"
    from datetime import datetime
    due = datetime.fromisoformat(g["due_at"])
    sub = datetime.fromisoformat(g["submitted_at"])
    delta_hours = (due - sub).total_seconds() / 3600
    assert 59 <= delta_hours <= 61

    r = client.delete(f"/api/v1/admin/sla-rules/{rule_id}", headers=admin["headers"])
    assert r.status_code == 204


def test_sla_rules_forbidden_for_citizen(client, citizen):
    assert client.get("/api/v1/admin/sla-rules", headers=citizen["headers"]).status_code == 403
