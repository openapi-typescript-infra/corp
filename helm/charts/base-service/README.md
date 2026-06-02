# helm chart

The helm chart in base-service is suitable as a base chart for a typical Typescript service. To use it, either use [@justtellme/create](../../../packages/infra/create) or create the following files:

- ops/your-service/Chart.yaml

```yaml
apiVersion: v2
name: your-service
description: A Helm chart for Kubernetes
type: application
version: 0.1.0

appVersion: "1.0.0"

dependencies:
  - name: base-service
    version: "0.1.0"
    repository: oci://us-docker.pkg.dev/justtellme-dev/helm-charts
```

- ops/your-service/values.yaml

```yaml
base-service:
  name: your-service
```

CI/CD will automatically add the variable "base-service.environment" as "dev" or "prod" (currently) which controls various settings in the generated manifests.

The manifests are applied by running `helm template` and applied to GKE. You can define `values.development.yaml` and/or `values.production.yaml` and they will be overlayed as necessary.

## Variables

| Variable     | Default      | Used In             | Comment                                                                        |
| ------------ | ------------ | ------------------- | ------------------------------------------------------------------------------ |
| name         | **required** | deployment, service | The full name of your service, such as identity-internal                       |
| tag          | **required** | deployment          | The tag for the docker image for the main container. Managed by github actions |
| changeCause  | none         | deployment          | The reason for the current deployment (filled out by github actions)           |
| replicaCount | 1            | deployment          | The number of replicas                                                         |
| gcp | none | deployment | A map with details about the gcp environment |
| gcp.project | **required** | deployment | The name of the Google Cloud Project, either justtellme-dev or justtellme-prod. Managed by github-actions |
| gcp.env | none | unused | development or production. Managed by github actions |
| gcp.region | us-central1 | deployment | The region in which the service is running. Managed by github actions |
| database | none | deployment | Details about the database being used, if any (this is a map). |
| database.region | us-central1 | deployment | The region in which the database is running |
| database.gcpId | **required** | deployment | The Cloud SQL instance suffix such as main (which becomes development-pg-main in development and production-pg-main in production). Only required if you have a database |
| database.instance | derived from database.gcpId | deployment, db-migration | Optional Cloud SQL instance name override when the Terraform resource name does not follow the standard environment-pg-id convention |
| database.username | svc@env.iam | deployment | Usually don't need to override |
| database.migrate | true | db-migration | Whether to automatically run database migration on deploys |
| resources | [variables](base-service/values.yaml) | deployment | cpu and memory requests and limits |
| monitoring.enabled | true | PodMonitoring | Enables google monitoring of the deployment |
| mappings | none | mappings | Maps API endpoints to service endpoints |
