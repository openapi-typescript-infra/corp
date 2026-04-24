---
name: create-service
description: Scaffold a new TypeScript backend service in the monorepo. Use when the user wants to create a new API service under services/. May need database (use add-database skill), Redis, or authentication.
---

# Create a TypeScript Service

This skill scaffolds a new backend service under `services/<name>/`. Services are Express-based, use OpenAPI specs for type-safe routes, and are deployed as Docker containers to Kubernetes.

Ask the user for:
1. **Service name** (e.g. `billing-internal`, `notification-internal`)
2. **Description** (one-line)
3. **Does it need auth?** — i.e., does it handle user-facing authentication (Stytch, sessions), or is it an internal service called by other services behind Envoy?
4. **Does it need a database?** — if yes, invoke the `/add-database` skill after scaffolding
5. **Does it call other services?** — if yes, which ones (for datasources)

## Architecture Context

- **Internal services** (most common): use `@justtellme/service` (`useJTMService`). They sit behind Envoy and receive pre-authenticated requests via `x-auth-token` headers. No Stytch, no sessions.
- **Auth gateway services** (rare, like `authn-authz-internal`): use `@justtellme/service` BUT also depend on `@justtellme/web-auth` and `stytch` directly. They validate Stytch tokens and issue `x-auth-token` headers for downstream services. Config extends `HSAuthConfiguration` and `HSSessionConfiguration`.

## Directory Structure

```
services/<name>/
├── package.json
├── Makefile
├── .gitignore
├── config/
│   └── config.json
├── ops/<name>/
│   ├── Chart.yaml
│   └── values.yaml
└── src/
    ├── index.ts
    ├── types/
    │   ├── index.ts
    │   ├── service.ts
    │   ├── config.ts
    │   └── datasources.ts    # if calling other services
    ├── handlers/              # route handlers (created as endpoints are added)
    ├── lib/                   # business logic
    └── generated/
        └── service/
            └── index.ts       # auto-generated from OpenAPI spec
```

## package.json (Internal Service — No Auth)

```json
{
  "name": "@justtellme/<name>",
  "private": true,
  "version": "0.0.0",
  "description": "<description>",
  "main": "./src/index.ts",
  "exports": "./src/index.ts",
  "type": "module",
  "types": "src/index.ts",
  "imports": {
    "#src/*": "./src/*"
  },
  "scripts": {
    "test": "vitest",
    "build": "make",
    "watch": "nodemon",
    "clean": "make clean",
    "start": "start-service",
    "repl": "start-service --repl",
    "lint": "eslint .",
    "postinstall": "cpconfig"
  },
  "config": {
    "cpconfig": "@justtellme/cpconfig"
  },
  "engines": {
    "node": ">24.0.0"
  },
  "author": "Max Metral <max@pyralis.com>",
  "license": "UNLICENSED",
  "keywords": [
    "typescript",
    "openapi",
    "express"
  ],
  "devDependencies": {
    "@openapi-typescript-infra/service-tester": "^7.1.2",
    "@typescript/native-preview": "^7.0.0-dev.20260314.1",
    "cpconfig": "^1.4.4",
    "eslint": "^10.0.3",
    "prettier": "^3.8.1",
    "typescript": "^5.9.3",
    "vitest": "^4.1.0"
  },
  "dependencies": {
    "@justtellme/cpconfig": "workspace:^",
    "@justtellme/service": "workspace:^",
    "@openapi-typescript-infra/service": "^6.11.0"
  }
}
```

### Additional Dependencies for Auth Gateway Services

```json
{
  "dependencies": {
    "@justtellme/web-auth": "workspace:^",
    "stytch": "^13.1.0"
  }
}
```

## Makefile

```makefile
.PHONY: all build clean

all: service

export SERVICE_NAME ?= <name>

SERVICE_MAKEFILE := $(shell node --experimental-import-meta-resolve -e "console.log(new URL(import.meta.resolve('@justtellme/service/Makefile'), import.meta.url).pathname)")
include $(SERVICE_MAKEFILE)
```

If the service has a database, also add `dbi ts` to the `all` target and `DB_NAME` — see the `/add-database` skill.

## .gitignore

```
# Managed by cpconfig
/.commitlintrc.yaml
/eslint.config.mts
/tsconfig.json
/tsconfig.build.json
/.prettierrc.yaml
/vitest.config.ts

# Build
/dist
/*.tsbuildinfo

# Standard
node_modules
*.log
coverage
```

## src/index.ts (Internal Service)

```typescript
import { useJTMService } from '@justtellme/service';
import ApiSpec from '@justtellme/api/specs/<name>' with { type: 'json' };

import type { <PascalName>, <PascalName>Locals } from './types/index.ts';

export function service(): <PascalName>['Service'] {
  const base = useJTMService<<PascalName>Locals>();
  return {
    ...base,
    async start(app) {
      await base.start(app);
      Object.assign(app.locals, {
        // Add service-wide resources here (datasources, etc.)
      });
    },
    configure(startOptions, options) {
      if (!base.configure) {
        throw new Error('Service infrastructure is misconfigured - base.configure is missing');
      }
      const config = base.configure(startOptions, options);
      Object.assign(config, {
        openApiOptions: { ...config.openApiOptions, apiSpec: ApiSpec },
      });
      return config;
    },
    async stop(app) {
      await base.stop?.(app);
    },
  };
}
```

