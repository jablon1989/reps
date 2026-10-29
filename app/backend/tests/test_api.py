import json

ADMIN = {"sub": "sub-bartosz", "name": "Bartosz", "email": "b@example.com", "cognito:groups": "[reps reps-admin]"}
MEMBER = {"sub": "sub-asia", "name": "Asiulka", "email": "a@example.com", "cognito:groups": "[reps]"}


def call(h, route, claims=ADMIN, body=None):
    event = {
        "routeKey": route,
        "body": json.dumps(body) if body is not None else None,
        "requestContext": {"authorizer": {"jwt": {"claims": claims}}},
    }
    res = h.handler(event)
    return res["statusCode"], (json.loads(res["body"]) if res["body"] else None)


def test_unknown_route(aws):
    assert call(aws, "GET /api/nope")[0] == 404


def test_me(aws):
    status, me = call(aws, "GET /api/me")
    assert status == 200
    assert me == {
        "name": "Bartosz",
        "email": "b@example.com",
        "admin": True,
        "friend": False,
        "settings": {"language": "en"},
    }
    assert call(aws, "GET /api/me", MEMBER)[1]["admin"] is False


def test_groups_as_a_list(aws):
    assert call(aws, "GET /api/me", MEMBER | {"cognito:groups": ["reps"]})[0] == 200


def test_login_without_reps_group_is_turned_away(aws):
    status, body = call(aws, "GET /api/me", MEMBER | {"cognito:groups": ""})
    assert status == 403
    assert "no access" in body["message"]


def test_language_is_saved_per_person(aws):
    assert call(aws, "PUT /api/me/settings", body={"language": "pl"}) == (200, {"language": "pl"})
    assert call(aws, "GET /api/me")[1]["settings"] == {"language": "pl"}
    assert call(aws, "GET /api/me", MEMBER)[1]["settings"] == {"language": "en"}
    assert call(aws, "PUT /api/me/settings", body={"language": "de"})[0] == 400


def test_only_admins_invite(aws):
    assert call(aws, "GET /api/admin/people", MEMBER)[0] == 403
    assert call(aws, "POST /api/admin/invites", MEMBER, {"email": "f@example.com", "name": "F"})[0] == 403


def test_invite_a_friend(aws):
    status, body = call(aws, "POST /api/admin/invites", body={"email": " Friend@Example.com ", "name": "Kuba"})
    assert status == 201
    assert body == {"email": "friend@example.com", "name": "Kuba", "new": True}

    groups = aws.cognito.admin_list_groups_for_user(UserPoolId=aws.pool_id, Username="friend@example.com")
    assert {g["GroupName"] for g in groups["Groups"]} == {"reps", "reps-only"}

    status, body = call(aws, "GET /api/admin/people")
    assert status == 200
    [friend] = body["people"]
    assert friend["name"] == "Kuba"
    assert friend["friend"] is True
    assert friend["status"] == "FORCE_CHANGE_PASSWORD"


def test_inviting_someone_with_a_login_only_adds_reps(aws):
    aws.cognito.admin_create_user(
        UserPoolId=aws.pool_id,
        Username="family@example.com",
        UserAttributes=[{"Name": "email", "Value": "family@example.com"}],
    )
    status, body = call(aws, "POST /api/admin/invites", body={"email": "family@example.com", "name": "Mama"})
    assert status == 201
    assert body["new"] is False
    groups = aws.cognito.admin_list_groups_for_user(UserPoolId=aws.pool_id, Username="family@example.com")
    assert {g["GroupName"] for g in groups["Groups"]} == {"reps"}


def test_invite_needs_email_and_name(aws):
    assert call(aws, "POST /api/admin/invites", body={"email": "nope", "name": "X"})[0] == 400
    assert call(aws, "POST /api/admin/invites", body={"email": "x@example.com", "name": " "})[0] == 400
