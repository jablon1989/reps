# reps.pusiaczkowo.pl: the DNS zone and the wildcard certificate are shared by
# all sites on the domain and managed in jablon1989/aura-the-husky (terraform/).
# Apply that stack first. Both are looked up by name, nothing to copy.
locals {
  use_domain = var.domain_name != null
}

data "aws_route53_zone" "shared" {
  count = local.use_domain ? 1 : 0
  name  = var.domain_zone
}

data "aws_acm_certificate" "shared" {
  count       = local.use_domain ? 1 : 0
  provider    = aws.us_east_1
  domain      = var.domain_zone # pusiaczkowo.pl + *.pusiaczkowo.pl
  statuses    = ["ISSUED"]
  most_recent = true
}

resource "aws_route53_record" "site" {
  for_each = local.use_domain ? toset(["A", "AAAA"]) : toset([])

  zone_id = data.aws_route53_zone.shared[0].zone_id
  name    = var.domain_name
  type    = each.value

  alias {
    name                   = module.cdn.domain_name
    zone_id                = module.cdn.hosted_zone_id
    evaluate_target_health = false
  }
}
