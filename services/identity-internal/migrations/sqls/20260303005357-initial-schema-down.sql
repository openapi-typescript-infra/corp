DROP FUNCTION IF EXISTS public.upsert_identifiers (uuid, json);
DROP TYPE IF EXISTS identifier_detail;
DROP FUNCTION IF EXISTS public.upsert_identifier (text, text, text, boolean, timestamp without time zone);
DROP TYPE IF EXISTS upserted_individual;
DROP FUNCTION IF EXISTS public.update_individual_encrypted_profile (uuid, text, text, integer, text, text, json);
DROP FUNCTION IF EXISTS public.update_individual_profile (uuid, text, text, integer, json);
DROP FUNCTION IF EXISTS json_patch (jsonb, json);
DROP TABLE IF EXISTS individual_consents;
DROP TABLE IF EXISTS consent_versions;
DROP TABLE IF EXISTS consent_types;
DROP TABLE IF EXISTS individual_relations;
DROP TYPE IF EXISTS relation_type_enum;
DROP TABLE IF EXISTS individual_addresses;
DROP TABLE IF EXISTS address_types;
DROP TABLE IF EXISTS individual_profiles;
DROP TABLE IF EXISTS profile_schemas;
DROP TABLE IF EXISTS group_identifiers;
DROP TABLE IF EXISTS individual_group_members;
DROP TYPE IF EXISTS membership_role_enum;
DROP TRIGGER IF EXISTS groups_cascade_fqn ON groups;
DROP TRIGGER IF EXISTS groups_compute_fqn ON groups;
DROP FUNCTION IF EXISTS cascade_group_fqn ();
DROP FUNCTION IF EXISTS compute_group_fqn ();
DROP TABLE IF EXISTS groups;
DROP FUNCTION IF EXISTS escape_ltree_label (text);
DROP TABLE IF EXISTS group_types;
DROP INDEX IF EXISTS individual_identifiers_by_namespace_active;
DROP TABLE IF EXISTS individual_identifiers;
DROP TABLE IF EXISTS identifier_namespaces;
DROP TYPE IF EXISTS identifier_namespace_type_enum;
DROP TABLE IF EXISTS individual_tags;
DROP TABLE IF EXISTS individuals;
DROP TYPE IF EXISTS biological_sex_enum;
DROP FUNCTION IF EXISTS create_address;
DROP TABLE IF EXISTS address_map;
DROP TABLE IF EXISTS address_scopes;
DROP TABLE IF EXISTS addresses;
DROP EXTENSION IF EXISTS ltree;
DROP EXTENSION IF EXISTS plv8;
DROP EXTENSION IF EXISTS postgis;
DO $do$
DECLARE
  runtime_role text;
BEGIN
  FOR runtime_role IN
    SELECT rolname
    FROM pg_roles
    WHERE rolname LIKE 'identity-internal-sa@%.iam'
  LOOP
    EXECUTE format('REVOKE %I FROM %I', 'identity-manager', runtime_role);
  END LOOP;
END
$do$;
DROP ROLE IF EXISTS "identity-manager";
