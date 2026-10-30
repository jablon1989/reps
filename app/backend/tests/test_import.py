import base64
import sqlite3

from test_api import ADMIN, MEMBER
from test_workouts import call

SCHEMA = """
CREATE TABLE Category (_id INTEGER PRIMARY KEY, name TEXT, colour INTEGER, sort_order INTEGER);
CREATE TABLE exercise (_id INTEGER PRIMARY KEY, name TEXT NOT NULL, category_id INTEGER NOT NULL,
  exercise_type_id INTEGER NOT NULL DEFAULT 0, is_favourite INTEGER NOT NULL DEFAULT 0);
CREATE TABLE training_log (_id INTEGER PRIMARY KEY, exercise_id INTEGER NOT NULL, date DATE NOT NULL,
  metric_weight INTEGER NOT NULL, reps INTEGER NOT NULL, distance INTEGER NOT NULL DEFAULT 0,
  duration_seconds INTEGER NOT NULL DEFAULT 0);
CREATE TABLE Comment (_id INTEGER PRIMARY KEY, date DATE, owner_type_id INTEGER, owner_id INTEGER, comment TEXT);
CREATE TABLE BodyWeight (_id INTEGER PRIMARY KEY, date TEXT, body_weight_metric REAL, body_fat REAL, comments TEXT);
CREATE TABLE WorkoutComment (_id INTEGER PRIMARY KEY, date TEXT, comment TEXT);
"""


def fitnotes_backup(tmp_path) -> bytes:
    path = tmp_path / "FitNotes_Backup.fitnotes"
    db = sqlite3.connect(path)
    db.executescript(SCHEMA)
    db.executemany(
        "INSERT INTO Category VALUES (?, ?, 0, 0)", [(1, "Back"), (2, "Forearms"), (3, "Cardio"), (4, "Chest")]
    )
    db.executemany(
        "INSERT INTO exercise VALUES (?, ?, ?, ?, ?)",
        [
            (1, "Lat Pulldown", 1, 0, 1),
            (2, "Wrist Curl", 2, 0, 0),
            (3, "Running (Treadmill)", 3, 1, 0),
            (4, "My Cable Press", 4, 0, 0),
        ],
    )
    db.executemany(
        "INSERT INTO training_log (_id, exercise_id, date, metric_weight, reps, distance, duration_seconds)"
        " VALUES (?, ?, ?, ?, ?, ?, ?)",
        [
            (1, 1, "2024-06-17", 50, 10, 0, 0),
            (2, 1, "2024-06-17", 52.5, 8, 0, 0),
            (3, 2, "2024-06-17", 15, 15, 0, 0),
            (4, 3, "2024-06-18", 0, 0, 5000, 1800),
            (5, 4, "2024-06-18", 30, 12, 0, 0),
            (6, 1, "2024-06-20", 55, 0, 0, 0),  # 0 reps: skipped
        ],
    )
    db.execute("INSERT INTO Comment VALUES (1, '2024-06-17', 1, 2, 'felt heavy')")
    db.execute("INSERT INTO BodyWeight VALUES (1, '2024-06-17', 84.5, 18.2, '')")
    db.execute("INSERT INTO BodyWeight VALUES (2, '2024-06-20', 84.0, 0, '')")
    db.execute("INSERT INTO WorkoutComment VALUES (1, '2024-06-18', 'Short run, knee ok')")
    db.commit()
    db.close()
    return path.read_bytes()


def parse(aws, filename, data, claims=ADMIN):
    body = {"filename": filename, "data": base64.b64encode(data).decode()}
    return call(aws, "POST /api/import/parse", claims, body)


def run_import(aws, preview, claims=ADMIN, categories=None):
    exercises = [e | {"category": (categories or {}).get(e["name"], e["category"])} for e in preview["exercises"]]
    status, body = call(aws, "POST /api/import/exercises", claims, {"exercises": exercises})
    assert status == 200, body
    ids = body["ids"]
    sets = [s | {"exercise_id": ids[s["exercise"]]} for s in preview["sets"]]
    status, result = call(aws, "POST /api/import/sets", claims, {"sets": sets})
    assert status == 200, result
    return ids, result


