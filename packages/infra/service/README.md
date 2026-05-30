# @justtellme/service

A base ExpressJS service for hosting APIs, web sites and other Typescript based workloads. This package a Just Tell Me-specific configuration layer on top of an open source project (also written by us) called [@openapi-typescript-infra/service](https://github.com/openapi-typescript-infra/service). See that project for more documentation and discussion of the broad approach. The JTM specific layer is meant to add a few more things:

1. Generation of deployable assets for our development and production Kubernetes clusters via helm charts
2. Integration with our common CI/CD github-actions infrastructure
3. Wiring to other services in a consistent way
4. Development settings for TLS and in the future for customized network routing

## Deployment

See the [Helm chart](/just-tell-me/helm-charts/README.md) reference for more details on configuring your deployments.
