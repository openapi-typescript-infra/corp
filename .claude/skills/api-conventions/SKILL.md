---
name: api-conventions
description: API design conventions for OpenAPI specs and handlers. Use when adding or reviewing endpoints, designing request/response schemas, or naming parameters.
---

# API Design Conventions

Follow these conventions when designing new endpoints, modifying OpenAPI specs, or writing handlers.

## Naming

- **All parameter names, query params, and body fields**: `snake_case`. No exceptions.
- **Timestamps**: use `_at` suffix (e.g. `created_at`, `updated_at`, `begins_at`, `ends_at`, `event_at`).
- **OpenAPI schemas**: `PascalCase.yaml` (e.g. `Individual.yaml`, `Transaction.yaml`).
- **OpenAPI enums**: `PascalCase.yaml`, plural for value sets (e.g. `IdentifierNamespaces.yaml`).
- **Path files**: `{resource}.{param}.yaml` where dots map to path segments.
- **Operation IDs**: `camelCase` verbs — `getIndividuals`, `createGroup`, `searchAddresses`.

## Paths and Pluralization

- Collection endpoints use **plural nouns**: `/individuals`, `/transactions`, `/addresses`, `/groups`.
- Single-resource retrieval appends `/{id}`: `/transactions/{transaction_id}`.
- Complex search endpoints use `.search` suffix: `/individuals/search`, `/groups/search`.
- Hierarchical identifiers use nested path params: `/individuals/{namespace}/{identifier}`.
- Utility/singleton endpoints may use singular nouns when not representing a collection (e.g. `/authentication`).

## HTTP Methods

- **GET**: Simple retrieval and queries expressible as scalar query params.
- **POST**: Creation and complex searches with structured request bodies. When a search needs structured input (arrays of objects, nested filters), use `POST /resource/search`.
- **PATCH**: Partial updates to existing resources.

## IDs

- **Internal**: Full UUIDs (v4). Used in database and inter-service communication.
- **External**: Prefixed short IDs via `@justtellme/external-id` (e.g. `tx_KJz9q1nM4`, `i_abc123`). The prefix registry lives in `packages/infra/external-id/src/registry.ts`.
- Path parameters for resource IDs use descriptive names: `{transaction_id}`, `{address_id}`, not just `{id}`.

## Request Bodies

- Bulk creation wraps items in a named array property:
  ```yaml
  { "addresses": [{ ... }] }
  { "transfers": [{ ... }] }
  ```
- Search requests use structured objects:
  ```yaml
  { "identifiers": [{ "identifier": "...", "namespace": "..." }] }
  ```
- Include `idempotency_id` for operations that must be safely retryable (e.g. transactions).

## Response Bodies

- **Collection responses** always wrap results in a named object property — never return a bare array:
  ```yaml
  { "individuals": [...] }
  { "addresses": [...] }
  ```
- **Single-resource responses** return the object directly (e.g. `{ "individual_uuid": "...", ... }`).
- **Search responses** may include a `matches` map alongside the results array.

## Pagination

- Query parameters: `page` (1-indexed) and `page_size`.
- Sensible defaults: `page_size` defaults to 25-50, max 100.

## Error Responses

- All error status codes (400, 404, 409, etc.) should include a response body schema.
- Use the shared `Error.yaml` schema (`$ref: ../../common/Error.yaml`) for standard errors.
- 409 Conflict may return domain-specific fields (e.g. `conflicting_individual_uuid`) to help callers resolve the conflict.

## Field Selection

Endpoints that return large composite objects support field selection via query params:
- `fields`: Core scalar fields to include (e.g. `birthdate,biological_sex`).
- `profiles`, `address_types`, `consents`, `identifier_namespaces`, `tags`, `groups`: Filter which related data to include.

## Bulk Query Limits

- Array query parameters and request body arrays should declare `maxItems` (typically 100).