### Auth Gateway Variant

For an auth gateway service, the pattern is the same (`useJTMService`) but you additionally:
- Initialize the Stytch client in `start()`
- Add `stytch` to `app.locals`
- Extend config with `HSAuthConfiguration` and `HSSessionConfiguration`

```typescript
import { Client } from 'stytch';

// In start():
const stytchConfig = app.locals.config.auth.stytch;
if (!stytchConfig.secret) {
  throw new Error('stytch.secret is required');
}
Object.assign(app.locals, {
  stytch: new Client({ ...stytchConfig, secret: stytchConfig.secret }),
});
```

## src/types/

### service.ts (Internal)

```typescript
import type { ServiceTypes } from '@openapi-typescript-infra/service';
import type { HSRequestLocals, JTMServiceLocals } from '@justtellme/service';

import type { operationHandlers } from '../generated/service/index.ts';

import type { <PascalName>ConfigSchema } from './config.ts';

export interface <PascalName>Locals extends JTMServiceLocals<<PascalName>ConfigSchema> {
  // Add service-wide resources here
}

export type <PascalName>RequestLocals = HSRequestLocals;

export type <PascalName> = ServiceTypes<<PascalName>Locals, <PascalName>RequestLocals>;

export type <PascalName>Api = operationHandlers<<PascalName>Locals, <PascalName>RequestLocals>;
```

### config.ts (Internal)

```typescript
import type { JTMConfigurationSchema } from '@justtellme/service';

export interface <PascalName>ConfigSchema extends JTMConfigurationSchema {
  // Add service-specific config here
}
```

### config.ts (Auth Gateway)

```typescript
import type { JTMConfigurationSchema } from '@justtellme/service';
import type { HSAuthConfiguration, HSSessionConfiguration } from '@justtellme/web-auth';

export interface <PascalName>ConfigSchema
  extends JTMConfigurationSchema, HSAuthConfiguration, HSSessionConfiguration {
  // Add service-specific config here
}
```

### datasources.ts (If Calling Other Services)

```typescript
import type { paths as IdentityInternal } from '@justtellme/api/identity-internal';
import type { DatasourcesType } from '@justtellme/service';
import { createDatasourceClients } from '@justtellme/service';

import type { <PascalName> } from './service.ts';

export const Datasources = ['identityInternal'] as const;
export type Datasources = (typeof Datasources)[number];

interface DatasourcePaths {
  identityInternal: IdentityInternal;
}

export function create<PascalName>Datasources(
  app: <PascalName>['App'],
): DatasourcesType<Datasources, DatasourcePaths> {
  return createDatasourceClients(app, Datasources);
}
```

Then add to service.ts locals:
```typescript
import type { create<PascalName>Datasources } from './datasources.ts';

export interface <PascalName>Locals extends JTMServiceLocals<<PascalName>ConfigSchema> {
  datasources: ReturnType<typeof create<PascalName>Datasources>;
}
```

And initialize in `start()`:
```typescript
import { create<PascalName>Datasources } from './types/datasources.ts';

Object.assign(app.locals, {
  datasources: create<PascalName>Datasources(app),
});
```

### index.ts

```typescript
export * from './service.ts';
export * from './config.ts';
```

## config/config.json

```json
{
  "$schema": "tsschema://src/types/config#<PascalName>ConfigSchema"
}
```

For auth gateway services, also include session/auth config:
```json
{
  "$schema": "tsschema://src/types/config#<PascalName>ConfigSchema",
  "session": {
    "secret": "gsm:session_secret",
    "cookieName": "hssession",
    "cookieDomain": ".dev.justtellme.com",
    "maxAge": 604800000
  },
  "auth": {
    "cookie": "s_jwt_dev",
    "stytch": {
      "project_id": "<stytch-project-id>",
      "secret": "gsm:stytch_secret"
    }
  },
  "routing": {
    "cookieParser": true
  }
}
```

## Handlers

Handlers are auto-discovered from the file system based on the OpenAPI spec. Each file maps to a path:

```
src/handlers/<path>/<method>.ts
```

Example: `src/handlers/billing/invoices.ts`

```typescript
import type { <PascalName>Api } from '#src/types/service.ts';

export const GET: <PascalName>Api['listInvoices'] = async (req, res) => {
  // req.app.locals has service resources (db, datasources, etc.)
  // req.query has parsed query params
  res.json({ items: [] });
};
```

## OpenAPI Spec

The service needs an OpenAPI spec in the `api` package at `api/specs/<name>.yaml`. The spec is bundled to JSON during build, and the generated service types come from `src/generated/service/index.ts`.

## After Scaffolding

1. Create the OpenAPI spec in the `api` package
2. Run `yarn` from monorepo root
3. Run `make` in the service directory to generate service types
4. Add handlers as needed
5. If the service needs a database, use `/add-database`
