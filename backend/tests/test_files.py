"""Attachment validation, safe storage, private authenticated downloads."""
import io

from tests.conftest import submit_grievance, unique_email


def _jpg_bytes(n=100):
    return b"\xff\xd8\xff\xe0" + b"\x00" * n + b"\xff\xd9"


def _png_bytes(n=100):
    return b"\x89PNG\r\n\x1a\n" + b"\x00" * n


def test_valid_image_upload_and_private_download(client, citizen):
    g = submit_grievance(client, citizen["headers"])
    gid = g["id"]
    r = client.post(f"/api/v1/grievances/{gid}/attachments", headers=citizen["headers"],
                    files={"file": ("evidence.jpg", io.BytesIO(_jpg_bytes()), "image/jpeg")})
    assert r.status_code == 201
    att = r.json()
    assert att["size_bytes"] > 0

    # owner can download
    r = client.get(f"/api/v1/grievances/{gid}/attachments/{att['id']}", headers=citizen["headers"])
    assert r.status_code == 200
    assert r.content.startswith(b"\xff\xd8\xff")

    # unauthenticated access blocked
    r = client.get(f"/api/v1/grievances/{gid}/attachments/{att['id']}")
    assert r.status_code == 401

    # another citizen blocked
    email = unique_email("fileuser")
    r2 = client.post("/api/v1/auth/register", json={
        "email": email, "full_name": "File User", "password": "Passw0rd123"})
    other = {"Authorization": f"Bearer {r2.json()['access_token']}"}
    r = client.get(f"/api/v1/grievances/{gid}/attachments/{att['id']}", headers=other)
    assert r.status_code == 404


def test_executable_uploads_blocked(client, citizen):
    g = submit_grievance(client, citizen["headers"])
    gid = g["id"]
    for name, content in [
        ("malware.exe", b"MZ\x90\x00malicious"),
        ("script.bat", b"@echo off"),
        ("payload.ps1", b"Invoke-WebRequest"),
        ("double.ext.exe.jpg", _jpg_bytes()),   # double-extension trick
        ("shell.sh", b"#!/bin/sh"),
    ]:
        r = client.post(f"/api/v1/grievances/{gid}/attachments", headers=citizen["headers"],
                        files={"file": (name, io.BytesIO(content), "application/octet-stream")})
        assert r.status_code == 422, f"{name} should be rejected"
        assert "not allowed" in r.json()["detail"]


def test_disallowed_extension_blocked(client, citizen):
    g = submit_grievance(client, citizen["headers"])
    r = client.post(f"/api/v1/grievances/{g['id']}/attachments", headers=citizen["headers"],
                    files={"file": ("archive.zip", io.BytesIO(b"PK\x03\x04data"), "application/zip")})
    assert r.status_code == 422


def test_oversized_upload_blocked(client, citizen, monkeypatch):
    from app.config import settings
    monkeypatch.setattr(settings, "max_upload_bytes", 1024)
    g = submit_grievance(client, citizen["headers"])
    r = client.post(f"/api/v1/grievances/{g['id']}/attachments", headers=citizen["headers"],
                    files={"file": ("big.jpg", io.BytesIO(_jpg_bytes(5000)), "image/jpeg")})
    assert r.status_code == 422
    assert "too large" in r.json()["detail"].lower()


def test_content_type_must_match_extension(client, citizen):
    g = submit_grievance(client, citizen["headers"])
    # a text file pretending to be a PNG
    r = client.post(f"/api/v1/grievances/{g['id']}/attachments", headers=citizen["headers"],
                    files={"file": ("fake.png", io.BytesIO(b"#!/bin/bash evil"), "image/png")})
    assert r.status_code == 422
    assert "does not match" in r.json()["detail"]


def test_path_traversal_filename_rejected(client, citizen):
    g = submit_grievance(client, citizen["headers"])
    r = client.post(f"/api/v1/grievances/{g['id']}/attachments", headers=citizen["headers"],
                    files={"file": ("../../etc/passwd.jpg", io.BytesIO(_jpg_bytes()), "image/jpeg")})
    assert r.status_code == 422


def test_valid_pdf_upload(client, citizen):
    g = submit_grievance(client, citizen["headers"])
    r = client.post(f"/api/v1/grievances/{g['id']}/attachments", headers=citizen["headers"],
                    files={"file": ("bill.pdf", io.BytesIO(b"%PDF-1.4 test content"), "application/pdf")})
    assert r.status_code == 201


def test_stored_files_not_under_original_names(client, citizen):
    """Uploaded files are stored under random names (no direct URL guessing)."""
    g = submit_grievance(client, citizen["headers"])
    r = client.post(f"/api/v1/grievances/{g['id']}/attachments", headers=citizen["headers"],
                    files={"file": ("my-secret-photo.jpg", io.BytesIO(_jpg_bytes()), "image/jpeg")})
    assert r.status_code == 201
    from app.config import settings
    from app.database import SessionLocal
    from app.models import Attachment
    db = SessionLocal()
    try:
        att = db.query(Attachment).filter(Attachment.grievance_id == g["id"]).first()
        assert att is not None
        assert att.stored_name != att.original_filename
        assert len(att.stored_name) == 32 + 4  # 16-byte hex + .jpg
        assert (settings.upload_dir / att.stored_name).exists()
        assert not (settings.upload_dir / "my-secret-photo.jpg").exists()
    finally:
        db.close()
