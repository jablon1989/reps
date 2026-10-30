import json

from test_api import ADMIN, MEMBER


def call(h, route, claims=ADMIN, body=None, query=None, **path):
    event = {
        "routeKey": route,
        "pathParameters": path or None,
        "queryStringParameters": query,
        "body": json.dumps(body) if body is not None else None,
        "requestContext": {"authorizer": {"jwt": {"claims": claims}}},
    }
    res = h.handler(event)
    return res["statusCode"], (json.loads(res["body"]) if res["body"] else None)


def log(h, set_id, exercise="lat-pulldown", day="2026-10-29", claims=ADMIN, **fields):
    body = {"date": day, "exercise_id": exercise, "at": f"{day}T18:00:{set_id[-2:]}"} | fields
    status, saved = call(h, "PUT /api/sets/{setId}", claims, body, setId=set_id)
    assert status == 200, saved
    return saved


def test_catalogue_has_both_languages(aws):
    status, body = call(aws, "GET /api/exercises")
    assert status == 200
    assert [c["id"] for c in body["categories"]][:3] == ["shoulders", "triceps", "biceps"]
    lat = next(e for e in body["exercises"] if e["id"] == "lat-pulldown")
    assert lat == {
        "id": "lat-pulldown",
        "category": "back",
        "type": "weight_reps",
        "en": "Lat Pulldown",
        "pl": "Ściąganie drążka wyciągu górnego",
        "custom": False,
        "hidden": False,
        "favourite": False,
        "step": 1,
        "rest": 90,
    }
    assert all(e["pl"] and e["en"] for e in body["exercises"])


def test_own_exercise_pinned_to_a_category(aws):
    status, ex = call(aws, "POST /api/exercises", body={"en": "Landmine Press", "category": "chest", "favourite": True})
    assert status == 201
    assert ex["id"].startswith("c-")
    assert (ex["en"], ex["pl"], ex["category"], ex["custom"], ex["favourite"]) == (
        "Landmine Press",
        "Landmine Press",
        "chest",
        True,
        True,
    )
    # Only visible to its owner.
    others = call(aws, "GET /api/exercises", MEMBER)[1]["exercises"]
    assert ex["id"] not in {e["id"] for e in others}

    status, ex = call(aws, "PATCH /api/exercises/{exerciseId}", body={"pl": "Wyciskanie landmine"}, exerciseId=ex["id"])
    assert (status, ex["pl"], ex["en"]) == (200, "Wyciskanie landmine", "Landmine Press")

    assert call(aws, "DELETE /api/exercises/{exerciseId}", exerciseId=ex["id"])[0] == 204
    mine = {e["id"]: e for e in call(aws, "GET /api/exercises")[1]["exercises"]}
    assert mine[ex["id"]]["hidden"] is True


def test_exercise_needs_name_and_category(aws):
    assert call(aws, "POST /api/exercises", body={"category": "chest"})[0] == 400
    assert call(aws, "POST /api/exercises", body={"en": "X", "category": "neck"})[0] == 400


def test_builtin_favourite_step_and_rest(aws):
    status, ex = call(
        aws,
        "PATCH /api/exercises/{exerciseId}",
        body={"favourite": True, "step": 2.5, "rest": 120},
        exerciseId="flat-dumbbell-bench-press",
    )
    assert status == 200
    assert (ex["favourite"], ex["step"], ex["rest"]) == (True, 2.5, 120)
    assert call(aws, "PATCH /api/exercises/{exerciseId}", body={"en": "X"}, exerciseId="deadlift")[0] == 400
    assert call(aws, "DELETE /api/exercises/{exerciseId}", exerciseId="deadlift")[0] == 400
    assert call(aws, "PATCH /api/exercises/{exerciseId}", body={"rest": 1}, exerciseId="nope")[0] == 404


def test_log_sets_for_a_day(aws):
    log(aws, "set-0001", weight=60, reps=10)
    log(aws, "set-0002", weight=62.5, reps=8)
    log(aws, "set-0003", "cable-curl", weight=27.5, reps=12)
    log(aws, "set-0004", day="2026-10-27", weight=55, reps=10)

    status, body = call(aws, "GET /api/sets", query={"date": "2026-10-29"})
    assert status == 200
    assert [(s["exercise_id"], s["weight"], s["reps"]) for s in body["sets"]] == [
        ("lat-pulldown", 60, 10),
        ("lat-pulldown", 62.5, 8),
        ("cable-curl", 27.5, 12),
    ]
    assert call(aws, "GET /api/sets", MEMBER, query={"date": "2026-10-29"})[1]["sets"] == []