def test_parse_fitnotes_backup(aws, tmp_path):
    status, preview = parse(aws, "FitNotes_Backup.fitnotes", fitnotes_backup(tmp_path))
    assert status == 200, preview
    assert (preview["source"], preview["days"], preview["first"], preview["last"]) == (
        "fitnotes",
        3,
        "2024-06-17",
        "2024-06-20",
    )
    ex = {e["name"]: e for e in preview["exercises"]}
    assert ex["Lat Pulldown"]["builtin"] == "lat-pulldown"
    assert ex["Lat Pulldown"]["favourite"] is True
    assert ex["Running (Treadmill)"]["builtin"] == "running-treadmill"
    assert (ex["Wrist Curl"]["builtin"], ex["Wrist Curl"]["category"], ex["Wrist Curl"]["check_category"]) == (
        None,
        "biceps",
        False,
    )
    assert (ex["My Cable Press"]["category"], ex["My Cable Press"]["type"]) == ("chest", "weight_reps")
    run = next(s for s in preview["sets"] if s["exercise"] == "Running (Treadmill)")
    assert (run["distance"], run["seconds"]) == (5.0, 1800)
    heavy = next(s for s in preview["sets"] if s.get("comment"))
    assert (heavy["weight"], heavy["comment"]) == (52.5, "felt heavy")


def test_import_and_import_again(aws, tmp_path):
    _, preview = parse(aws, "x.fitnotes", fitnotes_backup(tmp_path))
    ids, result = run_import(aws, preview)
    assert result["saved"] == 5
    assert result["skipped_count"] == 1  # the 0-rep set

    day = call(aws, "GET /api/sets", query={"date": "2024-06-17"})[1]["sets"]
    assert [(s["exercise_id"], s.get("weight"), s.get("reps")) for s in day] == [
        ("lat-pulldown", 50, 10),
        ("lat-pulldown", 52.5, 8),
        (ids["Wrist Curl"], 15, 15),
    ]
    exercises = {e["id"]: e for e in call(aws, "GET /api/exercises")[1]["exercises"]}
    assert exercises["lat-pulldown"]["favourite"] is True
    assert exercises[ids["Wrist Curl"]]["custom"] is True
    assert exercises[ids["Wrist Curl"]]["category"] == "biceps"

    # Same file again: nothing doubles.
    run_import(aws, preview)
    assert len(call(aws, "GET /api/sets", query={"date": "2024-06-17"})[1]["sets"]) == 3
    assert len([e for e in call(aws, "GET /api/exercises")[1]["exercises"] if e["custom"]]) == 2

    # Somebody else's import is theirs only.
    assert call(aws, "GET /api/sets", MEMBER, query={"date": "2024-06-17"})[1]["sets"] == []


def test_chosen_category_wins(aws, tmp_path):
    _, preview = parse(aws, "x.fitnotes", fitnotes_backup(tmp_path))
    ids, _ = run_import(aws, preview, categories={"Wrist Curl": "back"})
    exercises = {e["id"]: e for e in call(aws, "GET /api/exercises")[1]["exercises"]}
    assert exercises[ids["Wrist Curl"]]["category"] == "back"


def test_undo_import_keeps_own_sets(aws, tmp_path):
    _, preview = parse(aws, "x.fitnotes", fitnotes_backup(tmp_path))
    run_import(aws, preview)
    body = {"date": "2024-06-17", "exercise_id": "lat-pulldown", "weight": 60, "reps": 5}
    assert call(aws, "PUT /api/sets/{setId}", body=body, setId="mine-0001")[0] == 200

    status, result = call(aws, "DELETE /api/import")
    assert (status, result) == (200, {"deleted": 5})
    assert [s["id"] for s in call(aws, "GET /api/sets", query={"date": "2024-06-17"})[1]["sets"]] == ["mine-0001"]


