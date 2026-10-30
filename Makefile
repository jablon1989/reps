# Common tasks. Run `make help` for the list.
TF_DIR      := terraform/envs/prod
FE_DIR      := app/frontend
BE_DIR      := app/backend
VENV        := $(BE_DIR)/.venv
PY          := $(VENV)/bin/python
# Set once after bootstrap, e.g. export TF_STATE_BUCKET=reps-tfstate-123456789012
TF_STATE_BUCKET ?=
PLAYERS     ?= Bartosz,Asiulka

.PHONY: help venv bootstrap test lint tf-init tf-plan tf-apply fe-install fe-build deploy-frontend deploy dev-config dev local

help:
	@grep -E '^[a-z-]+:.*?## ' $(MAKEFILE_LIST) | awk -F':.*?## ' '{printf "  %-16s %s\n", $$1, $$2}'

venv: $(VENV)/bin/activate ## Python venv for tests + the local fake backend
$(VENV)/bin/activate: $(BE_DIR)/requirements-dev.txt
	python3 -m venv $(VENV) && $(VENV)/bin/pip install -q -r $(BE_DIR)/requirements-dev.txt && touch $@

bootstrap: ## One-time: create state bucket + GitHub CI roles
	cd terraform/bootstrap && terraform init && terraform apply

test: venv ## Run backend + frontend unit tests
	cd $(BE_DIR) && .venv/bin/python -m pytest -q
	cd $(FE_DIR) && npm test

lint: venv ## Lint Python + check Terraform formatting + typecheck frontend
	cd $(BE_DIR) && .venv/bin/ruff check . && .venv/bin/ruff format --check .
	terraform fmt -check -recursive terraform
	cd $(FE_DIR) && npm run typecheck

local: venv ## Try it locally with a fake backend (no AWS, no login): http://localhost:5174
	@echo "Fake backend on :8788, app on http://localhost:5174 (Ctrl+C stops both)"
	@trap 'kill 0' EXIT; \
	$(PY) tools/dev_server.py --port 8788 --players "$(PLAYERS)" & \
	cd $(FE_DIR) && npm run local

tf-init: ## terraform init (needs TF_STATE_BUCKET)
	@test -n "$(TF_STATE_BUCKET)" || (echo "Set TF_STATE_BUCKET (see bootstrap output)"; exit 1)
	terraform -chdir=$(TF_DIR) init -backend-config="bucket=$(TF_STATE_BUCKET)"

tf-plan: ## terraform plan
	terraform -chdir=$(TF_DIR) plan -out=prod.tfplan

tf-apply: ## terraform apply (the plan from tf-plan)
	terraform -chdir=$(TF_DIR) apply prod.tfplan

fe-install:
	cd $(FE_DIR) && npm ci

fe-build: ## Build the React app into app/frontend/dist
	cd $(FE_DIR) && npm run build

deploy-frontend: fe-build ## Upload the app to S3 and refresh CloudFront
	$(eval BUCKET := $(shell terraform -chdir=$(TF_DIR) output -raw web_bucket_name))
	$(eval DIST := $(shell terraform -chdir=$(TF_DIR) output -raw distribution_id))
	aws s3 sync $(FE_DIR)/dist/assets s3://$(BUCKET)/assets --cache-control "public,max-age=31536000,immutable"
	aws s3 sync $(FE_DIR)/dist s3://$(BUCKET) --delete --exclude "assets/*" --exclude "config.json" --cache-control "no-cache"
	aws cloudfront create-invalidation --distribution-id $(DIST) --paths "/index.html" "/" "/sw.js" "/manifest.json" > /dev/null
	@echo "Deployed: $$(terraform -chdir=$(TF_DIR) output -raw site_url)"

deploy: tf-plan tf-apply deploy-frontend ## Infra + app in one go

dev-config: ## Write public/config.json + .env.local for `make dev`
	terraform -chdir=$(TF_DIR) output -raw frontend_config > $(FE_DIR)/public/config.json
	echo "API_PROXY_TARGET=$$(terraform -chdir=$(TF_DIR) output -raw site_url)" > $(FE_DIR)/.env.local

dev: dev-config ## Run the React app locally against the deployed API (real login)
	cd $(FE_DIR) && npm run dev
