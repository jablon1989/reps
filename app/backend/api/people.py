"""Who may use reps, and inviting friends (the shared pusiaczkowo.pl login).

reps uses the shared Cognito user pool (managed in jablon1989/aura-the-husky,
terraform/reps.tf) with three groups:
  reps       – may use reps
  reps-admin – may invite friends
  reps-only  – friends invited here: the other apps turn them away
"""

from __future__ import annotations

import os

import boto3

REGION = os.environ.get("AWS_REGION", "eu-central-1")
USER_POOL_ID = os.environ.get("USER_POOL_ID", "")

ACCESS_GROUP = "reps"
ADMIN_GROUP = "reps-admin"
FRIEND_GROUP = "reps-only"


class InviteError(Exception):
    pass


def _client():
    return boto3.client("cognito-idp", region_name=REGION)


def _members(client, group: str) -> list[dict]:
    try:
        pages = client.get_paginator("list_users_in_group").paginate(UserPoolId=USER_POOL_ID, GroupName=group)
        return [user for page in pages for user in page["Users"]]
    except client.exceptions.ResourceNotFoundException:
        return []


def _attrs(user: dict) -> dict[str, str]:
    return {a["Name"]: a["Value"] for a in user.get("Attributes", user.get("UserAttributes", []))}


def people() -> list[dict]:
    """Everyone with access to reps, for the admin page."""
    client = _client()
    friends = {u["Username"] for u in _members(client, FRIEND_GROUP)}
    admins = {u["Username"] for u in _members(client, ADMIN_GROUP)}
    out = []
    for user in _members(client, ACCESS_GROUP):
        attrs = _attrs(user)
        out.append(
            {
                "name": attrs.get("name") or attrs.get("email") or user["Username"],
                "email": attrs.get("email", ""),
                "friend": user["Username"] in friends,
                "admin": user["Username"] in admins,
                # FORCE_CHANGE_PASSWORD = invited, hasn't logged in yet
                "status": user.get("UserStatus", ""),
                "enabled": user.get("Enabled", True),
            }
        )
    return sorted(out, key=lambda p: p["name"].lower())


def invite(email: str, name: str) -> dict:
    """Create a reps-only login and e-mail the friend a temporary password.

    Someone who already has a pusiaczkowo.pl login (e.g. family) just gets
    access to reps, without being limited to it.
    """
    client = _client()
    try:
        client.admin_create_user(
            UserPoolId=USER_POOL_ID,
            Username=email,
            UserAttributes=[
                {"Name": "email", "Value": email},
                {"Name": "email_verified", "Value": "true"},
                {"Name": "name", "Value": name},
            ],
            DesiredDeliveryMediums=["EMAIL"],
            # The pool's custom-message trigger sends the reps invite text.
            ClientMetadata={"app": "reps"},
        )
        new = True
    except client.exceptions.UsernameExistsException:
        new = False
    username = client.admin_get_user(UserPoolId=USER_POOL_ID, Username=email)["Username"]
    if new:
        # Limit first, then grant access: never a moment with access to every app.
        client.admin_add_user_to_group(UserPoolId=USER_POOL_ID, Username=username, GroupName=FRIEND_GROUP)
    client.admin_add_user_to_group(UserPoolId=USER_POOL_ID, Username=username, GroupName=ACCESS_GROUP)
    return {"email": email, "name": name, "new": new}
