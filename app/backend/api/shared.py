"""The shared "us" page: a stats summary per person who chose to share.

Logs stay private. A person who turns sharing on lets their phone send a
summary (weeks, body parts, recent PRs, best lifts), worked out from the sets
on the phone, so the page works the same offline and costs one small read per
person. Only people who share can see the others.

  USER#<sub> / SETTINGS  – `share: true`
  SHARED     / USER#<sub> – the summary (JSON text, so floats stay floats)
  FIVES#<sub> / <key>#<giver id> – a high-five someone gave you for a PR or a week

People are told apart on the page by an id made from their login (not the
login itself). A high-five's key says what it's for: `pr:<exercise>:<date>:<kg>:<reps>`
or `week:<monday>`, so the phone that gets it can say "your bench PR".
"""

from __future__ import annotations

import hashlib
import json
import re
from datetime import date

from boto3.dynamodb.conditions import Key

from workouts import Invalid

PK = "SHARED"
FIVES = "FIVES#"
FIVE_KEY = re.compile(r"^(pr:[a-z0-9-]{1,80}:\d{4}-\d{2}-\d{2}:\d{1,4}(\.\d{1,3})?:\d{1,4}|week:\d{4}-\d{2}-\d{2})$")
RECEIVED = 30
# Each person picks the colour their stats are drawn in on the "us" page.
COLORS = ("lime", "blue", "pink", "orange", "violet", "teal")
MAX_BYTES = 60_000
LIMITS = {"weeks": 26, "parts": 20, "prs": 20, "bests": 60}
NUMBER = (int, float)


def _num(value, field: str, high: float = 1e9) -> float:
    if not isinstance(value, NUMBER) or isinstance(value, bool) or not 0 <= value <= high:
        raise Invalid(400, f"{field} must be a number")
    return value


def _day(value, field: str) -> str:
    try:
        return date.fromisoformat(str(value)).isoformat()
    except ValueError:
        raise Invalid(400, f"{field} must be a date") from None


def _text(value, field: str, limit: int = 80) -> str:
    if not isinstance(value, str) or len(value) > limit:
        raise Invalid(400, f"{field} must be text")
    return value


def _list(body: dict, field: str) -> list:
    items = body.get(field, [])
    if not isinstance(items, list) or len(items) > LIMITS[field]:
        raise Invalid(400, f"{field}: up to {LIMITS[field]} items")
    if not all(isinstance(i, dict) for i in items):
        raise Invalid(400, f"{field} must be a list of objects")
    return items


def check(body: dict) -> dict:
    """Keep only the known fields, with sane values (raises Invalid otherwise)."""
    out: dict = {
        "workouts": int(_num(body.get("workouts", 0), "workouts")),
        "sets": int(_num(body.get("sets", 0), "sets")),
        "tonnage": _num(body.get("tonnage", 0), "tonnage"),
        "streak": int(_num(body.get("streak", 0), "streak", 10_000)),
        "longest": int(_num(body.get("longest", 0), "longest", 10_000)),
        "first": _day(body["first"], "first") if body.get("first") else None,
    }
    out["weeks"] = [
        {
            "week": _day(w.get("week"), "week"),
            "workouts": int(_num(w.get("workouts", 0), "workouts", 7)),
            "sets": int(_num(w.get("sets", 0), "sets")),
            "tonnage": _num(w.get("tonnage", 0), "tonnage"),
        }
        for w in _list(body, "weeks")
    ]
    out["parts"] = [
        {
            "category": _text(p.get("category"), "category", 40),
            "sets": int(_num(p.get("sets", 0), "sets")),
            "tonnage": _num(p.get("tonnage", 0), "tonnage"),
        }
        for p in _list(body, "parts")
    ]
    out["prs"] = [
        {
            "date": _day(p.get("date"), "date"),
            "exercise_id": _text(p.get("exercise_id"), "exercise_id"),
            "en": _text(p.get("en", ""), "en"),
            "pl": _text(p.get("pl", ""), "pl"),
            "category": _text(p.get("category", ""), "category", 40),
            "weight": _num(p.get("weight", 0), "weight", 2000),
            "reps": int(_num(p.get("reps", 0), "reps", 1000)),
        }
        for p in _list(body, "prs")
    ]
    out["bests"] = [
        {
            "exercise_id": _text(b.get("exercise_id"), "exercise_id"),
            "en": _text(b.get("en", ""), "en"),
            "pl": _text(b.get("pl", ""), "pl"),
            "category": _text(b.get("category", ""), "category", 40),
            "custom": bool(b.get("custom", False)),
            "weight": _num(b.get("weight", 0), "weight", 2000),
            "e1rm": _num(b.get("e1rm", 0), "e1rm", 3000),
            "date": _day(b.get("date"), "date"),
        }
        for b in _list(body, "bests")
    ]
    return out


