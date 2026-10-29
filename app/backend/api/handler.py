"""reps API (API Gateway HTTP API -> Lambda, payload v2).

Every route is protected by the Cognito JWT authorizer in API Gateway (the
shared pusiaczkowo.pl login). On top of that, reps only lets in logins in the
`reps` group (see people.py). Each person's data is keyed by their login's
`sub`, so it stays theirs even if their name or e-mail changes.

One DynamoDB table, `pk` + `sk`:
  USER#<sub> / SETTINGS   – language, …
  USER#<sub> / EX#, PREF#, SET#  – exercises and sets (workouts.py)
"""

from __future__ import annotations

import json
import logging
import os
import re
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

import boto3

import importer
import people
import workouts

log = logging.getLogger()
log.setLevel(logging.INFO)

REGION = os.environ.get("AWS_REGION", "eu-central-1")
DATA_TABLE = os.environ.get("DATA_TABLE", "data")

LANGUAGES = ("en", "pl")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

_dynamodb = boto3.resource("dynamodb", region_name=REGION)
table = _dynamodb.Table(DATA_TABLE)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
class ApiError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


def _json_default(value: Any) -> Any:
    if isinstance(value, Decimal):
        return int(value) if value == value.to_integral_value() else float(value)
    raise TypeError(f"Not serializable: {type(value)}")


def response(status: int, body: Any = None) -> dict:
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json", "Cache-Control": "no-store"},
        "body": "" if body is None else json.dumps(body, default=_json_default),
    }


def now_iso() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


def parse_body(event: dict) -> dict:
    raw = event.get("body") or "{}"
    if event.get("isBase64Encoded"):
        import base64

        raw = base64.b64decode(raw).decode()
    try:
        body = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ApiError(400, "Body must be JSON") from exc
    if not isinstance(body, dict):
        raise ApiError(400, "Body must be a JSON object")
    return body


@dataclass(frozen=True)
class User:
    sub: str
    name: str
    email: str
    groups: frozenset[str]

    @property
    def admin(self) -> bool:
        return people.ADMIN_GROUP in self.groups

    @property
    def pk(self) -> str:
        return f"USER#{self.sub}"


def _groups(claims: dict) -> frozenset[str]:
    raw = claims.get("cognito:groups") or ""
    if isinstance(raw, list):
        return frozenset(str(g) for g in raw)
    # API Gateway passes list claims as text: "[a b]".
    return frozenset(str(raw).strip("[]").replace(",", " ").split())


def current_user(event: dict) -> User:
    claims = event.get("requestContext", {}).get("authorizer", {}).get("jwt", {}).get("claims", {})
    sub = claims.get("sub")
    if not sub:
        raise ApiError(401, "Unknown person")
    groups = _groups(claims)
    if people.ACCESS_GROUP not in groups:
        raise ApiError(403, "This login has no access to reps")
    email = str(claims.get("email") or "")
    return User(sub=str(sub), name=str(claims.get("name") or email or sub), email=email, groups=groups)


def require_admin(user: User) -> None:
    if not user.admin:
        raise ApiError(403, "Only admins can do this")


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
def load_settings(user: User) -> dict:
    item = table.get_item(Key={"pk": user.pk, "sk": "SETTINGS"}).get("Item") or {}
    return {"language": item.get("language", "en")}


def get_me(event: dict, _: dict) -> dict:
    user = current_user(event)
    return response(
        200,
        {
            "name": user.name,
            "email": user.email,
            "admin": user.admin,
            "friend": people.FRIEND_GROUP in user.groups,
            "settings": load_settings(user),
        },
    )


def put_settings(event: dict, _: dict) -> dict:
    user = current_user(event)
    body = parse_body(event)
    settings = load_settings(user)
    if "language" in body:
        if body["language"] not in LANGUAGES:
            raise ApiError(400, f"language must be one of {', '.join(LANGUAGES)}")
        settings["language"] = body["language"]
    table.put_item(Item={"pk": user.pk, "sk": "SETTINGS", **settings, "updated_at": now_iso()})
    return response(200, settings)


