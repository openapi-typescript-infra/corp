# api

A central location for all API declarations (OpenAI 3) for Just Tell Me.

Each service is in a directory named after the service, and the build infrastructure will deposit the bundled OpenAPI spec AND a Typescript client. The spec will be used by the services to bind to handlers and essentially serve the API. The "datasources" object on the Express app will expose openapi-fetch clients based on the paths roughly like so:

```
import { paths as IdentityInternal } from '@justtellme/api/identity-internal';

...
  identityInternal: createClient<IdentityInternal>()
...
```

## API Conventions

### Naming

| Kind | Convention | Example |
|------|------------|---------|
| Service directory | `kebab-case` | `identity-internal` |
| Root spec file | `{service-name}.yaml` (must match directory) | `identity-internal/identity-internal.yaml` |
| Path files | `{resource}.{param1}.{param2}.yaml` — dots map to path segments | `individuals.namespace.identifier.yaml` → `/identity/individuals/{namespace}/{identifier}` |
| Params | `lowercase.yaml` | `namespace.yaml`, `identifier.yaml` |
| Schemas | `PascalCase.yaml` | `Individual.yaml` |
| Enums | `PascalCase.yaml` (plural for value sets) | `IdentifierNamespaces.yaml` |

### Structure

Each service directory follows this layout:

```
{service-name}/
├── {service-name}.yaml     # Root spec; paths key references ./paths/*.yaml
├── paths/
│   └── {resource}.{param}.yaml
├── params/
│   └── {param-name}.yaml
├── schemas/
│   └── {ModelName}.yaml
└── enums/
    └── {EnumName}.yaml
```

- **paths/**: One file per path; name mirrors the URL (resource and path params). Root spec uses `$ref: paths/...` with the path key.
- **params/**: Reusable OpenAPI parameter definitions. Reference via `$ref: ../params/{name}.yaml`.
- **schemas/**: Request/response models. Reference via `$ref: ../schemas/{Name}.yaml`.
- **enums/**: Shared enum schemas (e.g. for path/query params). Reference via `$ref: ../enums/{Name}.yaml`.

### References

Use relative `$ref` paths from the referencing file (e.g. `../params/`, `../schemas/`, `../enums/`).
