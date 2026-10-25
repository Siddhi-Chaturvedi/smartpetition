"""Shared test fixtures — isolated SQLite database per test session."""
import os
import tempfile
import uuid
from pathlib import Path

# Configure the environment BEFORE importing the app (settings are cached).
_TMP = Path(tempfile.mkdtemp(prefix="smartpetition-tests-"))
os.environ["DATABASE_URL"] = f"sqlite:///{_TMP / 'test.db'}"
os.environ["ENVIRONMENT"] = "testing"
os.environ["SEED_DEMO_DATA"] = "true"
os.environ["FIRST_ADMIN_EMAIL"] = "root@admin.smartpetition.dev"
os.environ["FIRST_ADMIN_PASSWORD"] = "AdminTest#123"
os.environ["SLA_CHECK_INTERVAL_SECONDS"] = "3600"  # no background sweeps during tests
os.environ["JWT_SECRET"] = "test-secret-not-for-production"
os.environ["EMAIL_ENABLED"] = "false"

import pytest
from fastapi.testclient import TestClient

from app.main import app  # noqa: E402
from app.rate_limit import limiter  # noqa: E402


@pytest.fixture(scope="session")
def client():
    # 'testing' env skips the dev-only seed in lifespan; seed explicitly instead.
    from app.database import SessionLocal, init_db
    from app.seed import seed
    init_db()
    db = SessionLocal()
    try:
        seed(db)
    finally:
        db.close()
    with TestClient(app) as c:
        yield c


@pytest.fixture(autouse=True)
def _clear_rate_limits():
    limiter._hits.clear()
    yield
    limiter._hits.clear()


def unique_email(prefix: str = "user") -> str:
    return f"{prefix}-{uuid.uuid4().hex[:10]}@test.smartpetition.dev"


@pytest.fixture
def citizen(client):
    email = unique_email("citizen")
    r = client.post("/api/v1/auth/register", json={
        "email": email, "full_name": "Test Citizen", "password": "Passw0rd123"})
    assert r.status_code == 201, r.text
    data = r.json()
    return {"token": data["access_token"], "email": email, "id": data["user"]["id"],
            "headers": {"Authorization": f"Bearer {data['access_token']}"}}


@pytest.fixture
def admin(client):
    r = client.post("/api/v1/auth/login", json={
        "email": "root@admin.smartpetition.dev", "password": "AdminTest#123"})
    assert r.status_code == 200, r.text
    data = r.json()
    return {"token": data["access_token"], "id": data["user"]["id"],
            "headers": {"Authorization": f"Bearer {data['access_token']}"}}


@pytest.fixture
def roads_officer(client):
    r = client.post("/api/v1/auth/login", json={
        "email": "officer@demo.smartpetition.dev", "password": "Officer#123"})
    assert r.status_code == 200, r.text
    data = r.json()
    return {"token": data["access_token"], "id": data["user"]["id"],
            "headers": {"Authorization": f"Bearer {data['access_token']}"}}


@pytest.fixture
def water_officer(client):
    r = client.post("/api/v1/auth/login", json={
        "email": "water.officer@demo.smartpetition.dev", "password": "Officer#123"})
    assert r.status_code == 200, r.text
    data = r.json()
    return {"token": data["access_token"], "id": data["user"]["id"],
            "headers": {"Authorization": f"Bearer {data['access_token']}"}}


def submit_grievance(client, headers, title=None, description=None, **kw):
    payload = {
        "title": title or f"Test grievance {uuid.uuid4().hex[:8]}",
        "description": description or (
            "Street lights on our road have not been working for a week. "
            "The entire stretch is dark at night and residents feel unsafe walking home."
        ),
        "location": kw.pop("location", "Test Nagar"),
        "jurisdiction": kw.pop("jurisdiction", "Chennai Central"),
    }
    payload.update(kw)
    r = client.post("/api/v1/grievances", headers=headers, json=payload)
    assert r.status_code == 201, r.text
    return r.json()
