# --- Configuration ---

ENV            ?= development
GCP_PROJECT_ID ?= justtellme-dev
GCP_REGION     ?= us-central1
GCLOUD         ?= gcloud
SUSPENDED      ?= false

TF_DIR         := .
BOOTSTRAP_DIR  := ./bootstrap
ENVS_DIR       := ./envs
STATE_BUCKET   := $(GCP_PROJECT_ID)-terraform-state
BOOTSTRAP_STATE := terraform.$(GCP_PROJECT_ID).tfstate
TFVARS         := $(ENVS_DIR)/$(ENV).tfvars
CLOUDFLARE_API_TOKEN_SECRET ?= cloudflare_api_token

# --- Validation ---

VALID_ENVS := development production

define check_env
	@if ! echo "$(VALID_ENVS)" | grep -qw "$(ENV)"; then \
		echo "Error: ENV must be one of: $(VALID_ENVS) (got '$(ENV)')"; \
		exit 1; \
	fi
	@if [ ! -f "$(TFVARS)" ]; then \
		echo "Error: $(TFVARS) not found"; \
		exit 1; \
	fi
endef

define terraform_with_cloudflare_token
	cd $(TF_DIR) && \
	if [ -z "$$TF_VAR_cloudflare_api_token" ]; then \
		echo "Loading Cloudflare API token from Secret Manager secret $(CLOUDFLARE_API_TOKEN_SECRET) in $(GCP_PROJECT_ID)"; \
		cloudflare_api_token="$$( $(GCLOUD) secrets versions access latest --secret="$(CLOUDFLARE_API_TOKEN_SECRET)" --project="$(GCP_PROJECT_ID)" )" || exit 1; \
		export TF_VAR_cloudflare_api_token="$$cloudflare_api_token"; \
	fi; \
	terraform $(1) \
		-var-file="$(TFVARS)" \
		-var="suspended=$(SUSPENDED)"
endef

# --- Core targets ---

.PHONY: init plan apply destroy refresh output console fmt validate clean help

init: ## Initialize Terraform for ENV (downloads providers, configures backend)
	$(check_env)
	cd $(TF_DIR) && terraform init \
		-backend-config="bucket=$(STATE_BUCKET)" \
		-backend-config="prefix=$(ENV)"

init-upgrade: ## Re-initialize and upgrade provider versions
	$(check_env)
	cd $(TF_DIR) && terraform init \
		-backend-config="bucket=$(STATE_BUCKET)" \
		-backend-config="prefix=$(ENV)" \
		-upgrade

plan: ## Show execution plan for ENV
	$(check_env)
	$(call terraform_with_cloudflare_token,plan)

apply: ## Apply changes for ENV (requires confirmation)
	$(check_env)
	$(call terraform_with_cloudflare_token,apply)

destroy: ## Destroy all resources for ENV (requires confirmation)
	$(check_env)
	$(call terraform_with_cloudflare_token,destroy)

refresh: ## Refresh state for ENV without modifying resources
	$(check_env)
	$(call terraform_with_cloudflare_token,apply -refresh-only)

output: ## Show outputs for ENV
	$(check_env)
	cd $(TF_DIR) && terraform output

console: ## Open Terraform console for ENV
	$(check_env)
	$(call terraform_with_cloudflare_token,console)

# --- Formatting & validation ---

fmt: ## Format all Terraform files
	terraform fmt -recursive $(TF_DIR)

fmt-check: ## Check formatting without modifying files
	terraform fmt -check -recursive $(TF_DIR)

validate: ## Validate configuration (requires init)
	cd $(TF_DIR) && terraform validate

lint: fmt-check validate ## Run all checks (format + validate)

# --- Bootstrap (one-time state bucket setup) ---

.PHONY: bootstrap-init bootstrap-plan bootstrap-apply

bootstrap-init: ## Initialize the bootstrap directory (local state)
	cd $(BOOTSTRAP_DIR) && terraform init \
		-reconfigure \
		-backend-config="path=$(BOOTSTRAP_STATE)"

bootstrap-plan: ## Plan the state bucket creation
	@$(MAKE) bootstrap-init GCP_PROJECT_ID=$(GCP_PROJECT_ID) GCP_REGION=$(GCP_REGION)
	cd $(BOOTSTRAP_DIR) && terraform plan \
		-var="gcp_project_id=$(GCP_PROJECT_ID)" \
		-var="gcp_region=$(GCP_REGION)"

bootstrap-apply: ## Create the GCS state bucket
	@$(MAKE) bootstrap-init GCP_PROJECT_ID=$(GCP_PROJECT_ID) GCP_REGION=$(GCP_REGION)
	cd $(BOOTSTRAP_DIR) && terraform apply \
		-var="gcp_project_id=$(GCP_PROJECT_ID)" \
		-var="gcp_region=$(GCP_REGION)"

# --- Environment shortcuts ---

.PHONY: dev-init dev-plan dev-apply dev-suspend-plan dev-suspend-apply dev-resume-plan dev-resume-apply
.PHONY: prod-init prod-plan prod-apply

dev-init:     ; @$(MAKE) init  ENV=development
dev-plan:     ; @$(MAKE) plan  ENV=development
dev-apply:    ; @$(MAKE) apply ENV=development
dev-suspend-plan:  ; @$(MAKE) plan  ENV=development SUSPENDED=true
dev-suspend-apply: ; @$(MAKE) apply ENV=development SUSPENDED=true
dev-resume-plan:   ; @$(MAKE) plan  ENV=development SUSPENDED=false
dev-resume-apply:  ; @$(MAKE) apply ENV=development SUSPENDED=false

prod-init:    ; @$(MAKE) init  ENV=production
prod-plan:    ; @$(MAKE) plan  ENV=production
prod-apply:   ; @$(MAKE) apply ENV=production

# --- Utility ---

clean: ## Remove local Terraform caches (does not affect remote state)
	rm -rf $(TF_DIR)/.terraform $(TF_DIR)/.terraform.lock.hcl
	rm -rf $(BOOTSTRAP_DIR)/.terraform $(BOOTSTRAP_DIR)/.terraform.lock.hcl

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

.DEFAULT_GOAL := help
