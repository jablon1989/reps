import os
import sys
from pathlib import Path

import boto3
import pytest
from moto import mock_aws

ROOT = Path(__file__).resolve().parents[1]

os.environ.setdefault("AWS_DEFAULT_REGION", "eu-central-1")
os.environ.setdefault("AWS_REGION", "eu-central-1")
os.environ.setdefault("AWS_ACCESS_KEY_ID", "test")
os.environ.setdefault("AWS_SECRET_ACCESS_KEY", "test")
os.environ["DATA_TABLE"] = "test-data"

sys.path.insert(0, str(ROOT / "api"))


@pytest.fixture
def aws(monkeypatch):
    """The API with a fake table and a fake shared login (with the reps groups)."""
    with mock_aws():
        ddb = boto3.client("dynamodb", region_name="eu-central-1")
        ddb.create_table(
            TableName="test-data",
            BillingMode="PAY_PER_REQUEST",
            KeySchema=[{"AttributeName": "pk", "KeyType": "HASH"}, {"AttributeName": "sk", "KeyType": "RANGE"}],
            AttributeDefinitions=[
                {"AttributeName": "pk", "AttributeType": "S"},
                {"AttributeName": "sk", "AttributeType": "S"},
            ],
        )
        cognito = boto3.client("cognito-idp", region_name="eu-central-1")
        pool_id = cognito.create_user_pool(PoolName="aurathehusky-users")["UserPool"]["Id"]
        for group in ("reps", "reps-admin", "reps-only"):
            cognito.create_group(UserPoolId=pool_id, GroupName=group)

        import handler
        import people

        monkeypatch.setattr(people, "USER_POOL_ID", pool_id)
        handler._dynamodb = boto3.resource("dynamodb", region_name="eu-central-1")
        handler.table = handler._dynamodb.Table("test-data")
        handler.cognito = cognito
        handler.pool_id = pool_id
        yield handler
