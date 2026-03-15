---
name: create-web-app
description: Scaffold a new Next.js web application in the monorepo. Use when the user wants to create a new frontend/website project under services/.
---

# Create a Next.js Web Application

This skill scaffolds a new Next.js web application under `services/<name>/`. Web apps in this monorepo are built on `@justtellme/web-service`, which wraps Next.js with Express, Stytch auth, sessions, and the standard service infrastructure.

Ask the user for:
1. **App name** (e.g. `admin-web`, `provider-web`)
2. **Description** (one-line)
3. **Does it need GraphQL?** (urql client + codegen)
4. **Which backend services does it call?** (for datasources)

## Directory Structure

```
services/<name>/
├── package.json
├── Makefile
├── .gitignore
├── config/
│   └── config.json
├── src/
│   ├── index.ts              # Service factory
│   ├── _app.tsx              # Next.js custom App
│   ├── _document.tsx         # Next.js custom Document
│   ├── _error.tsx            # Next.js error page
│   ├── pages/                # Next.js pages (Pages Router)
│   │   └── index.tsx
│   ├── components/           # React components
│   ├── lib/                  # Utilities and business logic
│   ├── types/
│   │   ├── index.ts
│   │   ├── service.ts
│   │   ├── config.ts
│   │   ├── datasources.ts
│   │   ├── client-variables.ts
│   │   └── NextPage.ts
│   └── generated/
│       ├── service/
│       │   └── index.ts      # Auto-generated from OpenAPI spec
│       └── graphql-api.ts    # Auto-generated from GraphQL schema (if using GraphQL)
└── public/                   # Static assets
```

## package.json

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
    "start": "NODE_OPTIONS='--import tsx/esm' start-service",
    "repl": "NODE_OPTIONS='--import tsx/esm' start-service --repl",
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
    "cpconfig": "^1.4.4",
    "eslint": "^10.0.3",
    "prettier": "^3.8.1",
    "typescript": "^5.9.3",
    "vitest": "^4.1.0"
  },
  "dependencies": {
    "@justtellme/cpconfig": "workspace:^",
    "@justtellme/service": "workspace:^",
    "@justtellme/state": "workspace:^",
    "@justtellme/ui-kit": "workspace:^",
    "@justtellme/web-service": "workspace:^",
    "@legendapp/state": "^3.0.0-beta.46",
    "@openapi-typescript-infra/service": "^6.11.0",
    "@stytch/nextjs": "^22.0.4",
    "posthog-js": "^1.360.2"
  }
}
```

Key differences from backend services:
- `start` script uses `NODE_OPTIONS='--import tsx/esm'` for JSX/TSX support
- Depends on `@justtellme/web-service` (not just `@justtellme/service`)
- Includes `@justtellme/ui-kit` for shared components and design system
- Includes `@justtellme/state` and `@legendapp/state` for state management
- Includes `@stytch/nextjs` for client-side auth
- Includes `posthog-js` for analytics

If using GraphQL, also add:
```json
{
  "dependencies": {
    "next-urql": "^5.0.2",
    "urql": "^5.0.1"
  }
}
```

## Makefile

```makefile
.PHONY: all build clean

all: service

export SERVICE_NAME ?= <name>

SERVICE_MAKEFILE := $(shell node --experimental-import-meta-resolve -e "console.log(new URL(import.meta.resolve('@justtellme/web-service/Makefile'), import.meta.url).pathname)")
include $(SERVICE_MAKEFILE)

API_SPEC := ./api/<name>.yaml
```

Note: includes `@justtellme/web-service/Makefile` (not `@justtellme/service/Makefile`). The web-service Makefile extends the base one with GraphQL codegen support.

## src/index.ts

```typescript
import { useHSWebService } from '@justtellme/web-service';

import { create<PascalName>Datasources } from './types/datasources.ts';
import type { <PascalName>, <PascalName>Locals } from './types/index.ts';

