# redis chart

Single-replica Redis StatefulSet for in-cluster session storage in dev/staging.
Production should use Memorystore and keep the Service name identical (`redis`)
so services only need a host change.

## Apply

```sh
helm upgrade --install redis \
  -n app \
  helm/charts/redis
```
