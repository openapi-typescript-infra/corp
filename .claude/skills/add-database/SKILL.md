---
name: add-database
description: Add a PostgreSQL database to a service that doesn't have one yet. Use when creating a new service with a database, or adding database support to an existing service.
---

# Adding a Database to a Service

This skill describes all the changes needed to go from a database-free service (like `authn-authz-internal`) to a service with a full PostgreSQL + Kysely setup (like `identity-internal`).

## 1. Makefile Changes

The service Makefile needs two additions:

**Add `dbi` and `ts` to the `all` target** (generates Kysely types from the live DB schema):
```makefile
all: service dbi ts
```

**Add `DB_NAME` export** (the PostgreSQL database name, NOT the service name):
```makefile
export DB_NAME ?= myservice
```

Full example Makefile for a DB service:
```makefile
.PHONY: all build clean

all: service dbi ts

export DB_NAME ?= myservice
export SERVICE_NAME ?= myservice-internal

SERVICE_MAKEFILE := $(shell node --experimental-import-meta-resolve -e "console.log(new URL(import.meta.resolve('@justtellme/service/Makefile'), import.meta.url).pathname)")
include $(SERVICE_MAKEFILE)
```

The shared Makefile (`@justtellme/service/Makefile`) provides:
- `dbi` target: runs `kysely-codegen` to generate `src/generated/database.ts` from the live schema
- `init` target: when `DB_NAME` is set, runs `ensure-dev-db`, `db:create`, and `migration:apply`
- `db-ci` target: used by CI to set up the test database

## 2. package.json Changes

### Add dependencies:
```json
{
  "dependencies": {
    "db-migrate": "^0.11.14",
    "db-migrate-pg": "^1.5.2",
    "kysely": "^0.28.12",
    "pg": "^8.20.0"
  }
}
```

`date-fns` is also commonly added if you need date manipulation in queries.

### Add devDependencies:
```json
{
  "devDependencies": {
    "kysely-codegen": "^0.20.0",
    "run-pg-sql": "^1.2.0"
  }
}
```

### Add scripts:
```json
{
  "scripts": {
    "ci-setup": "make db-ci",
    "db:create": "yarn dlx run-pg-sql postgres ./migrations/setup/db_setup.sql",
    "migration:apply": "db-migrate --config migrations/db-migrate.json up",
    "migration:undo": "db-migrate --config migrations/db-migrate.json down",
    "migration:create": "db-migrate --config migrations/db-migrate.json create"
  }
}
```

## 3. Migrations Directory

Create the full `migrations/` directory structure:

```
migrations/
├── db-migrate.json          # db-migrate configuration
├── package.json             # Just { "type": "commonjs" } - required because db-migrate is CJS
├── setup/
│   ├── db_setup.sql         # Creates the database
│   ├── ci_setup.sql         # Creates CI test user and grants roles
│   └── dev_setup.sql        # Creates dev user
└── sqls/                    # SQL files for each migration (created by migration:create)
```

### migrations/package.json
```json
{
  "type": "commonjs"
}
```

This is required because `db-migrate` uses CommonJS `require()` to load migration files, but our services use `"type": "module"`.

### migrations/db-migrate.json

Replace `myservice` with your database name and `myservice-owner` with the production DB user:
```json
{
  "defaultEnv": "development",
  "development": {
    "driver": "pg",
    "user": "dbowner",
    "password": "onlyindev",
    "host": "localhost",
    "database": "myservice",
    "port": { "ENV": "PGPORT" }
  },
  "production": {
    "driver": "pg",
    "user": "myservice-owner",
    "password": { "ENV": "PGPASSWORD" },
    "host": "localhost",
    "database": "myservice"
  },
  "sql-file": true
}
```

### migrations/setup/db_setup.sql
```sql
CREATE DATABASE myservice WITH owner = dbowner TEMPLATE = template0 ENCODING = 'UTF8';
```

### migrations/setup/ci_setup.sql
```sql
DO
$body$
BEGIN
  IF NOT EXISTS (
     SELECT *
     FROM   pg_catalog.pg_user
     WHERE  usename = 'dbowner') THEN
     CREATE USER "dbowner" WITH PASSWORD 'onlyindev';
     ALTER USER dbowner WITH SUPERUSER INHERIT CREATEROLE CREATEDB LOGIN REPLICATION;
  END IF;
END
$body$;
```

### migrations/setup/dev_setup.sql

Replace `myservice-internal` with the service name and create an appropriate role:
```sql
DO
$body$
BEGIN
   IF NOT EXISTS (
      SELECT *
      FROM   pg_catalog.pg_user
      WHERE  usename = 'myservice-internal') THEN

      CREATE USER "myservice-internal" WITH PASSWORD 'myservice-internal-pw';
   END IF;
END
$body$;

GRANT "myservice-manager" TO "myservice-internal";
```

