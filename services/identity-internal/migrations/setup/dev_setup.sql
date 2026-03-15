DO
$body$
BEGIN
   IF NOT EXISTS (
      SELECT *
      FROM   pg_catalog.pg_user
      WHERE  usename = 'identity-internal') THEN

      CREATE USER "identity-internal" WITH PASSWORD 'identity-internal-pw';
   END IF;
END
$body$;

GRANT "identity-manager" TO "identity-internal";
