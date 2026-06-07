# terraform-corp

Terraform configuration for managing Google Workspace users and groups. Users and groups are defined as YAML files and applied via CI on merge to `main`.

## Structure

- `users/` - One YAML file per user (e.g. `jane-doe.yaml`)
- `groups/` - One YAML file per group with membership lists
- `.github/workflows/terraform-corp.yml` (repo root) - Manual workflow for plan + apply

## User YAML format

```yaml
email: jane.doe@example.com
given_name: "Jane"
family_name: "Doe"
```

The `status` field controls account state:

| `status` value | Effect |
|---|---|
| *(omitted)* | Active account |
| `suspended` | Account is suspended |
| `archived` | Account is archived and suspended |

Example suspended user:

```yaml
email: jane.doe@example.com
given_name: "Jane"
family_name: "Doe"
status: suspended
```

## Group YAML format

```yaml
email: team-engineering@example.com
name: "Team: Engineering"
description: Engineering team members

members:
  - email: jane.doe@example.com
  - email: john.smith@example.com
    role: OWNER
```

Supported member roles: `MEMBER` (default), `OWNER`, `MANAGER`.
Supported member types: `USER` (default), `GROUP`.

## Importing an existing user

1. Create the YAML file in `users/`:

   ```yaml
   # users/jane-doe.yaml
   email: jane.doe@example.com
   given_name: "Jane"
   family_name: "Doe"
   ```

   If the user is suspended or archived, add the appropriate `status` field.

2. Import the existing user into Terraform state:

   ```bash
   terraform import 'googleworkspace_user.users["jane-doe"]' jane.doe@example.com
   ```

   The key in quotes must match the YAML filename (without `.yaml`).

3. Run a plan to verify no unexpected changes:

   ```bash
   terraform plan
   ```

4. Commit and open a PR. The CI workflow will post the plan output for review.

## Setup

1. Bootstrap the canonical Terraform state bucket from `terraform/bootstrap` if it does not already exist:

   ```bash
   cd ../bootstrap
   make apply ORGANIZATION_ID=<org-id> BILLING_ACCOUNT_ID=<billing-account-id>
   ```

2. Apply `terraform/platform` and authorize its
   `workspace_terraform_oauth_client_id` output for domain-wide delegation in
   Google Admin Console.
3. Set `terraform.tfvars` with your workspace customer ID, admin email, and domain.
4. Mint a short-lived token for the Workspace Terraform service account:

   ```bash
   export TF_VAR_googleworkspace_access_token="$(
     gcloud auth print-access-token \
       --impersonate-service-account=workspace-terraform@justtellme-platform.iam.gserviceaccount.com \
       --scopes='https://www.googleapis.com/auth/cloud-platform'
   )"
   ```

5. Run `make init` to initialize the backend.
