INSERT INTO identifier_namespaces (name, identifier_namespace_type, is_unique) VALUES
  ('consumer-email', 'email', true),
  ('phone', 'phone', true),
  ('consumer-phone', 'phone', true),
  ('individual-name', 'individual_name', false),
  ('consumer-uuid', 'uuid', true),
  ('stripe-customer', 'third_party', true),
  ('stytch-consumer', 'third_party', true),
  ('consumer-apple', 'third_party', true),
  ('consumer-google', 'third_party', true),
  ('stytch-admin', 'third_party', true),
  ('stytch-provider', 'third_party', true);
