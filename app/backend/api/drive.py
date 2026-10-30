"""Google Drive backups: connect once (OAuth), then reps writes a CSV and a
JSON file into a "reps" folder every week (and on "Export now").

Scope drive.file: reps only ever sees the files it made itself.
The Google OAuth client (id + secret) is an SSM SecureString parameter,
JSON {"client_id": ..., "client_secret": ...}; without it the feature is off.

Items: USER#<sub> / DRIVE        – refresh token, Google e-mail, folder id, last export
       USER#<sub> / DRIVESTATE   – the pending connect (anti-forgery state, 10 min)
       DRIVE / USER#<sub>        – who is connected (for the weekly run)
"""

from __future__ import annotations

import base64
import json
import logging
import os
import secrets
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import UTC, datetime

import export
from workouts import Invalid

log = logging.getLogger()

PARAM = os.environ.get("GOOGLE_OAUTH_PARAM", "")
ALLOWED_ORIGINS = [o for o in os.environ.get("APP_ORIGINS", "").split(",") if o]
SCOPES = "openid email https://www.googleapis.com/auth/drive.file"
AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
REVOKE_URL = "https://oauth2.googleapis.com/revoke"
FILES_URL = "https://www.googleapis.com/drive/v3/files"
UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id"
FOLDER_MIME = "application/vnd.google-apps.folder"
STATE_SECONDS = 600

_client: dict | None = None


class GoogleError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


# ---------------------------------------------------------------------------
# Talking to Google (one function, replaced in tests)
# ---------------------------------------------------------------------------
def http(method: str, url: str, *, data: bytes | None = None, headers: dict | None = None) -> dict:
    req = urllib.request.Request(url, data=data, method=method, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=20) as res:
            body = res.read()
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode(errors="replace")[:300]
        raise GoogleError(exc.code, detail) from exc
    except urllib.error.URLError as exc:
        raise GoogleError(0, str(exc.reason)) from exc
    return json.loads(body) if body else {}


def client() -> dict | None:
    """{"client_id", "client_secret"} from SSM, or None if not set up."""
    global _client
    if _client is not None:
        return _client or None
    if not PARAM:
        _client = {}
        return None
    import boto3

    try:
        value = boto3.client("ssm").get_parameter(Name=PARAM, WithDecryption=True)["Parameter"]["Value"]
        parsed = json.loads(value)
        _client = parsed if parsed.get("client_id") and parsed.get("client_secret") else {}
    except Exception:  # noqa: BLE001 – missing parameter = feature off
        log.warning("Google OAuth client %s not available", PARAM)
        _client = {}
    return _client or None


def _redirect_uri(origin: str) -> str:
    if origin not in ALLOWED_ORIGINS:
        raise Invalid(400, "Unknown app address")
    return f"{origin}/drive/callback"


# ---------------------------------------------------------------------------
# Connect / status / disconnect
# ---------------------------------------------------------------------------
def status(table, pk: str) -> dict:
    item = table.get_item(Key={"pk": pk, "sk": "DRIVE"}).get("Item")
    out = {"configured": client() is not None, "connected": bool(item)}
    if item:
        for key in ("email", "connected_at", "last_export", "last_error", "last_files"):
            if item.get(key):
                out[key] = item[key]
    return out


def start(table, pk: str, origin: str) -> dict:
    google = client()
    if not google:
        raise Invalid(503, "Google Drive isn't set up yet")
    state = secrets.token_urlsafe(24)
    table.put_item(Item={"pk": pk, "sk": "DRIVESTATE", "state": state, "expires": int(time.time()) + STATE_SECONDS})
    query = {
        "client_id": google["client_id"],
        "redirect_uri": _redirect_uri(origin),
        "response_type": "code",
        "scope": SCOPES,
        "access_type": "offline",
        "prompt": "consent",  # always hand out a refresh token
        "include_granted_scopes": "true",
        "state": state,
    }
    return {"url": f"{AUTH_URL}?{urllib.parse.urlencode(query)}"}


def _email_from(id_token: str) -> str:
    try:
        payload = id_token.split(".")[1]
        payload += "=" * (-len(payload) % 4)
        return json.loads(base64.urlsafe_b64decode(payload)).get("email", "")
    except Exception:  # noqa: BLE001
        return ""


