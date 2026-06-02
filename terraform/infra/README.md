# Terraform Infrastructure (GCP)

This directory manages all cloud infrastructure for Just Tell Me using Terraform.

It is designed to:

- Run **development and production on GCP**
- Keep infrastructure declarative from day one
- Support both cloud dev cluster and local machine development from the same codebase

---

## Architecture Overview

### Environments

| Environment | Compute | Control Plane |
| ----------- | ------- | ------------- |
| development | GKE (e2-medium, 1 node) | GCP |
| production  | GKE (e2-standard-4, 3 nodes) | GCP |

Both environments run the same stack on GCP. Local machine development runs services locally (Docker Compose, etc.) without Terraform involvement — only the cloud state bucket and GCP services are used from a developer's machine.

---

## Database Strategy

- PostgreSQL is the default database.
- Both environments use Cloud SQL for PostgreSQL.
- Development uses a smaller instance tier (`db-f1-micro`).

The template supports:

- Multiple logical databases on a single Postgres instance
- Multiple Postgres instances if separation or scaling requires it

Database topology can evolve without restructuring the project.

---

## Terraform State & Secrets

- Terraform remote state is stored in Google Cloud Storage.
- Secrets are stored in Google Secret Manager.
- Local development uses Application Default Credentials (ADC) to access GCP services.

This avoids:

- Secret emulation
- Local state drift
- Vault-style overhead

---

## Bootstrap Secrets

Some provider credentials must exist before Terraform can plan the full stack.

For Cloudflare, create a scoped API token for the application's Cloudflare zone and store it manually in each GCP project as a Secret Manager secret named `cloudflare_api_token`.

The token must be scoped to the application's zone and needs these zone permissions:

- `Zone:Read`
- `DNS:Edit`
- `Zone Settings:Edit`
- `Rulesets:Edit`

The Makefile loads this secret from the project implied by the environment shortcut before Terraform commands that need the Cloudflare provider:

```sh
make dev-plan
make prod-plan
```

By default the project IDs are derived as `$(GCP_PROJECT_PREFIX)-dev` and `$(GCP_PROJECT_PREFIX)-prod`. Override `GCP_PROJECT_PREFIX` in the Makefile for a new repo.

If `TF_VAR_cloudflare_api_token` is already set, the Makefile uses that value instead of reading Secret Manager.

---

## Suspend Development

Development can be put into a lower-cost idle mode without destroying Terraform-managed resources.

Suspended mode:

- Scales the GKE development node pool to `0` nodes.
- Sets Cloud SQL activation policy to `NEVER`, stopping database compute.
- Keeps Terraform state, Secret Manager secrets, Artifact Registry repositories, VPC resources, Cloudflare DNS records, and other metadata resources in place.

Plan and apply suspend mode:

```sh
make dev-suspend-plan
make dev-suspend-apply
```

Resume development:

```sh
make dev-resume-plan
make dev-resume-apply
```

Resume targets first wake any Cloud SQL instances whose names begin with the environment prefix, then run Terraform. This avoids Terraform failing while refreshing database users on a stopped instance.

This is not true zero cost: storage, retained IP/gateway resources, registry contents, backups, and other non-compute resources may still bill. Use `destroy` only when the environment can be fully recreated.

---

## Application Assumptions

This template assumes:

- REST services (typically OpenAPI-based)
- TypeScript services (convention, not requirement)
- Containerized workloads

---

## Design Principles

1. **Real cloud control plane from day one.**
   IAM, secrets, messaging, and state should be real — not simulated.

2. **Two terraform environments.**
   `development` is the cloud dev cluster; `production` is production. Local machine development does not require Terraform.

3. **Environment parity without overengineering.**
   Development and production share the same module structure, differentiated only by resource sizing in tfvars.

4. **Spin up from zero.**
   New environments should be creatable declaratively via Terraform.

---

This setup is intentionally opinionated but minimal. It is designed to accelerate early-stage teams while preserving a clean path to scale.
