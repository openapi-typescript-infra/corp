# Terraform

Terraform is split into four roots:

- `bootstrap/` - one-time local-state root that creates GCP projects and the canonical GCS state bucket
- `platform/` - shared GCP resources such as Artifact Registry and cross-project IAM
- `infra/` - application runtime infrastructure for development and production
- `corp/` - Google Workspace users and groups for the organization

Shared Terraform state lives in the platform GCP project.

Run order for a new setup:

```sh
cd terraform/bootstrap
make apply ORGANIZATION_ID=<org-id> BILLING_ACCOUNT_ID=<billing-account-id>

cd ../platform
make init
make plan

cd ../infra
make dev-init
make dev-plan
```

After bootstrap, all remote-state roots use the same state bucket with separate prefixes:

```text
justtellme-platform-terraform-state
```

| Root | Prefix |
|---|---|
| `platform` | `platform` |
| `infra` development | `infra/development` |
| `infra` production | `infra/production` |
| `corp` | `corp` |