def finish(table, pk: str, code: str, state: str, origin: str, now: str) -> dict:
    google = client()
    if not google:
        raise Invalid(503, "Google Drive isn't set up yet")
    pending = table.get_item(Key={"pk": pk, "sk": "DRIVESTATE"}).get("Item")
    if (
        not pending
        or not secrets.compare_digest(str(pending.get("state")), state or "")
        or pending["expires"] < time.time()
    ):
        raise Invalid(400, "This Google answer has expired – connect again")
    table.delete_item(Key={"pk": pk, "sk": "DRIVESTATE"})
    tokens = http(
        "POST",
        TOKEN_URL,
        data=urllib.parse.urlencode(
            {
                "code": code,
                "client_id": google["client_id"],
                "client_secret": google["client_secret"],
                "redirect_uri": _redirect_uri(origin),
                "grant_type": "authorization_code",
            }
        ).encode(),
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    if not tokens.get("refresh_token"):
        raise Invalid(400, "Google didn't give long-term access – try connecting again")
    if "drive.file" not in tokens.get("scope", "drive.file"):
        raise Invalid(400, "Drive access wasn't granted – tick the Drive box on Google's page")
    table.put_item(
        Item={
            "pk": pk,
            "sk": "DRIVE",
            "refresh_token": tokens["refresh_token"],
            "email": _email_from(tokens.get("id_token", "")),
            "connected_at": now,
        }
    )
    table.put_item(Item={"pk": "DRIVE", "sk": pk})
    return status(table, pk)


def disconnect(table, pk: str) -> None:
    item = table.get_item(Key={"pk": pk, "sk": "DRIVE"}).get("Item")
    if item:
        try:
            http(
                "POST",
                f"{REVOKE_URL}?{urllib.parse.urlencode({'token': item['refresh_token']})}",
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
        except GoogleError:
            log.warning("Revoking the Google token failed (already revoked?)")
    table.delete_item(Key={"pk": pk, "sk": "DRIVE"})
    table.delete_item(Key={"pk": "DRIVE", "sk": pk})


# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------
def _access_token(refresh_token: str) -> str:
    google = client()
    if not google:
        raise Invalid(503, "Google Drive isn't set up yet")
    tokens = http(
        "POST",
        TOKEN_URL,
        data=urllib.parse.urlencode(
            {
                "refresh_token": refresh_token,
                "client_id": google["client_id"],
                "client_secret": google["client_secret"],
                "grant_type": "refresh_token",
            }
        ).encode(),
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    return tokens["access_token"]


def _folder(token: str, folder_id: str | None) -> str:
    """The "reps" folder: the one we made before, or a new one."""
    auth = {"Authorization": f"Bearer {token}"}
    if folder_id:
        try:
            found = http("GET", f"{FILES_URL}/{folder_id}?fields=id,trashed", headers=auth)
            if not found.get("trashed"):
                return folder_id
        except GoogleError as exc:
            if exc.status != 404:
                raise
    made = http(
        "POST",
        f"{FILES_URL}?fields=id",
        data=json.dumps({"name": "reps", "mimeType": FOLDER_MIME}).encode(),
        headers={**auth, "Content-Type": "application/json"},
    )
    return made["id"]


def _upload(token: str, folder_id: str, name: str, mime: str, content: bytes) -> str:
    boundary = f"reps{secrets.token_hex(8)}"
    meta = json.dumps({"name": name, "parents": [folder_id]}).encode()
    body = (
        f"--{boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n".encode()
        + meta
        + f"\r\n--{boundary}\r\nContent-Type: {mime}\r\n\r\n".encode()
        + content
        + f"\r\n--{boundary}--\r\n".encode()
    )
    res = http(
        "POST",
        UPLOAD_URL,
        data=body,
        headers={"Authorization": f"Bearer {token}", "Content-Type": f"multipart/related; boundary={boundary}"},
    )
    return res["id"]


def export_now(table, pk: str, now: str) -> dict:
    item = table.get_item(Key={"pk": pk, "sk": "DRIVE"}).get("Item")
    if not item:
        raise Invalid(400, "Google Drive isn't connected")
    try:
        token = _access_token(item["refresh_token"])
        folder_id = _folder(token, item.get("folder_id"))
        data = export.gather(table, pk)
        day = now[:10]
        names = [f"reps-{day}.csv", f"reps-{day}.json"]
        _upload(token, folder_id, names[0], "text/csv", export.to_csv(data))
        _upload(token, folder_id, names[1], "application/json", export.to_json(data, now))
    except (GoogleError, KeyError) as exc:
        message = "Google said no – connect Drive again" if getattr(exc, "status", 0) in (400, 401) else str(exc)[:200]
        table.update_item(
            Key={"pk": pk, "sk": "DRIVE"},
            UpdateExpression="SET last_error = :e, last_error_at = :now",
            ExpressionAttributeValues={":e": message, ":now": now},
        )
        raise Invalid(502, message) from exc
    table.update_item(
        Key={"pk": pk, "sk": "DRIVE"},
        UpdateExpression="SET folder_id = :f, last_export = :now, last_files = :n REMOVE last_error",
        ExpressionAttributeValues={":f": folder_id, ":now": now, ":n": names},
    )
    return status(table, pk)


def weekly(table) -> dict:
    """Everyone connected: one export each (errors are kept on their status)."""
    from boto3.dynamodb.conditions import Key

    done, failed = 0, 0
    kwargs = {"KeyConditionExpression": Key("pk").eq("DRIVE")}
    while True:
        page = table.query(**kwargs)
        for item in page.get("Items", []):
            try:
                export_now(table, item["sk"], datetime.now(UTC).isoformat(timespec="seconds"))
                done += 1
            except Exception:  # noqa: BLE001 – one person's problem mustn't stop the rest
                log.exception("Weekly Drive export failed for one person")
                failed += 1
        if "LastEvaluatedKey" not in page:
            return {"exported": done, "failed": failed}
        kwargs["ExclusiveStartKey"] = page["LastEvaluatedKey"]
