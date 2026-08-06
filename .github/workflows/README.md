# Deploy workflows

## Service deploys

`deploy.yml` handles every chart-bearing service under `services/<name>/`.
It is manual-only and disabled unless the repository variable `DEPLOYS_ENABLED` is set to `true`. When enabled, it:

1. Computes the affected services with
   `turbo ls --affected --filter='./services/*'`.
2. Forces a full deploy when global build/deploy inputs change, including
   `helm/charts/base-service/**`, `docker/service.Dockerfile`, root package
   metadata, or the deploy workflows.
3. Fans out through `build-and-deploy-service.yml`, one service per matrix
   job.

All deploy jobs run on `self-hosted` runners. With `DEPLOYS_ENABLED` unset, the workflow is inert and does not attempt GCP authentication.

Manual deploys once enabled:

```sh
gh workflow run deploy --ref main -f services=consumer-web
gh workflow run deploy --ref main -f force_all=true
```

## Onboarding a New Service

1. Add `services/<name>/ops/<name>/{Chart.yaml,values.yaml}` depending on
   `helm/charts/base-service`.
2. Add the service Terraform module in `terraform/infra/main.tf` so it gets
   its Kubernetes and GCP service accounts.
3. If it should be excluded from automatic deploys, add
   `services/<name>/ops/.deploy-disabled`.

## Required State

- Repository var `DEPLOYS_ENABLED=true` to turn this on. Leave it unset while there is no GCP environment.
- Repository vars: `GCP_PROJECT_ID` and `GCP_PROJECT_NUMBER`.
- `terraform/infra` applied so `github-actions-ci` can authenticate through
  Workload Identity, push images, and deploy to GKE.
- Database services expect the Kubernetes secret named
  `<database gcpId>-db-credentials` to already exist in the target namespace.
  Helm migrations read that secret directly.
