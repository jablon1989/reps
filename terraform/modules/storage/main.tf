# Everything in one table, keyed by person: pk = USER#<login sub>, sk = what
# it is (SETTINGS, EX#, PREF#, SET#; see app/backend/api/workouts.py).

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

  # One exercise's sets, newest first: "last time" and (later) records and graphs.
  #   gsi1pk = USER#<sub>#EX#<exercise id>, gsi1sk = <date>#<time>#<set id>
  attribute {
    name = "gsi1pk"
    type = "S"
  }

  attribute {
    name = "gsi1sk"
    type = "S"
  }

  global_secondary_index {
    name            = "gsi1"
    hash_key        = "gsi1pk"
    range_key       = "gsi1sk"
    projection_type = "ALL"
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
