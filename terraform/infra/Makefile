# --- Configuration ---

ENV            ?= development
GCP_PROJECT_PREFIX ?= justtellme
GCP_PROJECT_ID ?= $(GCP_PROJECT_PREFIX)-$(if $(filter production,$(ENV)),prod,dev)
PLATFORM_PROJECT_ID ?= $(GCP_PROJECT_PREFIX)-platform
GCP_REGION     ?= us-central1
GCLOUD         ?= gcloud
SUSPENDED      ?= false

TF_DIR         := .
BOOTSTRAP_DIR  := ../bootstrap
ENVS_DIR       := ./envs
STATE_BUCKET   := $(GCP_PROJECT_PREFIX)-platform-terraform-state
STATE_PREFIX   := infra/$(ENV)
BOOTSTRAP_STATE := terraform.bootstrap.tfstate
TFVARS         := $(ENVS_DIR)/$(ENV).tfvars
CLOUDFLARE_API_TOKEN_SECRET ?= cloudflare_api_token
STYTCH_WORKSPACE_KEY_ID_SECRET ?= stytch_workspace_key_id
STYTCH_WORKSPACE_KEY_SECRET ?= stytch_workspace_key_secret
SQL_INSTANCE_PREFIX ?= $(ENV)-

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

define terraform_with_provider_credentials
	cd $(TF_DIR) && \
	if [ -z "$$TF_VAR_cloudflare_api_token" ]; then \
		echo "Loading Cloudflare API token from Secret Manager secret $(CLOUDFLARE_API_TOKEN_SECRET) in $(GCP_PROJECT_ID)"; \
		cloudflare_api_token="$$( $(GCLOUD) secrets versions access latest --secret="$(CLOUDFLARE_API_TOKEN_SECRET)" --project="$(GCP_PROJECT_ID)" )" || exit 1; \
		export TF_VAR_cloudflare_api_token="$$cloudflare_api_token"; \
	fi; \
	if [ -z "$$TF_VAR_stytch_workspace_key_id" ]; then \
		echo "Loading Stytch workspace key ID from Secret Manager secret $(STYTCH_WORKSPACE_KEY_ID_SECRET) in $(GCP_PROJECT_ID)"; \
		stytch_workspace_key_id="$$( $(GCLOUD) secrets versions access latest --secret="$(STYTCH_WORKSPACE_KEY_ID_SECRET)" --project="$(GCP_PROJECT_ID)" )" || exit 1; \
		export TF_VAR_stytch_workspace_key_id="$$stytch_workspace_key_id"; \
	fi; \
	if [ -z "$$TF_VAR_stytch_workspace_key_secret" ]; then \
		echo "Loading Stytch workspace key secret from Secret Manager secret $(STYTCH_WORKSPACE_KEY_SECRET) in $(GCP_PROJECT_ID)"; \
		stytch_workspace_key_secret="$$( $(GCLOUD) secrets versions access latest --secret="$(STYTCH_WORKSPACE_KEY_SECRET)" --project="$(GCP_PROJECT_ID)" )" || exit 1; \
		export TF_VAR_stytch_workspace_key_secret="$$stytch_workspace_key_secret"; \
	fi; \
	terraform $(1) \
		-var-file="$(TFVARS)" \
		-var="suspended=$(SUSPENDED)"
endef

# --- Core targets ---

.PHONY: init init-upgrade plan apply destroy refresh resume-cloudsql output console fmt validate clean help

init: ## Initialize Terraform for ENV (downloads providers, configures backend)
	$(check_env)
	cd $(TF_DIR) && terraform init -reconfigure \
		-backend-config="bucket=$(STATE_BUCKET)" \
		-backend-config="prefix=$(STATE_PREFIX)"

init-upgrade: ## Re-initialize and upgrade provider versions
	$(check_env)
	cd $(TF_DIR) && terraform init -reconfigure \
		-backend-config="bucket=$(STATE_BUCKET)" \
		-backend-config="prefix=$(STATE_PREFIX)" \
		-upgrade

plan: ## Show execution plan for ENV
	$(check_env)
	$(call terraform_with_provider_credentials,plan)

apply: ## Apply changes for ENV (requires confirmation)
	$(check_env)
	$(call terraform_with_provider_credentials,apply)

destroy: ## Destroy all resources for ENV (requires confirmation)
	$(check_env)
	$(call terraform_with_provider_credentials,destroy)

refresh: ## Refresh state for ENV without modifying resources
	$(check_env)
	$(call terraform_with_provider_credentials,apply -refresh-only)

