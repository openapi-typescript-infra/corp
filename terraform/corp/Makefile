# --- Configuration ---

GCP_PROJECT_ID ?= justtellme-dev
STATE_BUCKET   ?= justtellme-platform-terraform-state
STATE_PREFIX   ?= corp

# --- Core targets ---

.PHONY: lint format validate init plan apply

lint: ## Check formatting
	terraform fmt -check -recursive .

format: ## Format all Terraform files
	terraform fmt -recursive .

validate: ## Validate configuration (requires init)
	terraform validate

init: ## Initialize Terraform (downloads providers, configures backend)
	terraform init -reconfigure -upgrade -input=false \
		-backend-config="bucket=$(STATE_BUCKET)" \
		-backend-config="prefix=$(STATE_PREFIX)"

plan: ## Show execution plan
	terraform plan -out=tfplan

apply: ## Apply changes
	terraform apply tfplan

# --- Utility ---

clean: ## Remove local Terraform caches
	rm -rf .terraform .terraform.lock.hcl *.tfplan

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

.DEFAULT_GOAL := help
