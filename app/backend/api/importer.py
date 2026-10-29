"""Reading FitNotes data: the app's backup (.fitnotes, an SQLite file) or its
CSV export. Both become the same plain lists, which the import then saves
(see handler.py: parse → exercises → sets).

Exercises are matched to the built-in list by name (English or Polish,
ignoring case). Everything else becomes your own exercise in the body part
FitNotes had it in; a category we don't know (e.g. "Forearms") is guessed,
and the person can change it before importing.

Set ids are derived from the data, so importing the same file twice just
overwrites the same sets.
"""

from __future__ import annotations

import csv
import hashlib
import io
import sqlite3
import tempfile
from collections import defaultdict
from datetime import date
from decimal import Decimal

import workouts

MAX_SETS = 100_000
LB = Decimal("0.45359237")
MILE = Decimal("1.609344")

# FitNotes category names (and common extras) -> our body parts.
CATEGORIES = {
    "shoulders": "shoulders",
    "delts": "shoulders",
    "barki": "shoulders",
    "triceps": "triceps",
    "biceps": "biceps",
    "forearms": "biceps",
    "przedramiona": "biceps",
    "chest": "chest",
    "klatka": "chest",
    "klatka piersiowa": "chest",
    "back": "back",
    "traps": "back",
    "plecy": "back",
    "legs": "legs",
    "glutes": "legs",
    "calves": "legs",
    "quads": "legs",
    "hamstrings": "legs",
    "nogi": "legs",
    "pośladki": "legs",
    "łydki": "legs",
    "abs": "abs",
    "core": "abs",
    "brzuch": "abs",
    "cardio": "cardio",
}


class ImportProblem(Exception):
    pass


def _key(name: str) -> str:
    return " ".join(name.lower().split())


def match_builtin(name: str) -> str | None:
    wanted = _key(name)
    for ex in workouts.catalogue()["exercises"]:
        if wanted in (_key(ex["en"]), _key(ex["pl"])):
            return ex["id"]
    return None


def custom_id(name: str) -> str:
    """Same name -> same id: importing twice doesn't make two copies."""
    return "c-" + hashlib.sha1(_key(name).encode()).hexdigest()[:12]


def guess_category(source: str) -> tuple[str, bool]:
    """(our body part, whether it's a guess the person should check)"""
    found = CATEGORIES.get(_key(source))
    return (found, False) if found else ("shoulders", True)


# ---------------------------------------------------------------------------
# Readers: each returns (exercises, sets) as plain dicts
#   exercise: {name, category, kind ("weights" / "cardio" / "time"), favourite}
#   set:      {exercise (name), date, weight, reps, distance, seconds, comment}
# ---------------------------------------------------------------------------
def read_fitnotes(data: bytes) -> tuple[list[dict], list[dict]]:
    with tempfile.NamedTemporaryFile(suffix=".fitnotes") as f:
        f.write(data)
        f.flush()
        try:
            db = sqlite3.connect(f"file:{f.name}?mode=ro", uri=True)
            db.row_factory = sqlite3.Row
            rows = db.execute(
                """
                SELECT t._id, t.date, t.metric_weight, t.reps, t.distance, t.duration_seconds,
                       e.name AS exercise, e.exercise_type_id, e.is_favourite, c.name AS category,
                       (SELECT group_concat(m.comment, ' · ') FROM Comment m
                         WHERE m.owner_type_id = 1 AND m.owner_id = t._id) AS comment
                FROM training_log t
                JOIN exercise e ON e._id = t.exercise_id
                LEFT JOIN Category c ON c._id = e.category_id
                ORDER BY t.date, t._id
                """
            ).fetchall()
        except sqlite3.DatabaseError as exc:
            raise ImportProblem("This doesn't look like a FitNotes backup") from exc
        finally:
            try:
                db.close()
            except Exception:  # noqa: BLE001
                pass

    exercises: dict[str, dict] = {}
    sets = []
    for r in rows:
        kind = {1: "cardio", 3: "time"}.get(r["exercise_type_id"] or 0, "weights")
        exercises.setdefault(
            r["exercise"],
            {
                "name": r["exercise"],
                "category": r["category"] or "",
                "kind": kind,
                "favourite": bool(r["is_favourite"]),
            },
        )
        sets.append(
            {
                "exercise": r["exercise"],
                "date": r["date"],
                "weight": Decimal(str(r["metric_weight"] or 0)),
                "reps": int(r["reps"] or 0),
                # FitNotes keeps distance in metres.
                "distance": Decimal(r["distance"] or 0) / 1000,
                "seconds": int(r["duration_seconds"] or 0),
                "comment": r["comment"] or "",
            }
        )
    return list(exercises.values()), sets


