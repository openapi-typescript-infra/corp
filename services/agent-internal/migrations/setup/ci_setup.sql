DO
$body$
BEGIN
   IF NOT EXISTS (
      SELECT *
      FROM   pg_catalog.pg_user
      WHERE  usename = 'agent-internal') THEN

      CREATE USER "agent-internal" WITH PASSWORD 'agent-internal-pw';
   END IF;
END
$body$;

CREATE DATABASE agent_internal OWNER dbowner;
