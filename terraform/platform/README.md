# Terraform Platform

Shared GCP resources.

This root owns resources that are not tied to a runtime environment:

- Shared Artifact Registry repositories
- Cross-project IAM grants that let runtime projects read shared artifacts
- Artifact Registry writer grants for CI service accounts
- Optional Artifact Registry writer grants for local deployers
- Service account used by Terraform to manage Google Workspace users and groups

Initialize and apply:

```sh
make init
make plan
make apply
```

State is stored in `justtellme-platform-terraform-state` with prefix `platform`.

## Google Workspace Terraform access

Set `workspace_terraform_token_creator_members` to the users or CI service
accounts allowed to mint short-lived tokens for the Workspace Terraform service
account.

After applying this root, authorize the `workspace_terraform_oauth_client_id`
output in Google Admin Console for domain-wide delegation with these OAuth
scopes:

```text
https://www.googleapis.com/auth/admin.directory.user,
https://www.googleapis.com/auth/admin.directory.group,
https://www.googleapis.com/auth/admin.directory.group.member
```

Do not create a service account key. Use short-lived tokens minted with service
account impersonation instead.
