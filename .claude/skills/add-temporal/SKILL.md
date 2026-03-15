# Adding Temporal to an OpenAPI Typescript Service Project

This guide describes how to add `@openapi-typescript-infra/temporal-worker` to any service that uses `@openapi-typescript-infra/service`.

## Overview

The `@openapi-typescript-infra/temporal-worker` package wraps Temporal's TypeScript SDK and provides:
- A `Temporal` class that manages the worker lifecycle (start/stop)
- `createActivities()` helper that binds activities to the Express app context
- `combineActivities()` to merge multiple activity sets
- `BaseWorkflowContext` and `Triggers` for workflow state management
- `TemporalWorkerConfig` type for configuration

## Steps

### 1. Add the dependency

```bash
yarn add @openapi-typescript-infra/temporal-worker
```

### 2. Add configuration types

In `src/types/config.ts`, add `TemporalWorkerConfig` to your config schema:

```ts
import type { TemporalWorkerConfig } from '@openapi-typescript-infra/temporal-worker';

export interface MyServiceConfigSchema extends ConfigurationSchema {
  defaultTemporal: TemporalWorkerConfig;
  // ...existing config
}
```

### 3. Add Temporal to service locals

In `src/types/service.ts`, add the `Temporal` instance to your locals:

```ts
import type { Temporal } from '@openapi-typescript-infra/temporal-worker';

export interface MyServiceLocals extends ServiceLocals<MyServiceConfigSchema> {
  defaultTemporal: Temporal;
  // ...existing locals
}
```

### 4. Add config entries

In `config/config.json`, add the task queue name:

```json
{
  "defaultTemporal": {
    "taskQueue": "my-service"
  }
}
```

### 5. Create activities

Create `src/temporal/activities/index.ts`:

```ts
import { createActivities } from '@openapi-typescript-infra/temporal-worker';
import type { MyService } from '#src/types/service.js';

export function createMyActivities(app: MyService['App']) {
  return createActivities(app, {
    async myActivity(arg: string) {
      // Activity implementation — has full access to app.locals (db, config, etc.)
      return { result: 'done' };
    },
  });
}

export function createLocalMyActivities(app: MyService['App']) {
  return createActivities(app, {});
}

export type MyActivities = ReturnType<typeof createMyActivities>;
export type MyLocalActivities = ReturnType<typeof createLocalMyActivities>;
```

Activities run in the worker process and have access to `app.locals`. Split into two sets:
- **Regular activities**: run on the Temporal task queue, can be called from any worker
- **Local activities**: run in-process, useful for fast operations that don't need retry semantics

### 6. Create workflow signals, queries, and context

Workflows run in a sandboxed V8 isolate and cannot access `app.locals` or Node APIs directly. They communicate via signals (inbound events), queries (read state), and activities (side effects).

#### Signals (`src/temporal/workflows/MyWorkflow/signals.ts`)

```ts
import { defineSignal } from '@temporalio/workflow';

export interface MySignal {
  type: 'my-signal';
  timestamp: number;
  data: string;
}

export const MySignal = defineSignal<[MySignal]>('my-signal');

export interface MyWorkflowTriggers {
  'my-signal': MySignal;
}
```

#### Queries (`src/temporal/workflows/MyWorkflow/queries.ts`)

```ts
import { defineQuery } from '@temporalio/workflow';

export const StatusQuery = defineQuery<{ stage: string }>('status');
```

#### Context (`src/temporal/workflows/MyWorkflow/context.ts`)

```ts
import { log, proxyActivities, setHandler } from '@temporalio/workflow';
import { BaseWorkflowContext, Triggers } from '@openapi-typescript-infra/temporal-worker/workflow';

import type { MySignal, MyWorkflowTriggers } from './signals.js';
import { MySignal as MySignalDef, CancelSignal } from './signals.js';
import { StatusQuery } from './queries.js';
import type { MyActivities } from '#src/temporal/activities/index.js';

export class MyWorkflowContext extends BaseWorkflowContext<{ id: string }> {
  triggers = new Triggers<MyWorkflowTriggers>();
  activities = proxyActivities<MyActivities>({
    startToCloseTimeout: '5 Minutes',
  });

  static initialize(info: { id: string }) {
    const context = new MyWorkflowContext(info);
    setHandler(MySignalDef, (signal) => context.triggers.resolve('my-signal', signal));
    setHandler(StatusQuery, () => ({ stage: context.stage }));
    return context;
  }
}
```

### 7. Create the workflow

Create `src/temporal/workflows/MyWorkflow/index.ts`:

```ts
import { log } from '@temporalio/workflow';
import { WAIT_COMPLETE } from '@openapi-typescript-infra/temporal-worker/workflow';
import { MyWorkflowContext } from './context.js';

export async function MyWorkflow(args: { id: string }) {
  const context = MyWorkflowContext.initialize(args);

  while (!context.didCancel) {
    const result = await context.triggers.waitUntilTriggersOrSpecificTime(
      new Date(Date.now() + IDLE_TIMEOUT),
      'my-signal',
      'cancel',
    );

    if (result === WAIT_COMPLETE) break; // idle timeout
    if (result.type === 'cancel') break;

    // Handle signal
    await context.activities.myActivity(result.data);
  }

  return { outcome: 'completed' };
}
```

Create `src/temporal/workflows/index.ts` to barrel-export:

```ts
export * from './MyWorkflow/index.js';
```

### 8. Wire up in service entry point

In `src/index.ts`, start and stop Temporal:

```ts
import { combineActivities, Temporal } from '@openapi-typescript-infra/temporal-worker';
import { createMyActivities, createLocalMyActivities } from './temporal/activities/index.js';

// In start():
const temporal = new Temporal(app);
await temporal.start(
  app.locals.config.defaultTemporal,
  combineActivities(
    createMyActivities(app),
    createLocalMyActivities(app),
  ),
);
app.locals.defaultTemporal = temporal;

// In stop():
await app.locals.defaultTemporal?.stop();
```

### 9. Start workflows from your API handlers

Use `signalWithStart` to start a workflow (or signal an existing one):

```ts
import type { MyWorkflow } from '#src/temporal/workflows/index.js';

await app.locals.defaultTemporal.client.workflow
  .signalWithStart<typeof MyWorkflow, [MySignal]>('MyWorkflow', {
    workflowId: `my-workflow-${id}`,
    args: [{ id }],
    taskQueue: app.locals.config.defaultTemporal.taskQueue,
    signal: MySignalDef,
    signalArgs: [{ type: 'my-signal', timestamp: Date.now(), data: 'hello' }],
  });
```

## File structure summary

```
src/
  temporal/
    activities/
      index.ts          # Activity implementations (bound to app context)
    workflows/
      index.ts          # Barrel export
      MyWorkflow/
        index.ts        # Workflow function
        context.ts      # WorkflowContext class with signal handlers
        signals.ts      # Signal definitions and types
        queries.ts      # Query definitions
config/
  config.json           # taskQueue name
  production.json       # TLS cert config for Temporal Cloud
```
