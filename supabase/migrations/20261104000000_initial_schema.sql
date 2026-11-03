-- Initial PostgreSQL schema for 3 Mary's Smile Clinic.
-- The Node API connects with DATABASE_URL and enforces authorization itself.
-- Browser clients must not receive direct table grants or the service role key.
CREATE TABLE IF NOT EXISTS public.clinics (
  clinic_id text PRIMARY KEY,
  name text NOT NULL,
  created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text
);

CREATE TABLE IF NOT EXISTS public.patient_accounts (
  account_id text PRIMARY KEY,
  full_name text NOT NULL,
  first_name text NOT NULL,
  middle_name text,
  last_name text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL,
  date_of_birth text NOT NULL,
  gender text NOT NULL,
  address text,
  password_hash text NOT NULL,
  password_salt text NOT NULL,
  email_verified_at text,
  created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text
);
CREATE UNIQUE INDEX IF NOT EXISTS patient_accounts_email_ci_idx ON public.patient_accounts (lower(email));

CREATE TABLE IF NOT EXISTS public.auth_sessions (
  session_id text PRIMARY KEY,
  account_id text NOT NULL REFERENCES public.patient_accounts(account_id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at bigint NOT NULL,
  created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text
);
CREATE INDEX IF NOT EXISTS auth_sessions_expiry_idx ON public.auth_sessions(expires_at);
CREATE INDEX IF NOT EXISTS auth_sessions_account_idx ON public.auth_sessions(account_id);

CREATE TABLE IF NOT EXISTS public.admin_users (
  admin_id text PRIMARY KEY,
  full_name text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL DEFAULT '',
  password_hash text NOT NULL,
  password_salt text NOT NULL,
  mfa_secret_ciphertext text,
  mfa_secret_iv text,
  mfa_secret_tag text,
  mfa_enabled_at text,
  mfa_last_totp_step bigint,
  role text NOT NULL DEFAULT 'admin' CHECK (role = 'admin'),
  is_active smallint NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  updated_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  password_changed_at text
);
CREATE UNIQUE INDEX IF NOT EXISTS admin_users_email_ci_idx ON public.admin_users (lower(email));

CREATE TABLE IF NOT EXISTS public.app_settings (
  setting_key text PRIMARY KEY,
  setting_value_json text NOT NULL DEFAULT '{}',
  updated_by text REFERENCES public.admin_users(admin_id) ON DELETE SET NULL,
  updated_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text
);

CREATE TABLE IF NOT EXISTS public.admin_sessions (
  session_id text PRIMARY KEY,
  admin_id text NOT NULL REFERENCES public.admin_users(admin_id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at bigint NOT NULL,
  created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text
);
CREATE INDEX IF NOT EXISTS admin_sessions_expiry_idx ON public.admin_sessions(expires_at);
CREATE INDEX IF NOT EXISTS admin_sessions_admin_idx ON public.admin_sessions(admin_id);

CREATE TABLE IF NOT EXISTS public.admin_login_throttles (
  email_hash text PRIMARY KEY,
  failures integer NOT NULL DEFAULT 0,
  blocked_until bigint NOT NULL DEFAULT 0,
  updated_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text
);
CREATE TABLE IF NOT EXISTS public.patient_login_throttles (
  email_hash text PRIMARY KEY,
  failures integer NOT NULL DEFAULT 0,
  blocked_until bigint NOT NULL DEFAULT 0,
  updated_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text
);
CREATE TABLE IF NOT EXISTS public.ip_login_throttles (
  ip_hash text PRIMARY KEY,
  failures integer NOT NULL DEFAULT 0,
  blocked_until bigint NOT NULL DEFAULT 0,
  updated_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text
);
CREATE TABLE IF NOT EXISTS public.password_reset_throttles (
  email_hash text PRIMARY KEY,
  failures integer NOT NULL DEFAULT 0,
  blocked_until bigint NOT NULL DEFAULT 0,
  updated_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text
);
CREATE TABLE IF NOT EXISTS public.email_verification_throttles (
  email_hash text PRIMARY KEY,
  failures integer NOT NULL DEFAULT 0,
  blocked_until bigint NOT NULL DEFAULT 0,
  updated_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text
);

CREATE TABLE IF NOT EXISTS public.email_verification_tokens (
  verification_id text PRIMARY KEY,
  account_id text NOT NULL REFERENCES public.patient_accounts(account_id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  code_salt text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  expires_at bigint NOT NULL,
  used_at text,
  created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text
);
CREATE INDEX IF NOT EXISTS email_verification_expiry_idx ON public.email_verification_tokens(expires_at);
CREATE INDEX IF NOT EXISTS email_verification_account_idx ON public.email_verification_tokens(account_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.admin_mfa_challenges (
  challenge_id text PRIMARY KEY,
  admin_id text NOT NULL REFERENCES public.admin_users(admin_id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  attempts integer NOT NULL DEFAULT 0,
  expires_at bigint NOT NULL,
  used_at text,
  created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text
);
CREATE INDEX IF NOT EXISTS admin_mfa_challenge_expiry_idx ON public.admin_mfa_challenges(expires_at);

CREATE TABLE IF NOT EXISTS public.admin_activity_log (
  activity_id text PRIMARY KEY,
  admin_id text REFERENCES public.admin_users(admin_id) ON DELETE SET NULL,
  event_type text NOT NULL,
  http_method text NOT NULL,
  route text NOT NULL,
  status_code integer NOT NULL,
  created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text
);
CREATE INDEX IF NOT EXISTS admin_activity_log_created_idx ON public.admin_activity_log(created_at DESC);
CREATE INDEX IF NOT EXISTS admin_activity_log_admin_idx ON public.admin_activity_log(admin_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.pending_file_deletions (
  relative_path text PRIMARY KEY,
  created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text
);

CREATE TABLE IF NOT EXISTS public.password_reset_tokens (
  reset_id text PRIMARY KEY,
  account_id text NOT NULL REFERENCES public.patient_accounts(account_id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  code_hash text NOT NULL,
  code_salt text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  code_verified_at text,
  expires_at bigint NOT NULL,
  used_at text,
  created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text
);
CREATE INDEX IF NOT EXISTS password_reset_expiry_idx ON public.password_reset_tokens(expires_at);
CREATE INDEX IF NOT EXISTS password_reset_account_idx ON public.password_reset_tokens(account_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.patients (
  patient_id text PRIMARY KEY,
  clinic_id text NOT NULL REFERENCES public.clinics(clinic_id),
  account_id text UNIQUE REFERENCES public.patient_accounts(account_id) ON DELETE SET NULL,
  full_name text NOT NULL,
  email text,
  phone text,
  date_of_birth text,
  gender text,
  address text,
  notes text,
  patient_number text,
  first_name text,
  last_name text,
  age integer,
  civil_status text,
  occupation text,
  height double precision,
  weight double precision,
  emergency_contact_name text,
  emergency_contact_relationship text,
  emergency_contact_number text,
  parent_guardian_name text,
  parent_guardian_relationship text,
  parent_guardian_number text,
  referred_by text,
  status text NOT NULL DEFAULT 'active',
  last_visit_date text,
  updated_at text,
  created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text
);
CREATE INDEX IF NOT EXISTS patients_clinic_idx ON public.patients(clinic_id);
CREATE INDEX IF NOT EXISTS patients_name_idx ON public.patients(lower(full_name));
CREATE INDEX IF NOT EXISTS patients_account_idx ON public.patients(account_id);
CREATE UNIQUE INDEX IF NOT EXISTS patients_patient_number_uq ON public.patients(patient_number) WHERE patient_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS patients_email_idx ON public.patients(lower(email));

CREATE TABLE IF NOT EXISTS public.oral_assessments (
  assessment_id text PRIMARY KEY,
  patient_id text NOT NULL REFERENCES public.patients(patient_id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'awaiting_ai' CHECK (status IN ('awaiting_ai','completed','failed')),
  consent_version text NOT NULL,
  consented_at text NOT NULL,
  result_json text NOT NULL DEFAULT '{}',
  assessment_date text,
  risk_level text,
  findings_json text NOT NULL DEFAULT '[]',
  recommendations_json text NOT NULL DEFAULT '[]',
  confidence_scores_json text NOT NULL DEFAULT '[]',
  tooth_mapping_json text NOT NULL DEFAULT '[]',
  odontogram_data_json text NOT NULL DEFAULT '{}',
  annotated_images_json text NOT NULL DEFAULT '[]',
  created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text
);
CREATE INDEX IF NOT EXISTS oral_assessments_patient_idx ON public.oral_assessments(patient_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.oral_assessment_images (
  image_id text PRIMARY KEY,
  assessment_id text NOT NULL REFERENCES public.oral_assessments(assessment_id) ON DELETE CASCADE,
  image_kind text NOT NULL CHECK (image_kind IN ('teeth','xray')),
  angle text,
  original_name text NOT NULL,
  mime_type text NOT NULL CHECK (mime_type IN ('image/jpeg','image/png','image/webp')),
  file_size integer NOT NULL CHECK (file_size > 0 AND file_size <= 5242880),
  image_width integer,
  image_height integer,
  storage_path text NOT NULL UNIQUE,
  created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text
);
CREATE INDEX IF NOT EXISTS oral_assessment_images_assessment_idx ON public.oral_assessment_images(assessment_id);

CREATE TABLE IF NOT EXISTS public.medical_history (
  medical_history_id text PRIMARY KEY,
  patient_id text NOT NULL UNIQUE REFERENCES public.patients(patient_id) ON DELETE CASCADE,
  allergies text,
  medications text,
  medical_conditions text,
  serious_illnesses text,
  pregnancy_status text,
  mouth_growths text,
  clinical_notes text,
  responses_json text,
  created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  updated_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text
);

CREATE TABLE IF NOT EXISTS public.appointments (
  appointment_id text PRIMARY KEY,
  clinic_id text NOT NULL REFERENCES public.clinics(clinic_id),
  patient_id text REFERENCES public.patients(patient_id) ON DELETE SET NULL,
  patient_name_snapshot text,
  starts_at text NOT NULL,
  service text NOT NULL,
  provider text,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','confirmed','completed','cancelled')),
  notes text,
  reminder_method text,
  treatment_type text,
  appointment_date text,
  appointment_time text,
  updated_at text,
  created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text
);
CREATE INDEX IF NOT EXISTS appointments_clinic_date_idx ON public.appointments(clinic_id, starts_at);
CREATE INDEX IF NOT EXISTS appointments_patient_date_idx ON public.appointments(patient_id, starts_at);
CREATE UNIQUE INDEX IF NOT EXISTS appointments_active_slot_uq ON public.appointments(clinic_id, starts_at) WHERE status <> 'cancelled';

CREATE TABLE IF NOT EXISTS public.visits (
  visit_id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  clinic_id text NOT NULL REFERENCES public.clinics(clinic_id),
  patient_id text NOT NULL REFERENCES public.patients(patient_id) ON DELETE CASCADE,
  patient_name_snapshot text NOT NULL,
  treatment_type text NOT NULL,
  visit_date text NOT NULL,
  visit_source text NOT NULL DEFAULT 'Walk-In' CHECK (visit_source IN ('Walk-In', 'Appointment')),
  clinical_notes text,
  created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  updated_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text
);
CREATE INDEX IF NOT EXISTS visits_clinic_date_idx ON public.visits(clinic_id, visit_date);
CREATE INDEX IF NOT EXISTS visits_patient_date_idx ON public.visits(patient_id, visit_date);

CREATE TABLE IF NOT EXISTS public.conversations (
  conversation_id text PRIMARY KEY,
  clinic_id text NOT NULL REFERENCES public.clinics(clinic_id),
  patient_id text REFERENCES public.patients(patient_id) ON DELETE SET NULL,
  subject text,
  patient_name_snapshot text,
  assigned_staff_id text,
  status text NOT NULL DEFAULT 'open',
  updated_at text,
  created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text
);
CREATE INDEX IF NOT EXISTS conversations_patient_idx ON public.conversations(patient_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.messages (
  message_id text PRIMARY KEY,
  conversation_id text NOT NULL REFERENCES public.conversations(conversation_id) ON DELETE CASCADE,
  sender_type text NOT NULL CHECK (sender_type IN ('patient','staff')),
  sender_id text,
  body text NOT NULL,
  patient_id text REFERENCES public.patients(patient_id) ON DELETE SET NULL,
  message_type text,
  subject text,
  message_content text,
  delivery_method text,
  status text,
  is_read smallint NOT NULL DEFAULT 0 CHECK (is_read IN (0, 1)),
  read_at text,
  is_archived smallint NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1)),
  archived_at text,
  archived_read smallint CHECK (archived_read IN (0, 1)),
  is_trashed smallint NOT NULL DEFAULT 0 CHECK (is_trashed IN (0, 1)),
  is_draft smallint NOT NULL DEFAULT 0 CHECK (is_draft IN (0, 1)),
  patient_label text,
  patient_number_snapshot text,
  updated_at text,
  created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text
);
CREATE INDEX IF NOT EXISTS messages_conversation_idx ON public.messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS messages_patient_idx ON public.messages(patient_id, created_at);

CREATE TABLE IF NOT EXISTS public.notifications (
  notification_id text PRIMARY KEY,
  patient_id text REFERENCES public.patients(patient_id) ON DELETE SET NULL,
  patient_name_snapshot text,
  patient_number_snapshot text,
  title text NOT NULL,
  message text NOT NULL,
  notification_type text NOT NULL DEFAULT 'update',
  is_read smallint NOT NULL DEFAULT 0 CHECK (is_read IN (0, 1)),
  is_archived smallint NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1)),
  archive_date text,
  archived_read smallint CHECK (archived_read IN (0, 1)),
  created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text
);
CREATE INDEX IF NOT EXISTS notifications_patient_idx ON public.notifications(patient_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.invoices (
  invoice_id text PRIMARY KEY,
  clinic_id text NOT NULL REFERENCES public.clinics(clinic_id),
  patient_id text REFERENCES public.patients(patient_id) ON DELETE SET NULL,
  amount_cents bigint NOT NULL CHECK (amount_cents >= 0),
  currency text NOT NULL DEFAULT 'PHP',
  description text NOT NULL,
  status text NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid','paid','void')),
  due_date text,
  invoice_number text,
  patient_name_snapshot text,
  patient_number_snapshot text,
  treatment_name text,
  total_amount double precision,
  amount_paid double precision NOT NULL DEFAULT 0,
  remaining_balance double precision,
  payment_status text,
  payment_method text,
  invoice_date text,
  payment_date text,
  updated_at text,
  created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text
);
CREATE INDEX IF NOT EXISTS invoices_clinic_idx ON public.invoices(clinic_id, created_at DESC);
CREATE INDEX IF NOT EXISTS invoices_patient_idx ON public.invoices(patient_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS invoices_invoice_number_uq ON public.invoices(invoice_number) WHERE invoice_number IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.receipts (
  receipt_id text PRIMARY KEY,
  invoice_id text NOT NULL REFERENCES public.invoices(invoice_id) ON DELETE CASCADE,
  receipt_number text NOT NULL UNIQUE,
  amount_paid double precision NOT NULL CHECK (amount_paid > 0),
  payment_method text NOT NULL,
  payment_date text NOT NULL,
  created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text
);
CREATE INDEX IF NOT EXISTS receipts_invoice_idx ON public.receipts(invoice_id, payment_date DESC);

CREATE TABLE IF NOT EXISTS public.collection_goals (
  goal_id text PRIMARY KEY,
  goal_name text NOT NULL,
  target_amount double precision NOT NULL CHECK (target_amount > 0),
  collected_amount double precision NOT NULL DEFAULT 0,
  achievement_percentage double precision NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'Active',
  start_date text,
  end_date text,
  completion_date text,
  archive_date text,
  metadata_json text NOT NULL DEFAULT '{}',
  created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  updated_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text
);

CREATE TABLE IF NOT EXISTS public.reports (
  report_id text PRIMARY KEY,
  report_name text NOT NULL,
  report_type text NOT NULL,
  generated_by text,
  generated_date text NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  data_json text NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS reports_generated_idx ON public.reports(generated_date DESC);

CREATE TABLE IF NOT EXISTS public.legacy_imports (
  import_key text PRIMARY KEY,
  imported_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  imported_summary text NOT NULL DEFAULT '{}'
);

-- The current React app talks only to its Node API. Revoke direct Data API
-- table access; RLS is enabled as defense in depth if tables are exposed later.
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'clinics','patient_accounts','auth_sessions','admin_users','app_settings','admin_sessions',
    'admin_login_throttles','patient_login_throttles','ip_login_throttles',
    'password_reset_throttles','email_verification_throttles','email_verification_tokens',
    'admin_mfa_challenges','admin_activity_log','pending_file_deletions','password_reset_tokens',
    'patients','oral_assessments','oral_assessment_images','medical_history','appointments','visits',
    'conversations','messages','notifications','invoices','receipts','collection_goals','reports','legacy_imports'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', table_name);
  END LOOP;
END $$;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
GRANT USAGE ON SCHEMA public TO anon, authenticated;

INSERT INTO public.clinics (clinic_id, name)
VALUES ('default-clinic', '3 Mary’s Smile Dental Clinic')
ON CONFLICT (clinic_id) DO NOTHING;
