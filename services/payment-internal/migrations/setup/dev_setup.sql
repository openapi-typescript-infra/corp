DO
$body$
BEGIN
   IF NOT EXISTS (
      SELECT *
      FROM   pg_catalog.pg_user
      WHERE  usename = 'payment-internal') THEN

      CREATE USER "payment-internal" WITH PASSWORD 'payment-internal-pw';
   END IF;
END
$body$;

GRANT "payment-manager" TO "payment-internal";
