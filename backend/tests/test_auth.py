"""Registration, login, auth failures, profile management."""
from tests.conftest import unique_email


def test_register_success(client):
    email = unique_email("reg")
    r = client.post("/api/v1/auth/register", json={
        "email": email, "full_name": "New Citizen", "password": "Passw0rd123"})
    assert r.status_code == 201
    body = r.json()
    assert body["user"]["email"] == email
    assert body["user"]["role"] == "citizen"
    assert "access_token" in body
    # password hash must never be exposed
    assert "hashed_password" not in body["user"]
    assert "password" not in body["user"]


def test_register_weak_password_rejected(client):
    r = client.post("/api/v1/auth/register", json={
        "email": unique_email("weak"), "full_name": "Weak User", "password": "allletters"})
    assert r.status_code == 422
    r = client.post("/api/v1/auth/register", json={
        "email": unique_email("short"), "full_name": "Short User", "password": "Ab1"})
    assert r.status_code == 422


def test_register_invalid_email_rejected(client):
    r = client.post("/api/v1/auth/register", json={
        "email": "not-an-email", "full_name": "Bad Email", "password": "Passw0rd123"})
    assert r.status_code == 422


def test_register_duplicate_email_rejected(client, citizen):
    r = client.post("/api/v1/auth/register", json={
        "email": citizen["email"], "full_name": "Copy Cat", "password": "Passw0rd123"})
    assert r.status_code == 409


def test_login_success_and_failure(client, citizen):
    r = client.post("/api/v1/auth/login", json={
        "email": citizen["email"], "password": "Passw0rd123"})
    assert r.status_code == 200
    assert r.json()["access_token"]

    r = client.post("/api/v1/auth/login", json={
        "email": citizen["email"], "password": "WrongPassword1"})
    assert r.status_code == 401

    r = client.post("/api/v1/auth/login", json={
        "email": unique_email("ghost"), "password": "Passw0rd123"})
    assert r.status_code == 401


def test_login_rate_limited(client):
    for _ in range(12):
        client.post("/api/v1/auth/login", json={
            "email": unique_email("rl"), "password": "Passw0rd123"})
    r = client.post("/api/v1/auth/login", json={
        "email": unique_email("rl"), "password": "Passw0rd123"})
    assert r.status_code == 429
    assert "Retry-After" in r.headers


def test_me_and_profile_update(client, citizen):
    r = client.get("/api/v1/auth/me", headers=citizen["headers"])
    assert r.status_code == 200
    assert r.json()["email"] == citizen["email"]

    r = client.patch("/api/v1/auth/me", headers=citizen["headers"],
                     json={"full_name": "Updated Name", "phone": "+919999900000"})
    assert r.status_code == 200
    assert r.json()["full_name"] == "Updated Name"
    assert r.json()["phone"] == "+919999900000"


def test_change_password(client, citizen):
    r = client.post("/api/v1/auth/change-password", headers=citizen["headers"],
                    json={"current_password": "Passw0rd123", "new_password": "NewPassw0rd456"})
    assert r.status_code == 204
    # old password no longer works
    r = client.post("/api/v1/auth/login", json={
        "email": citizen["email"], "password": "Passw0rd123"})
    assert r.status_code == 401
    r = client.post("/api/v1/auth/login", json={
        "email": citizen["email"], "password": "NewPassw0rd456"})
    assert r.status_code == 200


def test_change_password_wrong_current(client, citizen):
    r = client.post("/api/v1/auth/change-password", headers=citizen["headers"],
                    json={"current_password": "NotMyPassword1", "new_password": "NewPassw0rd456"})
    assert r.status_code == 400


def test_unauthenticated_access_rejected(client):
    assert client.get("/api/v1/auth/me").status_code == 401
    assert client.get("/api/v1/grievances").status_code == 401
    assert client.get("/api/v1/notifications").status_code == 401


def test_invalid_token_rejected(client):
    r = client.get("/api/v1/auth/me", headers={"Authorization": "Bearer garbage.token.here"})
    assert r.status_code == 401


def test_alternative_token_carriers(client, citizen):
    """Session token must also be accepted via X-Auth-Token header and
    ?access_token= query param (proxy-resilience fallbacks)."""
    tok = citizen["token"]

    r1 = client.get("/api/v1/auth/me", headers={"X-Auth-Token": tok})
    assert r1.status_code == 200 and r1.json()["email"] == citizen["email"]

    r2 = client.get("/api/v1/auth/me", params={"access_token": tok})
    assert r2.status_code == 200 and r2.json()["email"] == citizen["email"]

    # and a bogus token in any carrier is still rejected
    assert client.get("/api/v1/auth/me", headers={"X-Auth-Token": "junk"}).status_code == 401
    assert client.get("/api/v1/auth/me", params={"access_token": "junk"}).status_code == 401
