# @justtellme/service

A base ExpressJS service for hosting APIs, web sites and other Typescript based workloads. This package a Just Tell Me-specific configuration layer on top of an open source project (also written by us) called [@openapi-typescript-infra/service](https://github.com/openapi-typescript-infra/service). See that project for more documentation and discussion of the broad approach. The JTM specific layer is meant to add a few more things:

1. Generation of deployable assets for our development and production Kubernetes clusters via helm charts
2. Integration with our common CI/CD github-actions infrastructure
3. Wiring to other services in a consistent way
4. Development settings for TLS and in the future for customized network routing

## Deployment

See the [Helm chart](/just-tell-me/helm-charts/README.md) reference for more details on configuring your deployments.

Before full GitHub Actions CI/CD is available, services can be deployed from a local machine with the shared Makefile:

```sh
cd services/consumer-web
make deploy-dev
```

The local deploy target mirrors the CI/CD flow:

1. Builds the target service and its workspace dependencies with Turbo.
2. Builds a `linux/amd64` Docker image with an immutable tag like `dev-20260601-161444`.
3. Pushes the image to Artifact Registry.
4. Fetches GKE credentials.
5. Runs `helm upgrade --install` for `ops/<service>`.
6. Waits for the Deployment rollout.

Useful overrides:

```sh
make deploy-dev DEPLOY_TAG=dev-my-test
make deploy-dev GCP_PROJECT=justtellme-dev GKE_CLUSTER=development-cluster K8S_NAMESPACE=app
make deploy-prod GCP_PROJECT=justtellme-prod GKE_CLUSTER=production-cluster
```
