# Everything in one table, keyed by person: pk = USER#<login sub>, sk = what
# it is (SETTINGS, exercises, sets, …; see app/backend/api/handler.py).

resource "aws_dynamodb_table" "data" {
  name         = "${var.name}-data"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  deletion_protection_enabled = true

  # Turning on PITR for a brand-new table can take AWS well over the default
  # 20 minutes ("Backups are being enabled… retry later").
  timeouts {
    create = "60m"
    update = "60m"
  }
}
