DROP TABLE IF EXISTS group_consents;
DROP TABLE IF EXISTS group_addresses;
DROP FUNCTION IF EXISTS public.update_group_profile (uuid, text, text, integer, json);
DROP FUNCTION IF EXISTS public.update_group_encrypted_profile (uuid, text, text, integer, text, text, json);
DROP TABLE IF EXISTS group_profiles;
