#!/usr/bin/env python3
"""Local fake backend for trying reps without AWS (`make local`).

Runs the real API Lambda handler against in-memory DynamoDB and Cognito
(moto). No passwords: the browser says who it is ("Bearer dev:<name>"). The
first person is an admin. Everything is lost when you stop the server.

  app/backend/.venv/bin/python tools/dev_server.py [--port 8788] [--players Bartosz,Asiulka]
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qsl, unquote, urlparse

ROOT = Path(__file__).resolve().parents[1]
REGION = "eu-central-1"

for key, value in {
    "AWS_DEFAULT_REGION": REGION,
    "AWS_REGION": REGION,
    "AWS_ACCESS_KEY_ID": "local",
    "AWS_SECRET_ACCESS_KEY": "local",
    "DATA_TABLE": "local-data",
}.items():
    os.environ[key] = value

import boto3  # noqa: E402
from moto import mock_aws  # noqa: E402

sys.path.insert(0, str(ROOT / "app" / "backend" / "api"))
sys.path.insert(0, str(ROOT / "app" / "backend" / "tests"))
from schema import TABLE_SCHEMA  # noqa: E402

LOCK = threading.Lock()  # one request at a time: simple and safe with moto


def setup_aws(players: list[str]) -> str:
    """Fake table + fake shared login: everyone in `reps`, the first one also an admin."""
    boto3.client("dynamodb", region_name=REGION).create_table(
        TableName="local-data",
        BillingMode="PAY_PER_REQUEST",
        **TABLE_SCHEMA,
    )
    cognito = boto3.client("cognito-idp", region_name=REGION)
    pool_id = cognito.create_user_pool(PoolName="local-users")["UserPool"]["Id"]
    for group in ("reps", "reps-admin", "reps-only"):
        cognito.create_group(UserPoolId=pool_id, GroupName=group)
    for i, name in enumerate(players):
        email = f"{name.lower()}@example.local"
        cognito.admin_create_user(
            UserPoolId=pool_id,
            Username=email,
            UserAttributes=[{"Name": "email", "Value": email}, {"Name": "name", "Value": name}],
        )
        for group in ("reps", "reps-admin") if i == 0 else ("reps",):
            cognito.admin_add_user_to_group(UserPoolId=pool_id, Username=email, GroupName=group)
    return pool_id


def compile_routes(route_keys) -> list[tuple[str, re.Pattern, str]]:
    """'PUT /api/me/settings' -> (PUT, regex with named groups, route key)"""
    out = []
    for key in route_keys:
        method, path = key.split(" ", 1)
        pattern = re.sub(r"\{(\w+)\}", r"(?P<\1>[^/]+)", path)
        out.append((method, re.compile(f"^{pattern}$"), key))
    return out


class Handler(BaseHTTPRequestHandler):
    api = None
    players: list[str] = []
    routes: list = []

    def log_message(self, fmt, *args):  # quieter log
        sys.stderr.write(f"  {self.command} {self.path.split('?')[0]} -> {args[1] if len(args) > 1 else ''}\n")

    def _send(self, status: int, body: bytes = b"", content_type: str = "application/json"):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if body and self.command != "HEAD":
            self.wfile.write(body)

    def _body(self) -> bytes:
        length = int(self.headers.get("Content-Length") or 0)
        return self.rfile.read(length) if length else b""

    def _claims(self, name: str) -> dict:
        admin = self.players and name == self.players[0]
        return {
            "sub": f"dev-{name.lower()}",
            "name": name,
            "email": f"{name.lower()}@example.local",
            "cognito:groups": "[reps reps-admin]" if admin else "[reps]",
        }

    def _api(self) -> None:
        path = urlparse(self.path).path
        match = None
        for method, regex, route in self.routes:
            m = regex.match(path)
            if m and method == self.command:
                match = (m, route)
                break
        if not match:
            return self._send(404, json.dumps({"message": f"No route {self.command} {path}"}).encode())
        m, route = match

        auth = self.headers.get("Authorization", "")
        if not auth.startswith("Bearer dev:"):
            return self._send(401, b'{"message":"Unauthorized"}')
        event = {
            "routeKey": route,
            "pathParameters": {k: unquote(v) for k, v in m.groupdict().items()} or None,
            "queryStringParameters": dict(parse_qsl(urlparse(self.path).query)) or None,
            "body": self._body().decode() or None,
            "requestContext": {"authorizer": {"jwt": {"claims": self._claims(unquote(auth[len("Bearer dev:") :]))}}},
        }
        with LOCK:
            res = self.api.handler(event)
        self._send(res["statusCode"], res["body"].encode(), res["headers"]["Content-Type"])

    def _dispatch(self) -> None:
        if self.path.split("?")[0] == "/config.json":
            return self._send(200, json.dumps({"dev": {"players": self.players}}).encode())
        if self.path.startswith("/api/"):
            return self._api()
        self._send(404, b"")

    do_GET = do_POST = do_PUT = do_PATCH = do_DELETE = do_HEAD = _dispatch


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--port", type=int, default=8788)
    parser.add_argument("--players", default="Bartosz,Asiulka", help="comma-separated names; the first is an admin")
    args = parser.parse_args()
    players = [p.strip() for p in args.players.split(",") if p.strip()]

    with mock_aws():
        pool_id = setup_aws(players)
        os.environ["USER_POOL_ID"] = pool_id
        import handler as api
        import people

        people.USER_POOL_ID = pool_id

        Handler.api = api
        Handler.players = players
        Handler.routes = compile_routes(api.ROUTES)
        server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
        print(f"Fake reps API on http://localhost:{args.port} – people: {', '.join(players)}", file=sys.stderr)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
