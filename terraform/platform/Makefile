# --- Configuration ---

STATE_BUCKET ?= justtellme-platform-terraform-state
STATE_PREFIX ?= platform

# --- Core targets ---

.PHONY: init init-upgrade plan apply output fmt validate clean help

init: ## Initialize Terraform
	terraform init -reconfigure -input=false \
		-backend-config="bucket=$(STATE_BUCKET)" \
		-backend-config="prefix=$(STATE_PREFIX)"

init-upgrade: ## Re-initialize and upgrade provider versions
	terraform init -reconfigure -upgrade -input=false \
		-backend-config="bucket=$(STATE_BUCKET)" \
		-backend-config="prefix=$(STATE_PREFIX)"

plan: ## Show execution plan
	terraform plan

apply: ## Apply changes
	terraform apply

output: ## Show outputs
	terraform output

fmt: ## Format Terraform files
	terraform fmt -recursive .

validate: ## Validate configuration
	terraform validate

clean: ## Remove local Terraform caches
	rm -rf .terraform .terraform.lock.hcl

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

.DEFAULT_GOAL := help