def _column(header: list[str], *words: str) -> int | None:
    for i, name in enumerate(header):
        low = name.lower()
        if all(w in low for w in words):
            return i
    return None


def _seconds(text: str) -> int:
    parts = [p for p in text.strip().split(":") if p]
    if not parts or not all(p.isdigit() for p in parts):
        return 0
    total = 0
    for p in parts:
        total = total * 60 + int(p)
    return total


def _number(text: str) -> Decimal:
    text = (text or "").strip().replace(",", ".")
    try:
        return Decimal(text) if text else Decimal(0)
    except Exception as exc:  # noqa: BLE001
        raise ImportProblem(f"Not a number: {text!r}") from exc


def read_csv(data: bytes) -> tuple[list[dict], list[dict]]:
    """FitNotes "Export → CSV": Date, Exercise, Category, Weight (kgs|lbs), Reps,
    Distance, Distance Unit, Time, Comment. Columns are found by name."""
    text = data.decode("utf-8-sig", errors="replace")
    rows = list(csv.reader(io.StringIO(text)))
    if not rows:
        raise ImportProblem("The file is empty")
    header = rows[0]
    col = {
        "date": _column(header, "date"),
        "exercise": _column(header, "exercise"),
        "category": _column(header, "category"),
        "weight": _column(header, "weight"),
        "weight_unit": _column(header, "weight", "unit"),
        "reps": _column(header, "reps"),
        "distance": _column(header, "distance"),
        "distance_unit": _column(header, "distance", "unit"),
        "time": _column(header, "time"),
        "comment": _column(header, "comment"),
    }
    if col["weight"] == col["weight_unit"]:
        col["weight"] = next(
            (i for i, h in enumerate(header) if "weight" in h.lower() and "unit" not in h.lower()), None
        )
    if col["distance"] == col["distance_unit"]:
        col["distance"] = next(
            (i for i, h in enumerate(header) if "distance" in h.lower() and "unit" not in h.lower()), None
        )
    if col["date"] is None or col["exercise"] is None:
        raise ImportProblem("This doesn't look like a FitNotes CSV export (no Date / Exercise columns)")
    pounds_header = col["weight"] is not None and "lb" in header[col["weight"]].lower()

    def cell(row: list[str], name: str) -> str:
        i = col[name]
        return row[i].strip() if i is not None and i < len(row) else ""

    exercises: dict[str, dict] = {}
    sets = []
    for row in rows[1:]:
        if not any(c.strip() for c in row):
            continue
        name = cell(row, "exercise")
        if not name:
            continue
        weight = _number(cell(row, "weight"))
        unit = cell(row, "weight_unit").lower()
        if pounds_header or unit.startswith("lb"):
            weight = (weight * LB).quantize(Decimal("0.01"))
        distance = _number(cell(row, "distance"))
        d_unit = cell(row, "distance_unit").lower()
        if d_unit.startswith("mi"):
            distance *= MILE
        elif d_unit in ("m", "metres", "meters"):
            distance /= 1000
        reps = int(_number(cell(row, "reps")))
        seconds = _seconds(cell(row, "time"))
        kind = "weights" if reps else ("cardio" if distance else "time")
        ex = exercises.setdefault(
            name, {"name": name, "category": cell(row, "category"), "kind": kind, "favourite": False}
        )
        if reps:
            ex["kind"] = "weights"
        sets.append(
            {
                "exercise": name,
                "date": cell(row, "date"),
                "weight": weight,
                "reps": reps,
                "distance": distance,
                "seconds": seconds,
                "comment": cell(row, "comment"),
            }
        )
    return list(exercises.values()), sets


