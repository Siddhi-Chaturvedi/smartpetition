"""Role-based access control, department scoping, internal-note confidentiality."""
from tests.conftest import submit_grievance, unique_email


def test_admin_endpoints_forbidden_for_citizen_and_officer(client, citizen, roads_officer, admin):
    for headers in (citizen["headers"], roads_officer["headers"]):
        assert client.get("/api/v1/admin/users", headers=headers).status_code == 403
        assert client.get("/api/v1/admin/audit-logs", headers=headers).status_code == 403
        assert client.post("/api/v1/admin/sla/run-sweep", headers=headers).status_code == 403
        assert client.get("/api/v1/ai/evaluation", headers=headers).status_code == 403
    assert client.get("/api/v1/admin/users", headers=admin["headers"]).status_code == 200


def test_officer_endpoints_forbidden_for_citizen(client, citizen):
    assert client.get("/api/v1/analytics/summary", headers=citizen["headers"]).status_code == 403
    assert client.get("/api/v1/grievances/export/csv", headers=citizen["headers"]).status_code == 403
    assert client.get("/api/v1/departments/1/officers", headers=citizen["headers"]).status_code == 403


def test_internal_notes_hidden_from_citizen(client, citizen, roads_officer):
    g = submit_grievance(
        client, citizen["headers"],
        title="Damaged footpath near the market",
        description=("The footpath near the market is completely broken and encroached with loose "
                     "slabs. Pedestrians, including elderly people, are forced to walk on the busy "
                     "road and several have tripped and been injured this month. Requesting "
                     "restoration of the footpath."))
    gid = g["id"]
    r = client.post(f"/api/v1/grievances/{gid}/comments", headers=roads_officer["headers"],
                    json={"body": "INTERNAL: contractor dispute; do not share", "is_internal": True})
    assert r.status_code == 201
    r = client.post(f"/api/v1/grievances/{gid}/comments", headers=roads_officer["headers"],
                    json={"body": "Survey completed; repairs begin Monday.", "is_internal": False})
    assert r.status_code == 201

    detail = client.get(f"/api/v1/grievances/{gid}", headers=citizen["headers"]).json()
    bodies = [c["body"] for c in detail["comments"]]
    assert any("Survey completed" in b for b in bodies)
    assert not any("INTERNAL" in b for b in bodies)

    detail = client.get(f"/api/v1/grievances/{gid}", headers=roads_officer["headers"]).json()
    bodies = [c["body"] for c in detail["comments"]]
    assert any("INTERNAL" in b for b in bodies)


def test_citizen_cannot_post_internal_notes(client, citizen):
    g = submit_grievance(client, citizen["headers"])
    r = client.post(f"/api/v1/grievances/{g['id']}/comments", headers=citizen["headers"],
                    json={"body": "sneaky", "is_internal": True})
    assert r.status_code == 201
    detail = client.get(f"/api/v1/grievances/{g['id']}", headers=citizen["headers"]).json()
    assert all(not c["is_internal"] for c in detail["comments"])


def test_cross_department_officer_cannot_act(client, citizen, roads_officer, water_officer):
    g = submit_grievance(
        client, citizen["headers"],
        title="Water pipeline burst flooding the street",
        description=("A major water pipeline has burst and the entire street is flooded. "
                     "Water supply is wasted and the road is being damaged. Urgent repair needed."))
    assert g["department_name"] == "Water Supply & Sewerage"
    gid = g["id"]
    # roads officer cannot view or act
    assert client.get(f"/api/v1/grievances/{gid}", headers=roads_officer["headers"]).status_code == 404
    r = client.post(f"/api/v1/grievances/{gid}/transition", headers=roads_officer["headers"],
                    json={"to_status": "in_progress"})
    assert r.status_code == 404
    # water officer can
    r = client.post(f"/api/v1/grievances/{gid}/transition", headers=water_officer["headers"],
                    json={"to_status": "in_progress"})
    assert r.status_code == 200


def test_admin_user_management(client, admin):
    email = unique_email("created-officer")
    # officer requires department
    r = client.post("/api/v1/admin/users", headers=admin["headers"], json={
        "email": email, "full_name": "New Officer", "password": "Passw0rd123",
        "role": "officer"})
    assert r.status_code == 422
    depts = client.get("/api/v1/departments", headers=admin["headers"]).json()
    dept_id = next(d["id"] for d in depts if d["name"] == "Transport")
    r = client.post("/api/v1/admin/users", headers=admin["headers"], json={
        "email": email, "full_name": "New Officer", "password": "Passw0rd123",
        "role": "officer", "department_id": dept_id})
    assert r.status_code == 201
    uid = r.json()["id"]

    # new officer can log in
    r = client.post("/api/v1/auth/login", json={"email": email, "password": "Passw0rd123"})
    assert r.status_code == 200

    # deactivate
    r = client.patch(f"/api/v1/admin/users/{uid}", headers=admin["headers"],
                     json={"is_active": False})
    assert r.status_code == 200 and r.json()["is_active"] is False
    # deactivated user cannot log in
    r = client.post("/api/v1/auth/login", json={"email": email, "password": "Passw0rd123"})
    assert r.status_code == 403

    # admin cannot deactivate self
    r = client.patch(f"/api/v1/admin/users/{admin['id']}", headers=admin["headers"],
                     json={"is_active": False})
    assert r.status_code == 409


def test_assignment_and_reassignment(client, citizen, admin, roads_officer):
    g = submit_grievance(
        client, citizen["headers"],
        title="Traffic signal malfunction at junction",
        description=("The traffic signal at the main junction is malfunctioning and stuck on red. "
                     "Long jams during peak hours and ambulances are getting stuck. Please fix."))
    gid = g["id"]
    # reassign to a specific officer with reason
    r = client.post(f"/api/v1/grievances/{gid}/assign", headers=admin["headers"],
                    json={"officer_id": roads_officer["id"], "reason": "Field engineer for signals"})
    assert r.status_code == 200
    assert r.json()["assignee_id"] == roads_officer["id"]
    # assignment history recorded
    detail = client.get(f"/api/v1/grievances/{gid}", headers=admin["headers"]).json()
    assert len(detail["assignments"]) >= 1
    assert any(a["reason"] == "Field engineer for signals" for a in detail["assignments"])
    # invalid officer id
    r = client.post(f"/api/v1/grievances/{gid}/assign", headers=admin["headers"],
                    json={"officer_id": 999999, "reason": "x"})
    assert r.status_code == 422


def test_audit_log_records_actions(client, citizen, admin, roads_officer):
    g = submit_grievance(client, citizen["headers"])
    gid = g["id"]
    client.post(f"/api/v1/grievances/{gid}/transition", headers=roads_officer["headers"],
                json={"to_status": "under_review", "note": "Checking"})
    r = client.get("/api/v1/admin/audit-logs", headers=admin["headers"],
                   params={"entity_type": "grievance"})
    assert r.status_code == 200
    actions = [i["action"] for i in r.json()["items"]]
    assert "grievance.created" in actions
    assert "grievance.status_changed" in actions


def test_password_hash_never_exposed(client, admin):
    users = client.get("/api/v1/admin/users", headers=admin["headers"]).json()
    for u in users:
        assert "hashed_password" not in u
        assert "password" not in u