resume-cloudsql: ## Wake Cloud SQL instances before Terraform refreshes users/databases
	$(check_env)
	@instances="$$( $(GCLOUD) sql instances list --project="$(GCP_PROJECT_ID)" --filter="name~^$(SQL_INSTANCE_PREFIX)" --format="value(name)" )"; \
	if [ -z "$$instances" ]; then \
		echo "No Cloud SQL instances found in $(GCP_PROJECT_ID) matching prefix $(SQL_INSTANCE_PREFIX)"; \
	else \
		for instance in $$instances; do \
			state="$$( $(GCLOUD) sql instances describe "$$instance" --project="$(GCP_PROJECT_ID)" --format="value(state)" )"; \
			activation_policy="$$( $(GCLOUD) sql instances describe "$$instance" --project="$(GCP_PROJECT_ID)" --format="value(settings.activationPolicy)" )"; \
			if [ "$$state" = "RUNNABLE" ] && [ "$$activation_policy" = "ALWAYS" ]; then \
				echo "Cloud SQL instance $$instance is already RUNNABLE with activation policy ALWAYS"; \
				continue; \
			fi; \
			echo "Setting Cloud SQL instance $$instance activation policy to ALWAYS"; \
			$(GCLOUD) sql instances patch "$$instance" --project="$(GCP_PROJECT_ID)" --activation-policy=ALWAYS --async --quiet --format="value(name)" >/dev/null || exit 1; \
			attempts=0; \
			while [ "$$attempts" -lt 60 ]; do \
				state="$$( $(GCLOUD) sql instances describe "$$instance" --project="$(GCP_PROJECT_ID)" --format="value(state)" )"; \
				activation_policy="$$( $(GCLOUD) sql instances describe "$$instance" --project="$(GCP_PROJECT_ID)" --format="value(settings.activationPolicy)" )"; \
				if [ "$$state" = "RUNNABLE" ] && [ "$$activation_policy" = "ALWAYS" ]; then \
					echo "Cloud SQL instance $$instance is RUNNABLE"; \
					break; \
				fi; \
				echo "Waiting for $$instance to become RUNNABLE (state=$$state, activationPolicy=$$activation_policy)"; \
				attempts=$$((attempts + 1)); \
				sleep 10; \
			done; \
			if [ "$$attempts" -ge 60 ]; then \
				echo "Timed out waiting for Cloud SQL instance $$instance to become RUNNABLE"; \
				exit 1; \
			fi; \
		done; \
	fi

output: ## Show outputs for ENV
	$(check_env)
	cd $(TF_DIR) && terraform output

console: ## Open Terraform console for ENV
	$(check_env)
	$(call terraform_with_provider_credentials,console)

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
	@$(MAKE) bootstrap-init GCP_PROJECT_ID=$(PLATFORM_PROJECT_ID) GCP_REGION=$(GCP_REGION)
	cd $(BOOTSTRAP_DIR) && terraform plan \
		-var="gcp_project_id=$(PLATFORM_PROJECT_ID)" \
		-var="gcp_region=$(GCP_REGION)" \
		-var="state_bucket_name=$(STATE_BUCKET)"

bootstrap-apply: ## Create the GCS state bucket
	@$(MAKE) bootstrap-init GCP_PROJECT_ID=$(PLATFORM_PROJECT_ID) GCP_REGION=$(GCP_REGION)
	cd $(BOOTSTRAP_DIR) && terraform apply \
		-var="gcp_project_id=$(PLATFORM_PROJECT_ID)" \
		-var="gcp_region=$(GCP_REGION)" \
		-var="state_bucket_name=$(STATE_BUCKET)"

# --- Environment shortcuts ---

.PHONY: dev-init dev-plan dev-apply dev-suspend-plan dev-suspend-apply dev-resume-plan dev-resume-apply
.PHONY: dev-bootstrap-plan dev-bootstrap-apply
.PHONY: prod-init prod-plan prod-apply prod-bootstrap-plan prod-bootstrap-apply

dev-init:     ; @$(MAKE) init  ENV=development
dev-plan:     ; @$(MAKE) plan  ENV=development
dev-apply:    ; @$(MAKE) apply ENV=development
dev-bootstrap-plan:  ; @$(MAKE) bootstrap-plan  ENV=development
dev-bootstrap-apply: ; @$(MAKE) bootstrap-apply ENV=development
dev-suspend-plan:  ; @$(MAKE) plan  ENV=development SUSPENDED=true
dev-suspend-apply: ; @$(MAKE) apply ENV=development SUSPENDED=true
dev-resume-plan:
	@$(MAKE) resume-cloudsql ENV=development
	@$(MAKE) plan ENV=development SUSPENDED=false
dev-resume-apply:
	@$(MAKE) resume-cloudsql ENV=development
	@$(MAKE) apply ENV=development SUSPENDED=false

prod-init:    ; @$(MAKE) init  ENV=production
prod-plan:    ; @$(MAKE) plan  ENV=production
prod-apply:   ; @$(MAKE) apply ENV=production
prod-bootstrap-plan:  ; @$(MAKE) bootstrap-plan  ENV=production
prod-bootstrap-apply: ; @$(MAKE) bootstrap-apply ENV=production

# --- Utility ---

clean: ## Remove local Terraform caches (does not affect remote state)
	rm -rf $(TF_DIR)/.terraform $(TF_DIR)/.terraform.lock.hcl
	rm -rf $(BOOTSTRAP_DIR)/.terraform $(BOOTSTRAP_DIR)/.terraform.lock.hcl

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

.DEFAULT_GOAL := help
