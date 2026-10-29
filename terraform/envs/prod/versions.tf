terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.7"
    }
  }

  # Bucket name is passed at init time (it contains the account id):
  #   terraform init -backend-config="bucket=<state_bucket from bootstrap>"
  backend "s3" {
    key          = "prod/terraform.tfstate"
    region       = "eu-central-1"
    encrypt      = true
    use_lockfile = true
  }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project     = var.project
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

# Only to look up the shared certificate: CloudFront certificates live in us-east-1.
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}