export function service(): <PascalName>['Service'] {
  const base = useHSWebService<<PascalName>Locals>();
  return {
    ...base,
    async start(app) {
      await base.start(app);
      Object.assign(app.locals, {
        datasources: create<PascalName>Datasources(app),
      });
    },
    async stop(app) {
      await base.stop?.(app);
    },
  };
}
```

Key difference: uses `useHSWebService` (from `@justtellme/web-service`), NOT `useHSService`. This sets up Next.js, Stytch auth, sessions, and all the web middleware automatically.

## src/types/

### service.ts

```typescript
import type { ServiceTypes } from '@openapi-typescript-infra/service';
import type { HSWebRequestLocals, HSWebServiceLocals } from '@justtellme/web-service';

import type { operationHandlers } from '../generated/service/index.ts';

import type { create<PascalName>Datasources } from './datasources.ts';
import type { <PascalName>ConfigSchema } from './config.ts';

export interface <PascalName>Locals extends HSWebServiceLocals<<PascalName>ConfigSchema> {
  datasources: ReturnType<typeof create<PascalName>Datasources>;
}

export type <PascalName>RequestLocals = HSWebRequestLocals;

export type <PascalName> = ServiceTypes<<PascalName>Locals, <PascalName>RequestLocals>;

export type <PascalName>Api = operationHandlers<<PascalName>Locals, <PascalName>RequestLocals>;
```

Note: extends `HSWebServiceLocals` and `HSWebRequestLocals` (from web-service), not the plain `HS*` variants.

### config.ts

```typescript
import type { HSWebConfigurationSchema } from '@justtellme/web-service';

import type { create<PascalName>Datasources } from './datasources.ts';

export interface <PascalName>ConfigSchema extends HSWebConfigurationSchema {
  datasources: ReturnType<typeof create<PascalName>Datasources>;
}
```

Note: extends `HSWebConfigurationSchema` (from web-service), not `HSConfigurationSchema`.

### datasources.ts

Same pattern as backend services — see `/create-service` skill.

### index.ts

```typescript
export * from './service.ts';
export * from './config.ts';
export * from './client-variables.ts';
export * from './NextPage.ts';
```

### client-variables.ts

Define what variables are exposed to the browser via `window.hs`:

```typescript
import type { HSClientSideVariables } from '@justtellme/web-service';

export interface <PascalName>ClientSideVariables extends HSClientSideVariables {
  // Add app-specific client variables here
}
```

### NextPage.ts

```typescript
import type { NextPage } from 'next';

export type <PascalName>Page<P = object> = NextPage<P>;
```

## config/config.json

```json
{
  "$schema": "tsschema://src/config#<PascalName>ConfigSchema"
}
```

Auth, session, PostHog, and CSRF config are inherited from the web-service defaults. Add environment-specific overrides in `config/development.json`, `config/production.json`, etc.

## Pages

Web apps use the **Next.js Pages Router** (not App Router). Pages go in `src/pages/`:

```typescript
// src/pages/index.tsx
import type { <PascalName>Page } from '#src/types/NextPage.ts';

const HomePage: <PascalName>Page = () => {
  return <div>Hello</div>;
};

export default HomePage;
```

Note: pages use default exports (the ESLint config has an exception for `src/pages/**`).

## Shared UI

Import components and styles from the design system:

```typescript
import { FullPageLoader } from '@justtellme/ui-kit';
import '@justtellme/ui-kit/styles.css';
```

The ui-kit uses Tailwind CSS 4. The `cn()` utility from `@justtellme/ui-kit/lib/utils` merges Tailwind classes.

## .gitignore

```
# Managed by cpconfig
/.commitlintrc.yaml
/eslint.config.mts
/tsconfig.json
/tsconfig.build.json
/.prettierrc.yaml
/vitest.config.ts
/next.config.js

# Build
/dist
/private
/.next
/*.tsbuildinfo

# Standard
node_modules
*.log
coverage
```

Note: `next.config.js` is also managed by cpconfig. `/private` is the Next.js build output directory (custom `distDir`).

## After Scaffolding

1. Create the OpenAPI spec in the `api` package (even if minimal — it defines the server-side routes)
2. Run `yarn` from monorepo root
3. Run `make` in the service directory
4. Add pages, components, and handlers as needed
