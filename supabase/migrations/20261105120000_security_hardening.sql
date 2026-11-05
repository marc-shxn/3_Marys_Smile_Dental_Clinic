-- The application uses its own server-managed sessions rather than Supabase Auth.
-- Browser roles therefore receive no table privileges; the Node API enforces
-- account ownership before returning patient-owned records.

CREATE TABLE IF NOT EXISTS public.security_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  subject_hash text,
  ip_hash text NOT NULL,
  http_method text NOT NULL,
  route text NOT NULL,
  status_code integer NOT NULL,
  created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text
);
CREATE INDEX IF NOT EXISTS security_events_created_idx ON public.security_events(created_at DESC);
CREATE INDEX IF NOT EXISTS security_events_type_created_idx ON public.security_events(event_type, created_at DESC);

-- RLS with no browser policies is intentionally deny-by-default. Do not grant
-- anon/authenticated access to these tables; all access goes through the Node API.
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'clinics','patient_accounts','auth_sessions','admin_users','app_settings','admin_sessions',
    'admin_login_throttles','patient_login_throttles','ip_login_throttles',
    'password_reset_throttles','email_verification_throttles','email_verification_tokens',
    'admin_mfa_challenges','admin_activity_log','pending_file_deletions','password_reset_tokens',
    'patients','oral_assessments','oral_assessment_images','medical_history','appointments','visits',
    'conversations','messages','notifications','invoices','receipts','collection_goals','reports',
    'legacy_imports','phone_verification_tokens','phone_verification_throttles',
    'phone_number_verification_throttles','phone_signup_ip_throttles','security_events'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', table_name);
  END LOOP;
END $$;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.security_events IS 'Security events contain only hashed identifiers and route metadata; browser roles have no access.';
