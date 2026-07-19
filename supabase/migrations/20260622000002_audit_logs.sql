-- =============================================================================
-- FND-05: Create audit_logs table
-- Referenced by ingest.ts and rotate-hmac-keys but previously inserted into void
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id          BIGSERIAL    PRIMARY KEY,
  user_id     UUID,
  action      TEXT         NOT NULL,
  resource    TEXT,
  device_id   UUID,
  metadata    JSONB,
  ip          TEXT,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

GRANT ALL ON public.audit_logs TO service_role;
GRANT ALL ON SEQUENCE public.audit_logs_id_seq TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Only service_role can write; no authenticated access (admin reads via server function)
-- No policies for authenticated = invisible to clients

CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON public.audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_device ON public.audit_logs(device_id) WHERE device_id IS NOT NULL;
