# task-internal

Lightweight task and workflow tracking. A "production Jira" for correlated activity across services: anything that crosses multiple data stores or services under one logical operation can have a `tasks` row tying it together. The root `tasks` row stays intentionally thin; optional `task_context` and `task_tracking` rows carry richer handling metadata for tasks that need it.

The service makes no assumptions about your domain — `task_type` values are caller-defined and seeded into `task_types` via your own migration. `EntityType` is generic (`user`, `agent`, `service`, `system`) so you can correlate tasks with whatever your domain actually has.

## Schema

```mermaid
erDiagram
    task_types {
        bigint task_type_id PK
        text name UK
        text description
        smallint default_priority
        timestamptz created_at
        timestamptz updated_at
        timestamptz deleted_at
    }

    tasks {
        bigint task_id PK
        uuid task_uuid UK
        bigint task_type_id FK
        text idempotency_key
        timestamptz created_at
        timestamptz updated_at
        timestamptz deleted_at
    }

    task_context {
        bigint task_id PK,FK
        text title
        text summary
        entity_type_enum submitter_type
        uuid submitter_uuid
        entity_type_enum subject_type
        uuid subject_uuid
        jsonb extra_data
        timestamptz created_at
        timestamptz updated_at
        timestamptz deleted_at
    }

    task_tracking {
        bigint task_id PK,FK
        task_status_enum status
        smallint priority
        timestamptz due_at
        timestamptz closed_at
        timestamptz created_at
        timestamptz updated_at
        timestamptz deleted_at
    }

    step_types {
        bigint step_type_id PK
        text name UK
        text description
        smallint default_priority
        timestamptz created_at
        timestamptz updated_at
        timestamptz deleted_at
    }

    task_steps {
        bigint task_step_id PK
        uuid task_step_uuid UK
        bigint task_id FK
        bigint step_type_id FK
        bigint depends_on_step_id FK
        task_status_enum status
        timestamptz due_at
        timestamptz started_at
        timestamptz completed_at
        jsonb extra_data
        timestamptz created_at
        timestamptz updated_at
        timestamptz deleted_at
    }

    task_assignments {
        bigint task_assignment_id PK
        bigint task_id FK
        bigint task_step_id FK
        entity_type_enum assignee_type
        uuid assignee_uuid
        timestamptz assigned_at
        timestamptz released_at
        timestamptz completed_at
        jsonb extra_data
        timestamptz created_at
        timestamptz updated_at
        timestamptz deleted_at
    }

    task_events {
        bigint task_event_id PK
        bigint task_id FK
        bigint task_step_id FK
        text event_type
        entity_type_enum actor_type
        uuid actor_uuid
        task_status_enum from_status
        task_status_enum to_status
        text message
        jsonb extra_data
        timestamptz created_at
    }

    task_types ||--o{ tasks : "type"
    tasks ||--o| task_context : "context"
    tasks ||--o| task_tracking : "tracking"
    tasks ||--o{ task_steps : "has"
    tasks ||--o{ task_assignments : "has"
    tasks ||--o{ task_events : "has"
    step_types ||--o{ task_steps : "type"
    task_steps o|--o| task_steps : "depends_on"
    task_steps o|--o{ task_assignments : "has"
    task_steps o|--o{ task_events : "has"
```

## Notes

- `tasks` is the canonical root record and is cheap to instantiate.
- `task_types` are controlled values. Adding a task type requires seed data in a migration in your consuming service.
- `task_context` is optional metadata about who or what the task is about.
- `task_tracking` is optional lifecycle state for tasks that need active handling.