def test_saving_a_set_again_overwrites_it(aws):
    log(aws, "set-0001", weight=60, reps=10)
    log(aws, "set-0001", weight=65, reps=9)
    sets = call(aws, "GET /api/sets", query={"date": "2026-10-29"})[1]["sets"]
    assert [(s["weight"], s["reps"]) for s in sets] == [(65, 9)]

    assert call(aws, "DELETE /api/sets/{setId}", query={"date": "2026-10-29"}, setId="set-0001")[0] == 204
    assert call(aws, "GET /api/sets", query={"date": "2026-10-29"})[1]["sets"] == []


def test_set_validation(aws):
    body = {"date": "2026-10-29", "exercise_id": "lat-pulldown", "weight": 60, "reps": 10}
    put = lambda b: call(aws, "PUT /api/sets/{setId}", body=body | b, setId="set-0009")[0]  # noqa: E731
    assert put({}) == 200
    assert put({"reps": 0}) == 400
    assert put({"reps": 2.5}) == 400
    assert put({"weight": -5}) == 400
    assert put({"weight": "abc"}) == 400
    assert put({"date": "29.10.2026"}) == 400
    assert put({"exercise_id": "nope"}) == 404
    assert call(aws, "PUT /api/sets/{setId}", body=body, setId="x")[0] == 400


def test_bodyweight_and_cardio(aws):
    pull = log(aws, "set-0001", "pull-up", reps=8)
    assert (pull["weight"], pull["reps"]) == (0, 8)
    assisted = log(aws, "set-0002", "pull-up", weight=-20, reps=6)
    assert assisted["weight"] == -20
    run = log(aws, "set-0003", "running-treadmill", distance=5.2, seconds=1800)
    assert (run["distance"], run["seconds"]) == (5.2, 1800)
    assert "reps" not in run
    status, _ = call(
        aws, "PUT /api/sets/{setId}", body={"date": "2026-10-29", "exercise_id": "walking"}, setId="set-0004"
    )
    assert status == 400


def test_history_is_newest_first_and_skips_today(aws):
    for i, day in enumerate(["2026-10-20", "2026-10-22", "2026-10-22", "2026-10-25", "2026-10-29"]):
        log(aws, f"set-000{i}", day=day, weight=50 + i, reps=10)
    log(aws, "set-0099", "cable-curl", day="2026-10-26", weight=20, reps=10)

    status, body = call(
        aws,
        "GET /api/exercises/{exerciseId}/history",
        query={"before": "2026-10-29", "sessions": "2"},
        exerciseId="lat-pulldown",
    )
    assert status == 200
    assert [(s["date"], [x["weight"] for x in s["sets"]]) for s in body["sessions"]] == [
        ("2026-10-25", [53]),
        ("2026-10-22", [51, 52]),
    ]


def test_all_sets_in_pages(aws, monkeypatch):
    import workouts

    monkeypatch.setattr(workouts, "ALL_PAGE", 3)
    for i, day in enumerate(["2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23"]):
        log(aws, f"set-000{i}", day=day, weight=50 + i, reps=10)
    log(aws, "set-0099", "running-treadmill", day="2026-10-24", distance=5, seconds=1500)

    status, page = call(aws, "GET /api/sets/all")
    assert status == 200
    assert [r[1] for r in page["sets"]] == ["2026-10-20", "2026-10-21", "2026-10-22"]
    first = ["set-0000", "2026-10-20", "2026-10-20T18:00:00", "lat-pulldown", 50, 10, None, None, None]
    assert page["sets"][0] == first
    status, page = call(aws, "GET /api/sets/all", query={"cursor": page["next"]})
    assert [r[1] for r in page["sets"]] == ["2026-10-23", "2026-10-24"]
    assert page["sets"][1][6:] == [5, 1500, None]
    assert page["next"] is None
    assert call(aws, "GET /api/sets/all", MEMBER)[1] == {"sets": [], "next": None}
    assert call(aws, "GET /api/sets/all", query={"cursor": "bm9wZQ=="})[0] == 400
