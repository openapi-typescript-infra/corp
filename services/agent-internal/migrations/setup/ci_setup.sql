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