def list_people(event: dict, _: dict) -> dict:
    require_admin(current_user(event))
    return response(200, {"people": people.people()})


def create_invite(event: dict, _: dict) -> dict:
    user = current_user(event)
    require_admin(user)
    body = parse_body(event)
    email = str(body.get("email") or "").strip().lower()
    name = str(body.get("name") or "").strip()
    if not EMAIL_RE.match(email):
        raise ApiError(400, "Enter a valid e-mail address")
    if not 1 <= len(name) <= 40:
        raise ApiError(400, "Enter a name (up to 40 characters)")
    result = people.invite(email, name)
    log.info("%s invited a %s user to reps", user.name, "new" if result["new"] else "existing")
    return response(201, result)


def query_params(event: dict) -> dict:
    return event.get("queryStringParameters") or {}


def get_exercises(event: dict, _: dict) -> dict:
    user = current_user(event)
    return response(200, workouts.list_exercises(table, user.pk))


def post_exercise(event: dict, _: dict) -> dict:
    user = current_user(event)
    return response(201, workouts.create_exercise(table, user.pk, parse_body(event), now_iso()))


def patch_exercise(event: dict, path: dict) -> dict:
    user = current_user(event)
    return response(
        200, workouts.update_exercise(table, user.pk, path.get("exerciseId", ""), parse_body(event), now_iso())
    )


def delete_exercise(event: dict, path: dict) -> dict:
    user = current_user(event)
    workouts.hide_exercise(table, user.pk, path.get("exerciseId", ""), now_iso())
    return response(204)


def get_history(event: dict, path: dict) -> dict:
    user = current_user(event)
    q = query_params(event)
    try:
        sessions = max(1, min(int(q.get("sessions") or 5), 50))
    except ValueError as exc:
        raise ApiError(400, "sessions must be a number") from exc
    found = workouts.history(table, user.pk, path.get("exerciseId", ""), q.get("before"), sessions)
    return response(200, {"sessions": found})


def get_sets(event: dict, _: dict) -> dict:
    user = current_user(event)
    return response(200, {"sets": workouts.day_sets(table, user.pk, query_params(event).get("date", ""))})


def put_set(event: dict, path: dict) -> dict:
    user = current_user(event)
    return response(200, workouts.put_set(table, user.pk, path.get("setId", ""), parse_body(event), now_iso()))


def delete_set(event: dict, path: dict) -> dict:
    user = current_user(event)
    workouts.delete_set(table, user.pk, path.get("setId", ""), query_params(event).get("date", ""))
    return response(204)


# ---------------------------------------------------------------------------
# Import from FitNotes: parse (preview) -> exercises -> sets (in chunks)
# ---------------------------------------------------------------------------
IMPORT_CHUNK = 1000


def import_parse(event: dict, _: dict) -> dict:
    current_user(event)
    import base64
    import binascii

    body = parse_body(event)
    try:
        data = base64.b64decode(str(body.get("data") or ""), validate=True)
    except binascii.Error as exc:
        raise ApiError(400, "The file didn't arrive in one piece") from exc
    try:
        return response(200, importer.parse(str(body.get("filename") or ""), data))
    except importer.ImportProblem as exc:
        raise ApiError(400, str(exc)) from exc


def import_exercises(event: dict, _: dict) -> dict:
    """Create the not-built-in exercises (same name -> same id) and copy favourites."""
    user = current_user(event)
    body = parse_body(event)
    items = body.get("exercises")
    if not isinstance(items, list) or len(items) > 2000:
        raise ApiError(400, "exercises must be a list")
    now = now_iso()
    existing = {k for k in workouts._custom_items(table, user.pk)}
    ids = {}
    for ex in items:
        name = str(ex.get("name") or "").strip()[:60]
        if not name:
            raise ApiError(400, "Every exercise needs a name")
        builtin = importer.match_builtin(name)
        exercise_id = builtin or importer.custom_id(name)
        if not builtin:
            if ex.get("category") not in workouts.category_ids():
                raise ApiError(400, f"Pick a body part for {name}")
            kind = ex.get("type") if ex.get("type") in workouts.TYPES else "weight_reps"
            if exercise_id in existing:
                table.update_item(
                    Key={"pk": user.pk, "sk": f"EX#{exercise_id}"},
                    UpdateExpression="SET category = :c, #t = :t, updated_at = :now REMOVE deleted",
                    ExpressionAttributeNames={"#t": "type"},
                    ExpressionAttributeValues={":c": ex["category"], ":t": kind, ":now": now},
                )
            else:
                table.put_item(
                    Item={
                        "pk": user.pk,
                        "sk": f"EX#{exercise_id}",
                        "en": name,
                        "pl": name,
                        "category": ex["category"],
                        "type": kind,
                        "created_at": now,
                        "imported": True,
                    }
                )
        if ex.get("favourite"):
            workouts.update_prefs(table, user.pk, exercise_id, {"favourite": True})
        ids[name] = exercise_id
    return response(200, {"ids": ids})


