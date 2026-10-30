import json
import urllib.parse

import pytest
from test_api import MEMBER
from test_workouts import call, log


class FakeGoogle:
    """Stands in for Google's OAuth and Drive endpoints."""

    def __init__(self):
        self.uploads: list[tuple[str, bytes]] = []
        self.folders = 0
        self.revoked: list[str] = []
        self.fail_token = False

    def __call__(self, method, url, *, data=None, headers=None):
        import drive

        if url == drive.TOKEN_URL:
            form = dict(urllib.parse.parse_qsl(data.decode()))
            if self.fail_token:
                raise drive.GoogleError(400, "invalid_grant")
            if form["grant_type"] == "authorization_code":
                assert form["code"] == "good-code"
                payload = "eyJlbWFpbCI6ICJiQGdtYWlsLmV4YW1wbGUifQ"  # {"email": "b@gmail.example"}
                return {
                    "refresh_token": "refresh-1",
                    "access_token": "access-1",
                    "scope": "openid email https://www.googleapis.com/auth/drive.file",
                    "id_token": f"x.{payload}.y",
                }
            assert form["refresh_token"] == "refresh-1"
            return {"access_token": "access-2"}
        if url.startswith(drive.REVOKE_URL):
            self.revoked.append(url)
            return {}
        if url.startswith(drive.UPLOAD_URL):
            boundary = headers["Content-Type"].split("boundary=")[1]
            parts = data.split(f"--{boundary}".encode())
            meta = json.loads(parts[1].split(b"\r\n\r\n", 1)[1])
            content = parts[2].split(b"\r\n\r\n", 1)[1].rstrip(b"\r\n")
            self.uploads.append((meta["name"], content))
            return {"id": f"file-{len(self.uploads)}"}
        if url.startswith(drive.FILES_URL) and method == "POST":
            self.folders += 1
            return {"id": f"folder-{self.folders}"}
        if url.startswith(drive.FILES_URL) and method == "GET":
            return {"id": url.split("/")[-1].split("?")[0], "trashed": False}
        raise AssertionError(f"unexpected {method} {url}")


@pytest.fixture
def google(aws, monkeypatch):
    import drive

    fake = FakeGoogle()
    monkeypatch.setattr(drive, "http", fake)
    monkeypatch.setattr(drive, "_client", {"client_id": "cid", "client_secret": "secret"})
    monkeypatch.setattr(drive, "ALLOWED_ORIGINS", ["https://reps.example"])
    return fake


def connect(aws):
    status, started = call(aws, "POST /api/drive/connect", body={"origin": "https://reps.example"})
    assert status == 200, started
    query = dict(urllib.parse.parse_qsl(urllib.parse.urlparse(started["url"]).query))
    assert query["redirect_uri"] == "https://reps.example/drive/callback"
    assert "drive.file" in query["scope"]
    body = {"code": "good-code", "state": query["state"], "origin": "https://reps.example"}
    return call(aws, "POST /api/drive/callback", body=body)


def test_not_set_up(aws, monkeypatch):
    import drive

    monkeypatch.setattr(drive, "_client", {})
    assert call(aws, "GET /api/drive")[1] == {"configured": False, "connected": False}
    assert call(aws, "POST /api/drive/connect", body={"origin": "x"})[0] == 503


def test_connect_and_export(aws, google):
    status, result = connect(aws)
    assert status == 200, result
    assert (result["connected"], result["email"]) == (True, "b@gmail.example")

    log(aws, "set-0001", weight=60, reps=10, comment="easy")
    log(aws, "set-0002", "running-treadmill", distance=5.2, seconds=1530)
    status, result = call(aws, "POST /api/drive/export")
    assert status == 200, result
    assert [name for name, _ in google.uploads] == [
        "reps-" + result["last_export"][:10] + ".csv",
        result["last_files"][1],
    ]
    assert google.folders == 1

    csv_text = google.uploads[0][1].decode()
    assert csv_text.splitlines() == [
        "Date,Exercise,Category,Weight (kgs),Reps,Distance,Distance Unit,Time,Comment",
        "2026-10-29,Lat Pulldown,Back,60,10,,,,easy",
        "2026-10-29,Running (Treadmill),Cardio,,,5.2,km,0:25:30,",
    ]
    backup = json.loads(google.uploads[1][1])
    assert backup["app"] == "reps" and len(backup["sets"]) == 2

    # The next export reuses the folder.
    call(aws, "POST /api/drive/export")
    assert google.folders == 1 and len(google.uploads) == 4


def test_our_csv_imports_back(aws, google):
    import base64

    connect(aws)
    log(aws, "set-0001", weight=62.5, reps=8)
    log(aws, "set-0002", "running-treadmill", distance=5, seconds=1500)
    call(aws, "POST /api/drive/export")
    csv_bytes = google.uploads[0][1]
    body = {"filename": "reps.csv", "data": base64.b64encode(csv_bytes).decode()}
    status, preview = call(aws, "POST /api/import/parse", MEMBER, body)
    assert status == 200, preview
    assert all(e["builtin"] for e in preview["exercises"])
    lifts = [s for s in preview["sets"] if s["exercise"] == "Lat Pulldown"]
    assert (lifts[0]["weight"], lifts[0]["reps"]) == (62.5, 8)
    run = next(s for s in preview["sets"] if s["exercise"] == "Running (Treadmill)")
    assert (run["distance"], run["seconds"]) == (5.0, 1500)


def test_bad_state_is_refused(aws, google):
    call(aws, "POST /api/drive/connect", body={"origin": "https://reps.example"})
    body = {"code": "good-code", "state": "forged", "origin": "https://reps.example"}
    assert call(aws, "POST /api/drive/callback", body=body)[0] == 400
    assert call(aws, "POST /api/drive/connect", body={"origin": "https://evil.example"})[0] == 400


def test_export_failure_is_shown(aws, google):
    connect(aws)
    google.fail_token = True
    status, body = call(aws, "POST /api/drive/export")
    assert status == 502
    assert call(aws, "GET /api/drive")[1]["last_error"] == "Google said no – connect Drive again"


def test_disconnect_revokes(aws, google):
    connect(aws)
    assert call(aws, "DELETE /api/drive")[0] == 204
    assert google.revoked and "refresh-1" in google.revoked[0]
    assert call(aws, "GET /api/drive")[1]["connected"] is False


def test_weekly_exports_everyone_connected(aws, google):
    connect(aws)
    log(aws, "set-0001", weight=60, reps=10)
    result = aws.handler({"action": "drive_weekly"})
    assert result == {"exported": 1, "failed": 0}
    assert len(google.uploads) == 2
