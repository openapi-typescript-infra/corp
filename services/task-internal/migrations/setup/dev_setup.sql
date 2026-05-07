DO
$body$
BEGIN
   IF NOT EXISTS (
      SELECT *
      FROM   pg_catalog.pg_user
      WHERE  usename = 'task-internal') THEN

      CREATE USER "task-internal" WITH PASSWORD 'task-internal-pw';
   END IF;
END
$body$;

GRANT "task-manager" TO "task-internal";
