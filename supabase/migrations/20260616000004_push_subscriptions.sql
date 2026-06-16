-- ═══════════════════════════════════════════════════════════════════════════
-- Migration : push_subscriptions
-- Objectif  : Stocker les abonnements Web Push VAPID par utilisateur.
--             Chaque user a au plus une subscription (UNIQUE user_id).
--             La Edge Function send-push lit cette table pour délivrer
--             les alertes de flotte en arrière-plan.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint   TEXT        NOT NULL,
  p256dh     TEXT        NOT NULL,
  auth       TEXT        NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_can_manage_push_sub"
  ON public.push_subscriptions
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT ALL ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;