def import_sets(event: dict, _: dict) -> dict:
    user = current_user(event)
    body = parse_body(event)
    items = body.get("sets")
    if not isinstance(items, list) or len(items) > IMPORT_CHUNK:
        raise ApiError(400, f"sets must be a list of up to {IMPORT_CHUNK}")
    now = now_iso()
    exercises: dict[str, dict] = {}
    saved, skipped = 0, []
    with table.batch_writer(overwrite_by_pkeys=["pk", "sk"]) as batch:
        for s in items:
            try:
                ex_id = str(s.get("exercise_id") or "")
                if ex_id not in exercises:
                    exercises[ex_id] = workouts.get_exercise(table, user.pk, ex_id)
                day = str(s.get("date") or "")
                n, i = int(s.get("n") or 0), int(s.get("i") or 0)
                fields = {k: s[k] for k in ("weight", "reps", "distance", "seconds", "comment") if k in s}
                set_body = fields | {"date": day, "at": importer.at(day, i)}
                item = workouts.build_set(user.pk, importer.set_id(ex_id, day, n), set_body, exercises[ex_id], now)
            except (workouts.Invalid, ValueError, TypeError) as exc:
                skipped.append({"date": s.get("date"), "exercise_id": s.get("exercise_id"), "why": str(exc)})
                continue
            batch.put_item(Item={**item, "imported": True})
            saved += 1
    return response(200, {"saved": saved, "skipped": skipped[:50], "skipped_count": len(skipped)})


def import_undo(event: dict, _: dict) -> dict:
    """Remove every imported set (sets you logged yourself stay)."""
    user = current_user(event)
    sets = [s for s in workouts._query(table, user.pk, "SET#") if str(s.get("set_id", "")).startswith("imp-")]
    with table.batch_writer() as batch:
        for s in sets:
            batch.delete_item(Key={"pk": user.pk, "sk": s["sk"]})
    return response(200, {"deleted": len(sets)})


ROUTES: dict[str, Callable[[dict, dict], dict]] = {
    "GET /api/me": get_me,
    "PUT /api/me/settings": put_settings,
    "GET /api/admin/people": list_people,
    "POST /api/admin/invites": create_invite,
    "GET /api/exercises": get_exercises,
    "POST /api/exercises": post_exercise,
    "PATCH /api/exercises/{exerciseId}": patch_exercise,
    "DELETE /api/exercises/{exerciseId}": delete_exercise,
    "GET /api/exercises/{exerciseId}/history": get_history,
    "GET /api/sets": get_sets,
    "PUT /api/sets/{setId}": put_set,
    "DELETE /api/sets/{setId}": delete_set,
    "POST /api/import/parse": import_parse,
    "POST /api/import/exercises": import_exercises,
    "POST /api/import/sets": import_sets,
    "DELETE /api/import": import_undo,
}


def handler(event: dict, context: Any = None) -> dict:
    route = event.get("routeKey", "")
    fn = ROUTES.get(route)
    if not fn:
        return response(404, {"message": f"No route {route}"})
    try:
        return fn(event, event.get("pathParameters") or {})
    except (ApiError, workouts.Invalid) as err:
        return response(err.status, {"message": str(err)})
    except Exception:
        log.exception("Unhandled error on %s", route)
        return response(500, {"message": "Internal error"})
