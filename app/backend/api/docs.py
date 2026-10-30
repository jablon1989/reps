"""Small per-person documents: routines, body measurements, goals, day notes
and day plans (a routine started on a day). Stored as DOC#<kind>#<id>.

Every write is a PUT of the whole document (or a DELETE), with an id made on
the phone or taken from the data (a date, an exercise id), so the offline sync
queue can send it twice without harm.
"""

from __future__ import annotations

import re

import workouts
from workouts import Invalid, _date, _decimal, _int

KINDS = ("routine", "body", "goal", "note", "plan")
ROUTINE_ID = re.compile(r"^[A-Za-z0-9-]{8,64}$")
BODY_FIELDS = {
    # name: (low, high, decimals)
    "weight": ("20", "400", 2),
    "bodyfat": ("1", "80", 1),
    "waist": ("30", "250", 1),
    "chest": ("40", "250", 1),
    "arm": ("10", "100", 1),
    "thigh": ("20", "150", 1),
    "hips": ("40", "250", 1),
}
BODY_WEIGHT_GOAL = "body-weight"


def _text(value, field: str, limit: int, required: bool = False) -> str:
    text = str(value or "").strip()
    if required and not text:
        raise Invalid(400, f"{field} is required")
    if len(text) > limit:
        raise Invalid(400, f"{field} is too long ({limit} characters max)")
    return text


def check(table, pk: str, kind: str, doc_id: str, body: dict) -> dict:
    """The stored fields for one document (raises Invalid if something's off)."""
    if kind == "routine":
        if not ROUTINE_ID.match(doc_id):
            raise Invalid(400, "Bad routine id")
        items = body.get("exercises") or []
        if not isinstance(items, list) or len(items) > 40:
            raise Invalid(400, "A routine has up to 40 exercises")
        exercises = []
        for item in items:
            ex = workouts.get_exercise(table, pk, str((item or {}).get("exercise_id") or ""))
            entry: dict = {"exercise_id": ex["id"]}
            if item.get("sets") not in (None, ""):
                entry["sets"] = _int(item["sets"], "Sets", 1, 20)
            if item.get("reps") not in (None, ""):
                entry["reps"] = _int(item["reps"], "Reps", 1, 100)
            exercises.append(entry)
        return {"name": _text(body.get("name"), "Name", 60, required=True), "exercises": exercises}

    if kind == "body":
        day = _date(doc_id)
        out: dict = {"date": day}
        for name, (lo, hi, places) in BODY_FIELDS.items():
            if body.get(name) not in (None, ""):
                out[name] = _decimal(body[name], name.capitalize(), lo, hi, places)
        if len(out) == 1:
            raise Invalid(400, "Enter at least one measurement")
        return out

    if kind == "goal":
        weight = _decimal(body.get("weight"), "Weight", "1", "1000", 2)
        if doc_id == BODY_WEIGHT_GOAL:
            return {"weight": weight}
        workouts.get_exercise(table, pk, doc_id)
        return {"weight": weight, "reps": _int(body.get("reps", 1), "Reps", 1, 30)}

    if kind == "note":
        _date(doc_id)
        return {"text": _text(body.get("text"), "Note", 2000, required=True)}

    if kind == "plan":
        _date(doc_id)
        routine_id = str(body.get("routine_id") or "")
        if routine_id and not ROUTINE_ID.match(routine_id):
            raise Invalid(400, "Bad routine id")
        ids = body.get("exercise_ids") or []
        if not isinstance(ids, list) or not 1 <= len(ids) <= 40:
            raise Invalid(400, "A plan has 1 to 40 exercises")
        return {
            "routine_id": routine_id,
            "exercise_ids": [workouts.get_exercise(table, pk, str(i))["id"] for i in ids],
        }

    raise Invalid(404, "Unknown kind")


def put(table, pk: str, kind: str, doc_id: str, body: dict, now: str) -> dict:
    if kind not in KINDS or not re.match(r"^[A-Za-z0-9-]{1,64}$", doc_id or ""):
        raise Invalid(404, "Not found")
    fields = check(table, pk, kind, doc_id, body)
    table.put_item(Item={"pk": pk, "sk": f"DOC#{kind}#{doc_id}", **fields, "updated_at": now})
    return {"kind": kind, "id": doc_id, **fields}


def delete(table, pk: str, kind: str, doc_id: str) -> None:
    if kind not in KINDS:
        raise Invalid(404, "Not found")
    table.delete_item(Key={"pk": pk, "sk": f"DOC#{kind}#{doc_id}"})


def list_all(table, pk: str) -> dict:
    out: dict[str, list] = {kind: [] for kind in KINDS}
    for item in workouts._query(table, pk, "DOC#"):
        _, kind, doc_id = item["sk"].split("#", 2)
        if kind not in out:
            continue
        doc = {k: v for k, v in item.items() if k not in ("pk", "sk", "updated_at")}
        out[kind].append({"id": doc_id, **doc})
    return out


def import_extras(table, pk: str, body_weights: list[dict], notes: list[dict], now: str) -> dict:
    """FitNotes body weight entries and workout comments (from an import)."""
    saved = {"body": 0, "note": 0}
    with table.batch_writer(overwrite_by_pkeys=["pk", "sk"]) as batch:
        for entry in body_weights[:5000]:
            try:
                fields = check(table, pk, "body", str(entry.get("date")), entry)
            except Invalid:
                continue
            batch.put_item(Item={"pk": pk, "sk": f"DOC#body#{fields['date']}", **fields, "updated_at": now})
            saved["body"] += 1
        for entry in notes[:5000]:
            try:
                day = _date(entry.get("date"))
                fields = check(table, pk, "note", day, entry)
            except Invalid:
                continue
            batch.put_item(Item={"pk": pk, "sk": f"DOC#note#{day}", **fields, "updated_at": now})
            saved["note"] += 1
    return saved
