-- ═══════════════════════════════════════════════════════════════════════════
-- AutoTrack v3.1 - Score conducteur, webhooks, GraphQL automatique
--
-- 1) Extension pg_graphql : expose une API GraphQL auto-generee sur le schema
-- 2) Table driver_scores : scoring conducteur (chocs, freinages, nocturne)
-- 3) Tables webhook_endpoints / webhook_deliveries : intégrations partenaires
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Activation GraphQL natif Supabase ──────────────────────────────
-- Source : supabase/pg_graphql v1.5+ (apache 2.0 license)
CREATE EXTENSION IF NOT EXISTS pg_graphql;
-- L'endpoint GraphQL est automatiquement expose sur /graphql/v1 avec RLS.

-- ─── 2. Table driver_scores ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.driver_scores (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        UUID NOT NULL,
  driver_badge_id TEXT NOT NULL,                       -- FK soft vers driver_badges.badge_uid
  period_start    DATE NOT NULL,
  period_end      DATE NOT NULL,
  -- Composantes (toutes >= 0, plus c'est haut plus c'est mauvais)
  shock_count        INT  NOT NULL DEFAULT 0,
  hard_brake_count   INT  NOT NULL DEFAULT 0,
  hard_accel_count   INT  NOT NULL DEFAULT 0,
  rollover_count     INT  NOT NULL DEFAULT 0,
  night_minutes      INT  NOT NULL DEFAULT 0,          -- minutes 22h-04h
  overspeed_count    INT  NOT NULL DEFAULT 0,          -- depassements > 90 km/h
  km_driven          REAL NOT NULL DEFAULT 0.0,
  -- Score agrege normalise 0-100 (100 = comportement irreprochable)
  score              SMALLINT NOT NULL DEFAULT 100 CHECK (score BETWEEN 0 AND 100),
  computed_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_id, driver_badge_id, period_start, period_end)
);

ALTER TABLE public.driver_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_can_read_driver_scores"
  ON public.driver_scores FOR SELECT
  USING (owner_id = auth.uid());

GRANT SELECT ON public.driver_scores TO authenticated;
GRANT ALL    ON public.driver_scores TO service_role;

CREATE INDEX IF NOT EXISTS idx_driver_scores_badge_period
  ON public.driver_scores (driver_badge_id, period_end DESC);

-- ─── 3. Webhooks endpoints (intégration partenaires) ───────────────────
CREATE TABLE IF NOT EXISTS public.webhook_endpoints (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id   UUID NOT NULL,
  url        TEXT NOT NULL,
  secret     TEXT NOT NULL,                    -- HMAC-SHA256 shared secret
  events     TEXT[] NOT NULL DEFAULT '{}',     -- ex: {alert,anomaly,maintenance}
  active     BOOLEAN NOT NULL DEFAULT true,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.webhook_endpoints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_can_manage_webhooks"
  ON public.webhook_endpoints FOR ALL
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

GRANT ALL ON public.webhook_endpoints TO authenticated, service_role;

-- ─── 4. Webhooks deliveries (historique signe) ─────────────────────────
CREATE TABLE IF NOT EXISTS public.webhook_deliveries (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id  UUID NOT NULL REFERENCES public.webhook_endpoints(id) ON DELETE CASCADE,
  event_type   TEXT NOT NULL,
  payload      JSONB NOT NULL,
  status_code  INT,
  attempt      SMALLINT NOT NULL DEFAULT 1,
  delivered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  error_message TEXT
);

ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_can_read_webhook_deliveries"
  ON public.webhook_deliveries FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.webhook_endpoints e
    WHERE e.id = webhook_deliveries.endpoint_id AND e.owner_id = auth.uid()
  ));

GRANT SELECT ON public.webhook_deliveries TO authenticated;
GRANT ALL    ON public.webhook_deliveries TO service_role;

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_endpoint
  ON public.webhook_deliveries (endpoint_id, delivered_at DESC);

-- ─── 5. Conformité données (RGPD-like) ──────────────────────────────────
-- Table pour traquer les demandes d'export ou d'effacement
CREATE TABLE IF NOT EXISTS public.data_subject_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      UUID NOT NULL,
  request_type  TEXT NOT NULL CHECK (request_type IN ('export','erase')),
  status        TEXT NOT NULL CHECK (status IN ('pending','processing','completed','failed')) DEFAULT 'pending',
  requested_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at  TIMESTAMPTZ,
  export_url    TEXT,                                 -- URL signee S3-compatible
  notes         TEXT
);

ALTER TABLE public.data_subject_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_can_manage_dsr"
  ON public.data_subject_requests FOR ALL
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

GRANT ALL ON public.data_subject_requests TO authenticated, service_role;

-- ─── 6. Rotation automatique des secrets HMAC ──────────────────────────
ALTER TABLE public.device_keys
  ADD COLUMN IF NOT EXISTS next_rotation_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rotation_count   INT NOT NULL DEFAULT 0;

-- Helper : retourne true si la cle doit etre roulee (>90j depuis derniere rotation)
CREATE OR REPLACE FUNCTION public.fn_device_key_needs_rotation(p_device_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT (rotated_at < now() - interval '90 days')
     FROM device_keys WHERE device_id = p_device_id),
    true
  );
$$;
GRANT EXECUTE ON FUNCTION public.fn_device_key_needs_rotation(UUID) TO service_role;
