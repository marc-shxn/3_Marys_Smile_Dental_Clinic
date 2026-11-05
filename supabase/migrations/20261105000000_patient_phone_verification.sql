ALTER TABLE public.patient_accounts
  ADD COLUMN IF NOT EXISTS phone_verification_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS phone_verified_at text;

CREATE TABLE IF NOT EXISTS public.phone_verification_tokens (
  verification_id text PRIMARY KEY,
  account_id text NOT NULL REFERENCES public.patient_accounts(account_id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  code_salt text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  expires_at bigint NOT NULL,
  used_at text,
  created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text
);
CREATE INDEX IF NOT EXISTS phone_verification_expiry_idx ON public.phone_verification_tokens(expires_at);
CREATE INDEX IF NOT EXISTS phone_verification_account_idx ON public.phone_verification_tokens(account_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.phone_verification_throttles (
  email_hash text PRIMARY KEY,
  failures integer NOT NULL DEFAULT 0,
  blocked_until bigint NOT NULL DEFAULT 0,
  updated_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text
);

CREATE TABLE IF NOT EXISTS public.phone_number_verification_throttles (
  phone_hash text PRIMARY KEY,
  failures integer NOT NULL DEFAULT 0,
  blocked_until bigint NOT NULL DEFAULT 0,
  updated_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text
);

CREATE TABLE IF NOT EXISTS public.phone_signup_ip_throttles (
  ip_hash text PRIMARY KEY,
  failures integer NOT NULL DEFAULT 0,
  blocked_until bigint NOT NULL DEFAULT 0,
  updated_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text
);

ALTER TABLE public.phone_verification_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phone_verification_throttles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phone_number_verification_throttles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phone_signup_ip_throttles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.phone_verification_tokens, public.phone_verification_throttles, public.phone_number_verification_throttles, public.phone_signup_ip_throttles FROM anon, authenticated;