# ---------------------------------------------------------------------------
# Parse: what the preview shows, and what the import then sends back
# ---------------------------------------------------------------------------
def _type(kind: str) -> str:
    return "weight_reps" if kind == "weights" else "cardio"


def parse(filename: str, data: bytes) -> dict:
    if data[:16].startswith(b"SQLite format 3"):
        exercises, sets = read_fitnotes(data)
        source = "fitnotes"
    elif filename.lower().endswith((".csv", ".txt")) or b"," in data[:200]:
        exercises, sets = read_csv(data)
        source = "csv"
    else:
        raise ImportProblem("Pick a FitNotes backup (.fitnotes) or a CSV export")
    if not sets:
        raise ImportProblem("No sets found in this file")
    if len(sets) > MAX_SETS:
        raise ImportProblem(f"Too many sets ({len(sets)}); the limit is {MAX_SETS}")

    counts: dict[str, int] = defaultdict(int)
    for s in sets:
        try:
            s["date"] = date.fromisoformat(s["date"][:10]).isoformat()
        except ValueError as exc:
            raise ImportProblem(f"Bad date: {s['date']!r}") from exc
        counts[s["exercise"]] += 1

    out_exercises = []
    for ex in exercises:
        builtin = match_builtin(ex["name"])
        category, unsure = guess_category(ex["category"])
        out_exercises.append(
            {
                "name": ex["name"],
                "source_category": ex["category"],
                "sets": counts[ex["name"]],
                "builtin": builtin,
                "id": builtin or custom_id(ex["name"]),
                "category": workouts.builtin()[builtin]["category"] if builtin else category,
                "check_category": not builtin and unsure,
                "type": workouts.builtin()[builtin]["type"] if builtin else _type(ex["kind"]),
                "favourite": ex["favourite"],
            }
        )
    out_exercises.sort(key=lambda e: -e["sets"])

    # n = place within (day, exercise): part of the set's id.
    # i = place within the day: the order they were done in.
    ordinal: dict[tuple[str, str], int] = defaultdict(int)
    in_day: dict[str, int] = defaultdict(int)
    out_sets = []
    for s in sets:
        n = ordinal[(s["date"], s["exercise"])]
        ordinal[(s["date"], s["exercise"])] += 1
        i = in_day[s["date"]]
        in_day[s["date"]] += 1
        item = {"exercise": s["exercise"], "date": s["date"], "n": n, "i": i}
        for k in ("weight", "distance"):
            if s[k]:
                item[k] = float(s[k])
        for k in ("reps", "seconds"):
            if s[k]:
                item[k] = s[k]
        if s["comment"]:
            item["comment"] = s["comment"][:500]
        out_sets.append(item)

    days = sorted({s["date"] for s in out_sets})
    return {
        "source": source,
        "sets": out_sets,
        "exercises": out_exercises,
        "days": len(days),
        "first": days[0],
        "last": days[-1],
    }


def set_id(exercise_id: str, day: str, n: int) -> str:
    return "imp-" + hashlib.sha1(f"{exercise_id}|{day}|{n}".encode()).hexdigest()[:24]


def at(day: str, index: int) -> str:
    """No times in FitNotes: put the day's sets in order from noon on."""
    return f"{day}T12:{min(index // 60, 59):02d}:{index % 60:02d}Z"
