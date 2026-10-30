from test_api import MEMBER
from test_workouts import call, log


def put(aws, kind, doc_id, body, claims=None):
    args = (claims,) if claims else ()
    return call(aws, "PUT /api/docs/{kind}/{docId}", *args, body=body, kind=kind, docId=doc_id)


def test_routine_round_trip(aws):
    body = {
        "name": "Push",
        "exercises": [
            {"exercise_id": "flat-dumbbell-bench-press", "sets": 3, "reps": 10},
            {"exercise_id": "lateral-dumbbell-raise"},
        ],
    }
    status, doc = put(aws, "routine", "routine-0001", body)
    assert status == 200, doc
    assert doc["exercises"][0] == {"exercise_id": "flat-dumbbell-bench-press", "sets": 3, "reps": 10}

    status, all_docs = call(aws, "GET /api/docs")
    assert status == 200
    assert [r["name"] for r in all_docs["routine"]] == ["Push"]
    assert all_docs["routine"][0]["id"] == "routine-0001"
    assert call(aws, "GET /api/docs", MEMBER)[1]["routine"] == []

    assert call(aws, "DELETE /api/docs/{kind}/{docId}", kind="routine", docId="routine-0001")[0] == 204
    assert call(aws, "GET /api/docs")[1]["routine"] == []


def test_routine_validation(aws):
    assert put(aws, "routine", "routine-0001", {"name": "", "exercises": []})[0] == 400
    assert put(aws, "routine", "x", {"name": "A"})[0] == 400
    assert put(aws, "routine", "routine-0001", {"name": "A", "exercises": [{"exercise_id": "nope"}]})[0] == 404
    bad_sets = {"name": "A", "exercises": [{"exercise_id": "deadlift", "sets": 0}]}
    assert put(aws, "routine", "routine-0001", bad_sets)[0] == 400


def test_body_entries_one_per_day(aws):
    status, doc = put(aws, "body", "2026-10-30", {"weight": 82.4, "waist": "88,5"})
    assert status == 400  # "88,5" is not a number for the API (the app sends 88.5)
    status, doc = put(aws, "body", "2026-10-30", {"weight": 82.4, "waist": 88.5})
    assert (status, doc["weight"], doc["waist"]) == (200, 82.4, 88.5)
    put(aws, "body", "2026-10-30", {"weight": 82.0})
    [entry] = call(aws, "GET /api/docs")[1]["body"]
    assert entry == {"id": "2026-10-30", "date": "2026-10-30", "weight": 82}
    assert put(aws, "body", "2026-10-30", {})[0] == 400
    assert put(aws, "body", "2026-10-30", {"weight": 5})[0] == 400
    assert put(aws, "body", "30-10-2026", {"weight": 80})[0] == 400


def test_goals(aws):
    assert put(aws, "goal", "flat-barbell-bench-press", {"weight": 100, "reps": 1})[0] == 200
    assert put(aws, "goal", "body-weight", {"weight": 78})[0] == 200
    assert put(aws, "goal", "nope", {"weight": 100})[0] == 404
    goals = {g["id"]: g for g in call(aws, "GET /api/docs")[1]["goal"]}
    assert goals["flat-barbell-bench-press"] == {"id": "flat-barbell-bench-press", "weight": 100, "reps": 1}
    assert goals["body-weight"] == {"id": "body-weight", "weight": 78}


def test_notes_and_plans(aws):
    assert put(aws, "note", "2026-10-30", {"text": "Felt strong"})[0] == 200
    assert put(aws, "note", "2026-10-30", {"text": "  "})[0] == 400
    plan = {"routine_id": "routine-0001", "exercise_ids": ["lat-pulldown", "seated-cable-row"]}
    assert put(aws, "plan", "2026-10-30", plan)[0] == 200
    assert put(aws, "plan", "2026-10-30", {"exercise_ids": []})[0] == 400
    docs = call(aws, "GET /api/docs")[1]
    assert docs["note"] == [{"id": "2026-10-30", "text": "Felt strong"}]
    assert docs["plan"][0]["exercise_ids"] == ["lat-pulldown", "seated-cable-row"]
    assert put(aws, "weird", "x", {})[0] == 404


def test_set_comment(aws):
    saved = log(aws, "set-0001", weight=60, reps=10, comment="slow negatives")
    assert saved["comment"] == "slow negatives"