### Creating Migrations

Run `yarn migration:create <name>` to create a new migration. This generates:
- `migrations/<timestamp>-<name>.js` — the migration runner (CJS, boilerplate)
- `migrations/sqls/<timestamp>-<name>-up.sql` — write your DDL here
- `migrations/sqls/<timestamp>-<name>-down.sql` — write the reverse DDL here

The generated `.js` file is boilerplate that reads and executes the corresponding SQL files. You generally don't need to modify it unless you need template substitution (like the PLv8 pattern in identity-internal).

## 4. Service Code Changes (src/index.ts)

### Add imports:
```typescript
import { createTableCache, getPgPool } from '@justtellme/cloud-sql';
import { Kysely, PostgresDialect } from 'kysely';
import type { DB } from './generated/database.ts';
```

### In the `start()` function:
```typescript
async start(app) {
  await base.start(app);

  // Create the connection pool and Kysely instance
  const { pool, shutdown } = await getPgPool(app);
  const db = new Kysely<DB>({
    dialect: new PostgresDialect({ pool }),
  });
  dbShutdown = shutdown;

  // Optional: table caches for enum/lookup tables
  const tables = {
    myEnum: createTableCache(pool, {
      tableName: 'my_enum_table',
      idColumn: 'my_enum_id',
      nameColumn: 'name',
    }),
  };

  Object.assign(app.locals, { db, tables });
},
```

### Add a `stop()` function:
```typescript
async stop(app) {
  await base.stop?.(app);
  await dbShutdown();
},
```

### Declare the shutdown variable:
```typescript
export function service(): MyService['Service'] {
  const base = useHSService<MyServiceLocals>();
  let dbShutdown: () => Promise<void>;
  // ...
}
```

## 5. Type Changes

In your service's types file, add the DB-related locals:

```typescript
import type { Kysely } from 'kysely';
import type { DB } from '../generated/database.ts';
import type { TableCache } from '@justtellme/cloud-sql';

export interface MyServiceLocals {
  db: Kysely<DB>;
  tables: {
    myEnum: TableCache;
  };
  // ... other locals
}
```

## 6. Generated Types

After creating and applying your first migration, run `make dbi` (or just `make`) to generate `src/generated/database.ts`. This file is auto-generated by `kysely-codegen` from your live database schema and should not be edited by hand.

The `dbi` Makefile target:
1. Connects to the local dev database
2. Introspects the schema
3. Writes TypeScript interfaces to `src/generated/database.ts`

This file provides the `DB` type used by `Kysely<DB>` for fully type-safe queries.

## 7. Using the Database in Handlers

Access the Kysely instance through `app.locals.db`:

```typescript
// Select
const rows = await app.locals.db
  .selectFrom('my_table')
  .select(['id', 'name'])
  .where('id', '=', someId)
  .execute();

// Insert
await app.locals.db
  .insertInto('my_table')
  .values({ name: 'foo' })
  .execute();

// Use table caches for enum lookups
const enumId = await app.locals.tables.myEnum.getId('some_name');
const enumName = await app.locals.tables.myEnum.getName(someId);
```

## 8. Cloud SQL (Production)

`@justtellme/cloud-sql`'s `getPgPool()` handles the difference between environments automatically:
- **Development/test**: direct connection to localhost PostgreSQL
- **Production/staging**: uses Google Cloud SQL Connector with IAM authentication

No additional config is needed in the service code — just use `getPgPool(app)`.

## Quick Checklist

- [ ] `Makefile`: add `dbi ts` to `all`, add `DB_NAME` export
- [ ] `package.json`: add `kysely`, `pg`, `db-migrate`, `db-migrate-pg` deps
- [ ] `package.json`: add `kysely-codegen`, `run-pg-sql` devDeps
- [ ] `package.json`: add `ci-setup`, `db:create`, `migration:apply/undo/create` scripts
- [ ] `migrations/package.json`: create with `{ "type": "commonjs" }`
- [ ] `migrations/db-migrate.json`: create with dev/prod connection config
- [ ] `migrations/setup/`: create `db_setup.sql`, `ci_setup.sql`, `dev_setup.sql`
- [ ] Create initial migration with `yarn migration:create initial-schema`
- [ ] Write your DDL in the generated SQL files
- [ ] `src/index.ts`: add `getPgPool`, `Kysely`, `PostgresDialect` setup in `start()`
- [ ] `src/index.ts`: add `dbShutdown()` in `stop()`
- [ ] Types: add `db: Kysely<DB>` to service locals
- [ ] Run `make init` to create the dev database and apply migrations
- [ ] Run `make` to generate `src/generated/database.ts`
