DROP TABLE IF EXISTS task_events;
DROP TABLE IF EXISTS task_assignments;
DROP TABLE IF EXISTS task_steps;
DROP TABLE IF EXISTS task_tracking;
DROP TABLE IF EXISTS task_context;
DROP TABLE IF EXISTS step_types;
DROP TABLE IF EXISTS tasks;
DROP TABLE IF EXISTS task_types;

DROP TYPE IF EXISTS entity_type_enum;
DROP TYPE IF EXISTS task_status_enum;

DROP FUNCTION IF EXISTS set_updated_at();
DROP ROLE IF EXISTS "task-manager";
