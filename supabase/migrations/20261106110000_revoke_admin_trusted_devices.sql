DO $$
BEGIN
  IF to_regclass('public.admin_trusted_devices') IS NOT NULL THEN
    DELETE FROM public.admin_trusted_devices;
  END IF;
END $$;
