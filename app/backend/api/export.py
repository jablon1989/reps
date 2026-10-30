"""Everything one person has, as files: a FitNotes-style CSV (sets only, which
reps and FitNotes can both import) and a JSON backup with everything.
"""

from __future__ import annotations

import csv
import io
import json
from decimal import Decimal

import docs
import workouts

CSV_HEADER = ["Date", "Exercise", "Category", "Weight (kgs)", "Reps", "Distance", "Distance Unit", "Time", "Comment"]


def _num(value) -> str:
    if value is None:
        return ""
    d = Decimal(str(value))
    return format(d.normalize(), "f") if d else "0"


def _time(seconds) -> str:
    if not seconds:
        return ""
    s = int(seconds)
    return f"{s // 3600}:{s % 3600 // 60:02d}:{s % 60:02d}"


def _json_default(value):
    if isinstance(value, Decimal):
        return int(value) if value == value.to_integral_value() else float(value)
    raise TypeError(type(value))


def gather(table, pk: str) -> dict:
    """All of one person's data (no login details)."""
    listed = workouts.list_exercises(table, pk)
    sets = sorted(
        (workouts.set_view(i) for i in workouts._query(table, pk, "SET#")), key=lambda s: (s["date"], s["at"])
    )
    return {
        "categories": listed["categories"],
        "exercises": listed["exercises"],
        "sets": sets,
        "docs": docs.list_all(table, pk),
    }


def to_csv(data: dict) -> bytes:
    exercises = {e["id"]: e for e in data["exercises"]}
    categories = {c["id"]: c["en"] for c in data["categories"]}
    out = io.StringIO()
    w = csv.writer(out, lineterminator="\n")
    w.writerow(CSV_HEADER)
    for s in data["sets"]:
        ex = exercises.get(s["exercise_id"], {"en": s["exercise_id"], "category": ""})
        cardio = ex.get("type") == "cardio"
        w.writerow(
            [
                s["date"],
                ex["en"],
                categories.get(ex.get("category", ""), ""),
                "" if cardio else _num(s.get("weight", 0)),
                "" if cardio else _num(s.get("reps")),
                _num(s.get("distance")) if s.get("distance") else "",
                "km" if s.get("distance") else "",
                _time(s.get("seconds")),
                s.get("comment", ""),
            ]
        )
    return out.getvalue().encode("utf-8")


def to_json(data: dict, exported_at: str) -> bytes:
    body = {"app": "reps", "version": 1, "exported_at": exported_at, **data}
    return json.dumps(body, default=_json_default, ensure_ascii=False, indent=1).encode("utf-8")
