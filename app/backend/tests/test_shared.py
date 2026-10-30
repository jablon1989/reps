from test_api import ADMIN, MEMBER
from test_workouts import call

SUMMARY = {
    "workouts": 120,
    "sets": 2400,
    "tonnage": 812345.5,
    "streak": 3,
    "longest": 11,
    "first": "2024-01-08",
    "weeks": [{"week": "2026-10-26", "workouts": 3, "sets": 60, "tonnage": 15000.25}],
    "parts": [{"category": "chest", "sets": 20, "tonnage": 6000}],
    "prs": [
        {
            "date": "2026-10-28",
            "exercise_id": "flat-barbell-bench-press",
            "en": "Flat Barbell Bench Press",
            "pl": "Wyciskanie sztangi na ławce płaskiej",
            "category": "chest",
            "weight": 102.5,
            "reps": 3,
        }
    ],
    "bests": [
        {
            "exercise_id": "flat-barbell-bench-press",
            "en": "Flat Barbell Bench Press",
            "pl": "Wyciskanie",
            "category": "chest",
            "custom": False,
            "weight": 102.5,
            "e1rm": 112.75,
            "date": "2026-10-28",
        }
    ],
    "extra": "dropped",
}


def share(aws, claims, on=True):
    assert call(aws, "PUT /api/me/settings", claims, body={"share": on})[0] == 200


def test_sharing_is_off_by_default(aws):
    assert call(aws, "GET /api/shared")[1] == {"sharing": False, "people": []}
    assert call(aws, "PUT /api/shared/me", body=SUMMARY)[0] == 409


def test_only_people_who_share_see_each_other(aws):
    share(aws, ADMIN)
    status, saved = call(aws, "PUT /api/shared/me", body=SUMMARY)
    assert status == 200, saved
    assert saved["tonnage"] == 812345.5 and "extra" not in saved

    # Asia doesn't share yet: she sees nothing.
    assert call(aws, "GET /api/shared", MEMBER)[1]["sharing"] is False

    share(aws, MEMBER)
    call(aws, "PUT /api/shared/me", MEMBER, body={**SUMMARY, "workouts": 80})
    status, page = call(aws, "GET /api/shared", MEMBER)
    assert status == 200 and page["sharing"] is True
    assert [(p["name"], p["me"], p["workouts"]) for p in page["people"]] == [
        ("Asiulka", True, 80),
        ("Bartosz", False, 120),
    ]
    assert page["people"][1]["bests"][0]["e1rm"] == 112.75

    # Turning it off takes the summary away at once.
    share(aws, ADMIN, on=False)
    names = [p["name"] for p in call(aws, "GET /api/shared", MEMBER)[1]["people"]]
    assert names == ["Asiulka"]
    assert call(aws, "GET /api/me")[1]["settings"]["share"] is False


def test_summary_validation(aws):
    share(aws, ADMIN)
    bad = [
        {"workouts": -1},
        {"tonnage": "lots"},
        {"weeks": [{"week": "nope"}]},
        {"weeks": [{"week": "2026-10-26"}] * 27},
        {"prs": ["x"]},
        {"bests": [{"exercise_id": "a" * 81, "date": "2026-10-28"}]},
    ]
    for body in bad:
        assert call(aws, "PUT /api/shared/me", body=body)[0] == 400, body
    assert call(aws, "PUT /api/me/settings", body={"share": "yes"})[0] == 400


def test_colour(aws):
    share(aws, ADMIN)
    call(aws, "PUT /api/shared/me", body=SUMMARY)
    assert call(aws, "GET /api/shared")[1]["people"][0]["color"] is None
    assert call(aws, "PUT /api/me/settings", body={"color": "violet"})[0] == 200
    assert call(aws, "GET /api/shared")[1]["people"][0]["color"] == "violet"
    assert call(aws, "GET /api/me")[1]["settings"]["color"] == "violet"
    assert call(aws, "PUT /api/me/settings", body={"color": "gold"})[0] == 400
    # Picking a colour before sharing is fine; it's used once the summary arrives.
    assert call(aws, "PUT /api/me/settings", MEMBER, body={"color": "teal"})[0] == 200
    share(aws, MEMBER)
    assert call(aws, "PUT /api/shared/me", MEMBER, body=SUMMARY)[1]["color"] == "teal"