CSV = """Date,Exercise,Category,Weight (lbs),Reps,Distance,Distance Unit,Time,Comment
2024-06-17,Flat Barbell Bench Press,Chest,135,10,,,,
2024-06-17,Flat Barbell Bench Press,Chest,155,8,,,,last one hard
2024-06-18,Running (Outdoor),Cardio,,,3.1,mi,0:25:30,
2024-06-18,Neck Curl,Neck,10,20,,,,
"""


def test_parse_csv_with_pounds_and_miles(aws):
    status, preview = parse(aws, "FitNotes_Export.csv", CSV.encode())
    assert status == 200, preview
    assert preview["source"] == "csv"
    bench = [s for s in preview["sets"] if s["exercise"] == "Flat Barbell Bench Press"]
    assert [(s["weight"], s["reps"]) for s in bench] == [(61.23, 10), (70.31, 8)]
    assert bench[1]["comment"] == "last one hard"
    run = next(s for s in preview["sets"] if s["exercise"] == "Running (Outdoor)")
    assert round(run["distance"], 3) == 4.989
    assert run["seconds"] == 1530
    neck = next(e for e in preview["exercises"] if e["name"] == "Neck Curl")
    assert neck["check_category"] is True  # "Neck" isn't one of our body parts

    _, result = run_import(aws, preview, categories={"Neck Curl": "shoulders"})
    assert (result["saved"], result["skipped_count"]) == (4, 0)


def test_parse_rejects_other_files(aws):
    assert parse(aws, "photo.jpg", b"\xff\xd8\xff\xe0 not a backup")[0] == 400
    assert parse(aws, "empty.csv", b"")[0] == 400
    assert call(aws, "POST /api/import/parse", body={"data": "not base64!"})[0] == 400
    assert parse(aws, "x.csv", b"Name,Value\nfoo,1\n")[0] == 400


def test_sets_chunk_limit(aws):
    assert call(aws, "POST /api/import/sets", body={"sets": [{}] * 1001})[0] == 400


def test_body_weight_and_workout_notes_come_along(aws, tmp_path):
    _, preview = parse(aws, "x.fitnotes", fitnotes_backup(tmp_path))
    assert preview["body_weights"] == [
        {"date": "2024-06-17", "weight": 84.5, "bodyfat": 18.2},
        {"date": "2024-06-20", "weight": 84.0},
    ]
    assert preview["notes"] == [{"date": "2024-06-18", "text": "Short run, knee ok"}]
    body = {"body_weights": preview["body_weights"], "notes": preview["notes"]}
    status, saved = call(aws, "POST /api/import/extras", body=body)
    assert (status, saved) == (200, {"body": 2, "note": 1})
    docs = call(aws, "GET /api/docs")[1]
    assert [b["weight"] for b in docs["body"]] == [84.5, 84]
    assert docs["note"][0]["text"] == "Short run, knee ok"


def test_old_backup_without_body_tables(aws, tmp_path):
    path = tmp_path / "old.fitnotes"
    db = sqlite3.connect(path)
    db.executescript(SCHEMA.split("CREATE TABLE BodyWeight")[0])
    db.execute("INSERT INTO Category VALUES (1, 'Back', 0, 0)")
    db.execute("INSERT INTO exercise VALUES (1, 'Lat Pulldown', 1, 0, 0)")
    db.execute(
        "INSERT INTO training_log (_id, exercise_id, date, metric_weight, reps) VALUES (1, 1, '2024-01-01', 50, 10)"
    )
    db.commit()
    db.close()
    status, preview = parse(aws, "old.fitnotes", path.read_bytes())
    assert status == 200, preview
    assert (preview["body_weights"], preview["notes"]) == ([], [])
