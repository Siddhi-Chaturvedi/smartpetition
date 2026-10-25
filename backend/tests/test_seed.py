"""Demo-seed provisioning: idempotency, drift repair, hashed storage, API login."""
from app.database import SessionLocal
from app.models import Grievance, Role, User
from app.security import verify_password
from app.seed import seed

LOCAL_DEMO = [
    ("citizen@smartpetition.local", "CitizenDemo@123", Role.citizen),
    ("officer@smartpetition.local", "OfficerDemo@123", Role.officer),
    ("admin@smartpetition.local", "AdminDemo@123", Role.admin),
]


def test_seed_creates_local_demo_accounts_hashed(client):
    db = SessionLocal()
    try:
        for email, pw, role in LOCAL_DEMO:
            u = db.query(User).filter(User.email == email).first()
            assert u is not None, f"seed must create {email}"
            assert u.role == role
            assert u.hashed_password != pw, "password must never be stored in plaintext"
            assert verify_password(pw, u.hashed_password), "seeded password must verify"
            assert not verify_password(pw + "x", u.hashed_password)
    finally:
        db.close()


def test_seed_is_idempotent_and_repairs_drift(client):
    db = SessionLocal()
    try:
        users_before = db.query(User).count()
        grievances_before = db.query(Grievance).count()

        # simulate drift on a demo account: wrong role + broken password hash
        u = db.query(User).filter(User.email == "citizen@smartpetition.local").first()
        u.role = Role.officer
        u.hashed_password = "pbkdf2_sha256$1$ff$ff"
        db.commit()

        report = seed(db)
        assert report.get("demo_users_repaired", 0) >= 1
        assert report["demo_users"] == 0, "re-seed must not create duplicates"

        db.expire_all()
        u2 = db.query(User).filter(User.email == "citizen@smartpetition.local").first()
        assert u2.role == Role.citizen
        assert verify_password("CitizenDemo@123", u2.hashed_password)
        assert db.query(User).count() == users_before
        assert db.query(Grievance).count() == grievances_before, "re-seed must not erase data"
    finally:
        db.close()


def test_seed_does_not_touch_real_users(client, citizen):
    db = SessionLocal()
    try:
        u = db.get(User, citizen["id"])
        hash_before = u.hashed_password
        role_before = u.role
        seed(db)
        db.expire_all()
        u2 = db.get(User, citizen["id"])
        assert u2.hashed_password == hash_before
        assert u2.role == role_before
    finally:
        db.close()


def test_local_demo_login_and_rbac_via_api(client):
    r = client.post("/api/v1/auth/login", json={
        "email": "citizen@smartpetition.local", "password": "CitizenDemo@123"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["user"]["role"] == "citizen"
    assert body["user"]["email"] == "citizen@smartpetition.local"
    ch = {"Authorization": f"Bearer {body['access_token']}"}
    assert client.get("/api/v1/grievances?page=1&page_size=8", headers=ch).status_code == 200
    assert client.get("/api/v1/analytics/my-stats", headers=ch).status_code == 200

    r2 = client.post("/api/v1/auth/login", json={
        "email": "admin@smartpetition.local", "password": "AdminDemo@123"})
    assert r2.status_code == 200 and r2.json()["user"]["role"] == "admin"
    ah = {"Authorization": f"Bearer {r2.json()['access_token']}"}
    assert client.get("/api/v1/analytics/summary", headers=ah).status_code == 200
    assert client.get("/api/v1/admin/users", headers=ah).status_code == 200

    r3 = client.post("/api/v1/auth/login", json={
        "email": "officer@smartpetition.local", "password": "OfficerDemo@123"})
    assert r3.status_code == 200 and r3.json()["user"]["role"] == "officer"

    # backend-enforced authorization: citizen cannot reach admin surfaces
    assert client.get("/api/v1/admin/users", headers=ch).status_code == 403
    assert client.get("/api/v1/analytics/summary", headers=ch).status_code == 403
    # officer cannot reach admin surfaces either
    oh = {"Authorization": f"Bearer {r3.json()['access_token']}"}
    assert client.get("/api/v1/admin/users", headers=oh).status_code == 403
    # unauthenticated cannot reach anything protected
    assert client.get("/api/v1/admin/users").status_code == 401


def test_citizen_demo_can_submit_and_track(client):
    r = client.post("/api/v1/auth/login", json={
        "email": "citizen@smartpetition.local", "password": "CitizenDemo@123"})
    tok = r.json()["access_token"]
    h = {"Authorization": f"Bearer {tok}"}
    sub = client.post("/api/v1/grievances", json={
        "title": "Seed-verified test grievance for tracking",
        "description": "Submitted by the automated seed verification test to prove "
                       "submit-track persistence works for the local demo citizen.",
        "selected_category": "roads",
    }, headers=h)
    assert sub.status_code == 201, sub.text
    tid = sub.json()["tracking_id"]
    assert tid.startswith("SP-")
    got = client.get(f"/api/v1/grievances/by-tracking/{tid}", headers=h)
    assert got.status_code == 200 and got.json()["tracking_id"] == tid
