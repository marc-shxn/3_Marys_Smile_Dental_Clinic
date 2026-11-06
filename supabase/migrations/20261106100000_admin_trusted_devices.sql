CREATE TABLE IF NOT EXISTS public.admin_trusted_devices (
  trusted_device_id text PRIMARY KEY,
  admin_id text NOT NULL REFERENCES public.admin_users(admin_id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at bigint NOT NULL,
  created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  last_used_at text
);

CREATE INDEX IF NOT EXISTS admin_trusted_devices_admin_expiry_idx
  ON public.admin_trusted_devices(admin_id, expires_at);

ALTER TABLE public.admin_trusted_devices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.admin_trusted_devices FROM anon, authenticated;
