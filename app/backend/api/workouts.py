"""Exercises and logged sets.

Items in the data table (pk = USER#<sub>):
  EX#<id>            your own exercise: en, pl, category, type (deleted = hidden)
  PREF#<exercise id> favourite, weight step (kg), rest timer (seconds)
  SET#<date>#<id>    one set: exercise_id, weight (kg), reps, distance (km), seconds, at

Set ids are made on the phone, so saving the same set twice (e.g. after a bad
connection, or offline sync later) just overwrites it.
"""

from __future__ import annotations

import json
import re
import uuid
from datetime import date
from decimal import Decimal, InvalidOperation
from functools import cache
from pathlib import Path

from boto3.dynamodb.conditions import Key

TYPES = ("weight_reps", "bodyweight_reps", "cardio")
ID_RE = re.compile(r"^[a-z0-9-]{1,64}$")
SET_ID_RE = re.compile(r"^[A-Za-z0-9-]{8,64}$")
DEFAULT_STEP = Decimal("1")
DEFAULT_REST = 90


class Invalid(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


@cache
def catalogue() -> dict:
    return json.loads((Path(__file__).parent / "catalogue.json").read_text(encoding="utf-8"))


@cache
def builtin() -> dict[str, dict]:
    return {e["id"]: e for e in catalogue()["exercises"]}


def category_ids() -> list[str]:
    return [c["id"] for c in catalogue()["categories"]]


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------
def _decimal(value, name: str, lo: str, hi: str, places: int) -> Decimal:
    try:
        d = Decimal(str(value))
    except (InvalidOperation, ValueError) as exc:
        raise Invalid(400, f"{name} must be a number") from exc
    if not d.is_finite() or not Decimal(lo) <= d <= Decimal(hi):
        raise Invalid(400, f"{name} must be between {lo} and {hi}")
    return d.quantize(Decimal(1).scaleb(-places)).normalize() if d else Decimal(0)


def _int(value, name: str, lo: int, hi: int) -> int:
    if isinstance(value, bool) or not isinstance(value, int | float) or int(value) != value:
        raise Invalid(400, f"{name} must be a whole number")
    if not lo <= value <= hi:
        raise Invalid(400, f"{name} must be between {lo} and {hi}")
    return int(value)


def _date(value) -> str:
    try:
        return date.fromisoformat(str(value)).isoformat()
    except ValueError as exc:
        raise Invalid(400, "date must be YYYY-MM-DD") from exc


def _name(value, field: str, required: bool) -> str:
    text = " ".join(str(value or "").split())
    if required and not text:
        raise Invalid(400, f"{field} is required")
    if len(text) > 60:
        raise Invalid(400, f"{field} is too long (60 characters max)")
    return text


# ---------------------------------------------------------------------------
# Exercises
# ---------------------------------------------------------------------------
def _query(table, pk: str, prefix: str) -> list[dict]:
    items: list[dict] = []
    kwargs = {"KeyConditionExpression": Key("pk").eq(pk) & Key("sk").begins_with(prefix)}
    while True:
        page = table.query(**kwargs)
        items.extend(page.get("Items", []))
        if "LastEvaluatedKey" not in page:
            return items
        kwargs["ExclusiveStartKey"] = page["LastEvaluatedKey"]


def _view(base: dict, pref: dict | None, custom: bool) -> dict:
    pref = pref or {}
    return {
        "id": base["id"],
        "category": base["category"],
        "type": base["type"],
        "en": base["en"],
        "pl": base.get("pl") or base["en"],
        "custom": custom,
        "hidden": bool(base.get("deleted")),
        "favourite": bool(pref.get("favourite")),
        "step": pref.get("step", DEFAULT_STEP),
        "rest": pref.get("rest", DEFAULT_REST),
    }


def _custom_items(table, pk: str) -> dict[str, dict]:
    return {item["sk"][3:]: {**item, "id": item["sk"][3:]} for item in _query(table, pk, "EX#")}


def list_exercises(table, pk: str) -> dict:
    prefs = {item["sk"][5:]: item for item in _query(table, pk, "PREF#")}
    exercises = [_view(e, prefs.get(e["id"]), False) for e in catalogue()["exercises"]]
    exercises += [_view(e, prefs.get(i), True) for i, e in _custom_items(table, pk).items()]
    return {"categories": catalogue()["categories"], "exercises": exercises}


def get_exercise(table, pk: str, exercise_id: str) -> dict:
    """The exercise as stored (built-in or yours); 404 if it doesn't exist."""
    if exercise_id in builtin():
        return builtin()[exercise_id]
    if ID_RE.match(exercise_id or "") and exercise_id.startswith("c-"):
        item = table.get_item(Key={"pk": pk, "sk": f"EX#{exercise_id}"}).get("Item")
        if item:
            return {**item, "id": exercise_id}
    raise Invalid(404, "Exercise not found")


def _one(table, pk: str, exercise_id: str) -> dict:
    base = get_exercise(table, pk, exercise_id)
    pref = table.get_item(Key={"pk": pk, "sk": f"PREF#{exercise_id}"}).get("Item")
    return _view(base, pref, exercise_id not in builtin())


def create_exercise(table, pk: str, body: dict, now: str) -> dict:
    en = _name(body.get("en"), "Name", required=False)
    pl = _name(body.get("pl"), "Polish name", required=False)
    if not en and not pl:
        raise Invalid(400, "Name is required")
    category = body.get("category")
    if category not in category_ids():
        raise Invalid(400, "Pick a body part")
    kind = body.get("type", "weight_reps")
    if kind not in TYPES:
        raise Invalid(400, "Unknown exercise type")
    exercise_id = f"c-{uuid.uuid4().hex[:12]}"
    table.put_item(
        Item={
            "pk": pk,
            "sk": f"EX#{exercise_id}",
            "en": en or pl,
            "pl": pl or en,
            "category": category,
            "type": kind,
            "created_at": now,
        }
    )
    if body.get("favourite"):
        update_prefs(table, pk, exercise_id, {"favourite": True})
    return _one(table, pk, exercise_id)


def update_exercise(table, pk: str, exercise_id: str, body: dict, now: str) -> dict:
    base = get_exercise(table, pk, exercise_id)
    custom = exercise_id not in builtin()
    changes = {k: body[k] for k in ("en", "pl", "category", "type") if k in body}
    if changes:
        if not custom:
            raise Invalid(400, "Built-in exercises can't be renamed")
        en = _name(changes.get("en", base["en"]), "Name", required=False)
        pl = _name(changes.get("pl", base["pl"]), "Polish name", required=False)
        if not en and not pl:
            raise Invalid(400, "Name is required")
        category = changes.get("category", base["category"])
        if category not in category_ids():
            raise Invalid(400, "Pick a body part")
        kind = changes.get("type", base["type"])
        if kind not in TYPES:
            raise Invalid(400, "Unknown exercise type")
        table.update_item(
            Key={"pk": pk, "sk": f"EX#{exercise_id}"},
            UpdateExpression="SET en = :en, pl = :pl, category = :c, #t = :t, updated_at = :now",
            ExpressionAttributeNames={"#t": "type"},
            ExpressionAttributeValues={":en": en or pl, ":pl": pl or en, ":c": category, ":t": kind, ":now": now},
        )
    prefs = {k: body[k] for k in ("favourite", "step", "rest") if k in body}
    if prefs:
        update_prefs(table, pk, exercise_id, prefs)
    return _one(table, pk, exercise_id)


def update_prefs(table, pk: str, exercise_id: str, prefs: dict) -> None:
    values: dict = {}
    if "favourite" in prefs:
        values["favourite"] = bool(prefs["favourite"])
    if "step" in prefs:
        values["step"] = _decimal(prefs["step"], "Step", "0.25", "50", 2)
    if "rest" in prefs:
        values["rest"] = _int(prefs["rest"], "Rest", 0, 3600)
    if not values:
        return
    names = {f"#{k}": k for k in values}
    table.update_item(
        Key={"pk": pk, "sk": f"PREF#{exercise_id}"},
        UpdateExpression="SET " + ", ".join(f"#{k} = :{k}" for k in values),
        ExpressionAttributeNames=names,
        ExpressionAttributeValues={f":{k}": v for k, v in values.items()},
    )


def hide_exercise(table, pk: str, exercise_id: str, now: str) -> None:
    """Your own exercises only. Its sets stay (and still show), it just leaves the list."""
    get_exercise(table, pk, exercise_id)
    if exercise_id in builtin():
        raise Invalid(400, "Built-in exercises can't be deleted")
    table.update_item(
        Key={"pk": pk, "sk": f"EX#{exercise_id}"},
        UpdateExpression="SET deleted = :t, updated_at = :now",
        ExpressionAttributeValues={":t": True, ":now": now},
    )


# ---------------------------------------------------------------------------
# Sets
# ---------------------------------------------------------------------------
def set_view(item: dict) -> dict:
    out = {
        "id": item["set_id"],
        "date": item["date"],
        "exercise_id": item["exercise_id"],
        "at": item["at"],
    }
    for key in ("weight", "reps", "distance", "seconds", "comment"):
        if key in item:
            out[key] = item[key]
    return out


def build_set(pk: str, set_id: str, body: dict, exercise: dict, now: str) -> dict:
    """A checked set item, ready to save."""
    if not SET_ID_RE.match(set_id or ""):
        raise Invalid(400, "Bad set id")
    day = _date(body.get("date"))
    item: dict = {
        "pk": pk,
        "sk": f"SET#{day}#{set_id}",
        "set_id": set_id,
        "date": day,
        "exercise_id": exercise["id"],
        # When it was logged (the phone's clock): the order within a day.
        "at": str(body.get("at") or now)[:32],
        "updated_at": now,
    }
    if exercise["type"] == "cardio":
        if "distance" in body and body["distance"] not in (None, ""):
            item["distance"] = _decimal(body["distance"], "Distance", "0", "1000", 3)
        if "seconds" in body and body["seconds"] not in (None, ""):
            item["seconds"] = _int(body["seconds"], "Time", 0, 86400)
        if not item.get("distance") and not item.get("seconds"):
            raise Invalid(400, "Enter a distance or a time")
    else:
        low = "-500" if exercise["type"] == "bodyweight_reps" else "0"  # minus = assisted
        item["weight"] = _decimal(body.get("weight", 0), "Weight", low, "1000", 2)
        item["reps"] = _int(body.get("reps"), "Reps", 1, 1000)
    comment = str(body.get("comment") or "").strip()
    if comment:
        item["comment"] = comment[:500]
    item["gsi1pk"] = f"{pk}#EX#{exercise['id']}"
    item["gsi1sk"] = f"{day}#{item['at']}#{set_id}"
    return item


def put_set(table, pk: str, set_id: str, body: dict, now: str) -> dict:
    exercise = get_exercise(table, pk, str(body.get("exercise_id") or ""))
    item = build_set(pk, set_id, body, exercise, now)
    table.put_item(Item=item)
    return set_view(item)


def delete_set(table, pk: str, set_id: str, day: str) -> None:
    table.delete_item(Key={"pk": pk, "sk": f"SET#{_date(day)}#{set_id}"})


def day_sets(table, pk: str, day: str) -> list[dict]:
    items = _query(table, pk, f"SET#{_date(day)}#")
    return [set_view(i) for i in sorted(items, key=lambda i: (i["at"], i["set_id"]))]


def history(table, pk: str, exercise_id: str, before: str | None, sessions: int) -> list[dict]:
    """The last `sessions` days this exercise was done (before `before`), newest first."""
    get_exercise(table, pk, exercise_id)
    cond = Key("gsi1pk").eq(f"{pk}#EX#{exercise_id}")
    if before:
        cond &= Key("gsi1sk").lt(_date(before))
    kwargs = {"IndexName": "gsi1", "KeyConditionExpression": cond, "ScanIndexForward": False, "Limit": 100}
    days: dict[str, list[dict]] = {}
    while True:
        page = table.query(**kwargs)
        for item in page.get("Items", []):
            if item["date"] not in days and len(days) == sessions:
                return _sessions(days)
            days.setdefault(item["date"], []).append(set_view(item))
        if "LastEvaluatedKey" not in page:
            return _sessions(days)
        kwargs["ExclusiveStartKey"] = page["LastEvaluatedKey"]


def _sessions(days: dict[str, list[dict]]) -> list[dict]:
    return [{"date": d, "sets": sorted(sets, key=lambda s: s["at"])} for d, sets in days.items()]


# ---------------------------------------------------------------------------
# Everything at once (stats are worked out on the phone)
# ---------------------------------------------------------------------------
ALL_FIELDS = ("set_id", "date", "at", "exercise_id", "weight", "reps", "distance", "seconds")
ALL_PAGE = 5000


def all_sets(table, pk: str, cursor: str | None) -> dict:
    """Your sets in date order, as compact rows, up to ALL_PAGE per call.

    Row: [id, date, at, exercise_id, weight, reps, distance, seconds] (null = not set).
    """
    import base64

    kwargs: dict = {
        "KeyConditionExpression": Key("pk").eq(pk) & Key("sk").begins_with("SET#"),
        "ProjectionExpression": ", ".join(f"#{f}" for f in ALL_FIELDS),
        "ExpressionAttributeNames": {f"#{f}": f for f in ALL_FIELDS},
    }
    if cursor:
        try:
            sk = base64.urlsafe_b64decode(cursor.encode()).decode()
        except ValueError as exc:
            raise Invalid(400, "Bad cursor") from exc
        if not sk.startswith("SET#"):
            raise Invalid(400, "Bad cursor")
        kwargs["ExclusiveStartKey"] = {"pk": pk, "sk": sk}
    rows: list[list] = []
    while True:
        page = table.query(Limit=ALL_PAGE - len(rows), **kwargs)
        rows.extend([item.get(f) for f in ALL_FIELDS] for item in page.get("Items", []))
        last = page.get("LastEvaluatedKey")
        if not last:
            return {"sets": rows, "next": None}
        if len(rows) >= ALL_PAGE:
            return {"sets": rows, "next": base64.urlsafe_b64encode(last["sk"].encode()).decode()}
        kwargs["ExclusiveStartKey"] = last