def put(table, sub: str, name: str, color: str | None, body: dict, now: str) -> dict:
    summary = check(body)
    data = json.dumps(summary, separators=(",", ":"))
    if len(data) > MAX_BYTES:
        raise Invalid(400, "Summary is too big")
    item = {"pk": PK, "sk": f"USER#{sub}", "name": name, "data": data, "updated_at": now}
    if color:
        item["color"] = color
    table.put_item(Item=item)
    return {**summary, "name": name, "color": color, "updated_at": now}


def set_color(table, sub: str, color: str) -> None:
    """A new colour shows on the page at once (if there's a summary there)."""
    try:
        table.update_item(
            Key={"pk": PK, "sk": f"USER#{sub}"},
            UpdateExpression="SET color = :c",
            ConditionExpression="attribute_exists(pk)",
            ExpressionAttributeValues={":c": color},
        )
    except table.meta.client.exceptions.ConditionalCheckFailedException:
        pass


def delete(table, sub: str) -> None:
    table.delete_item(Key={"pk": PK, "sk": f"USER#{sub}"})


def person_id(sub: str) -> str:
    return hashlib.sha256(f"reps-person-{sub}".encode()).hexdigest()[:16]


def _query(table, pk: str) -> list[dict]:
    items: list[dict] = []
    kwargs: dict = {"KeyConditionExpression": Key("pk").eq(pk)}
    while True:
        page = table.query(**kwargs)
        items.extend(page.get("Items", []))
        if "LastEvaluatedKey" not in page:
            break
        kwargs["ExclusiveStartKey"] = page["LastEvaluatedKey"]
    return items


def _fives(table, sub: str) -> list[dict]:
    """High-fives someone got, newest first."""
    out = [
        {"key": i["key"], "from_id": i["from_id"], "from": i.get("from_name", ""), "at": i["created_at"]}
        for i in _query(table, FIVES + sub)
    ]
    return sorted(out, key=lambda f: f["at"], reverse=True)


def list_all(table, me: str) -> list[dict]:
    """Everyone's summary and the high-fives they got, yours first."""
    people = []
    for item in _query(table, PK):
        sub = item["sk"].removeprefix("USER#")
        people.append(
            {
                **json.loads(item["data"]),
                "id": person_id(sub),
                "me": sub == me,
                "name": item.get("name", ""),
                "color": item.get("color"),
                "updated_at": item.get("updated_at"),
                "fives": _fives(table, sub),
            }
        )
    return sorted(people, key=lambda p: (not p["me"], p["name"].lower()))


def received(table, me: str) -> list[dict]:
    """Your latest high-fives (for the note when you open the app)."""
    return _fives(table, me)[:RECEIVED]


def high_five(table, me: str, my_name: str, body: dict, now: str) -> dict:
    """Give (on=true, the default) or take back a high-five to someone who shares."""
    to, key, on = body.get("to"), body.get("key"), body.get("on", True)
    if not isinstance(key, str) or not FIVE_KEY.match(key):
        raise Invalid(400, "key must be pr:<exercise>:<date>:<kg>:<reps> or week:<date>")
    if not isinstance(on, bool):
        raise Invalid(400, "on must be true or false")
    subs = {person_id(i["sk"].removeprefix("USER#")): i["sk"].removeprefix("USER#") for i in _query(table, PK)}
    if to not in subs:
        raise Invalid(404, "That person doesn't share their stats")
    if subs[to] == me:
        raise Invalid(400, "You can't high-five yourself")
    item_key = {"pk": FIVES + subs[to], "sk": f"{key}#{person_id(me)}"}
    if not on:
        table.delete_item(Key=item_key)
        return {"to": to, "key": key, "on": False}
    try:
        table.put_item(
            Item={**item_key, "key": key, "from_id": person_id(me), "from_name": my_name, "created_at": now},
            ConditionExpression="attribute_not_exists(pk)",
        )
    except table.meta.client.exceptions.ConditionalCheckFailedException:
        pass  # already given: keep the first time
    return {"to": to, "key": key, "on": True}
