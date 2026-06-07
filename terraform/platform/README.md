# Terraform Platform

Shared GCP resources.

This root owns resources that are not tied to a runtime environment:

- Shared Artifact Registry repositories
- Cross-project IAM grants that let runtime projects read shared artifacts
- Artifact Registry writer grants for CI service accounts

Initialize and apply:

```sh
make init
make plan
make apply
```

State is stored in `justtellme-platform-terraform-state` with prefix `platform`.
