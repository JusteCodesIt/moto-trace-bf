-- =============================================================================
-- FND-08: Encrypt webhook_endpoints secrets at rest using pgcrypto
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Add encrypted column
DO $$ BEGIN
  ALTER TABLE public.webhook_endpoints ADD COLUMN secret_encrypted BYTEA;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Encrypt existing secrets (using a symmetric key from vault/env)
-- The encryption passphrase should be stored in Supabase vault.
-- For now we use a placeholder that MUST be replaced in production.
DO $$
DECLARE
  enc_key TEXT;
BEGIN
  enc_key := current_setting('app.settings.webhook_encryption_key', true);
  IF enc_key IS NULL OR enc_key = '' THEN
    RAISE NOTICE 'app.settings.webhook_encryption_key not set — skipping secret encryption migration. Set it and re-run.';
    RETURN;
  END IF;

  UPDATE public.webhook_endpoints
  SET secret_encrypted = pgp_sym_encrypt(secret, enc_key)
  WHERE secret IS NOT NULL AND secret_encrypted IS NULL;

  -- Drop the plaintext column after encryption
  ALTER TABLE public.webhook_endpoints DROP COLUMN IF EXISTS secret;
END $$;

-- Helper functions for reading/writing encrypted secrets
CREATE OR REPLACE FUNCTION public.set_webhook_secret(
  p_endpoint_id UUID,
  p_secret TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  enc_key TEXT;
BEGIN
  enc_key := current_setting('app.settings.webhook_encryption_key', true);
  IF enc_key IS NULL OR enc_key = '' THEN
    RAISE EXCEPTION 'Encryption key not configured';
  END IF;
  UPDATE public.webhook_endpoints
  SET secret_encrypted = pgp_sym_encrypt(p_secret, enc_key)
  WHERE id = p_endpoint_id;
END $$;

CREATE OR REPLACE FUNCTION public.get_webhook_secret(
  p_endpoint_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  enc_key TEXT;
  result TEXT;
BEGIN
  enc_key := current_setting('app.settings.webhook_encryption_key', true);
  IF enc_key IS NULL OR enc_key = '' THEN
    RAISE EXCEPTION 'Encryption key not configured';
  END IF;
  SELECT pgp_sym_decrypt(secret_encrypted, enc_key)
  INTO result
  FROM public.webhook_endpoints
  WHERE id = p_endpoint_id;
  RETURN result;
END $$;

REVOKE ALL ON FUNCTION public.set_webhook_secret(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_webhook_secret(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_webhook_secret(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_webhook_secret(UUID) TO service_role;
