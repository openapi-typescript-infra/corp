# --- Configuration ---

GCP_PROJECT_ID ?= justtellme-platform
GCP_REGION     ?= us-central1
STATE_BUCKET   ?= justtellme-platform-terraform-state
LOCAL_STATE    ?= terraform.bootstrap.tfstate

# Required for first bootstrap apply.
ORGANIZATION_ID ?=
BILLING_ACCOUNT_ID ?=

# --- Core targets ---

.PHONY: init plan apply output fmt validate clean help

init: ## Initialize bootstrap with local state
	terraform init \
		-reconfigure \
		-backend-config="path=$(LOCAL_STATE)"

plan: init ## Plan projects and canonical state bucket
	terraform plan \
		-var="gcp_project_id=$(GCP_PROJECT_ID)" \
		-var="gcp_region=$(GCP_REGION)" \
		-var="state_bucket_name=$(STATE_BUCKET)" \
		-var="organization_id=$(ORGANIZATION_ID)" \
		-var="billing_account_id=$(BILLING_ACCOUNT_ID)"

apply: init ## Create projects and canonical state bucket
	terraform apply \
		-var="gcp_project_id=$(GCP_PROJECT_ID)" \
		-var="gcp_region=$(GCP_REGION)" \
		-var="state_bucket_name=$(STATE_BUCKET)" \
		-var="organization_id=$(ORGANIZATION_ID)" \
		-var="billing_account_id=$(BILLING_ACCOUNT_ID)"

output: ## Show bootstrap outputs
	terraform output

fmt: ## Format Terraform files
	terraform fmt -recursive .

validate: ## Validate bootstrap configuration
	terraform validate

clean: ## Remove local Terraform caches
	rm -rf .terraform .terraform.lock.hcl

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

.DEFAULT_GOAL := help
