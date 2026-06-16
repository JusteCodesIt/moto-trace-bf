-- ═══════════════════════════════════════════════════════════════════════════
-- Migration : vehicle_types
-- Objectif  : Système d'identification automatique des engins Faso Mebo
--             (FM-BUL-001, FM-CAB-003…) avec catégorisation par type.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Table de séquences par code type ─────────────────────────────────
-- Chaque ligne stocke le prochain numéro à attribuer pour un type donné.
-- L'incrémentation est atomique (INSERT … ON CONFLICT DO UPDATE) pour éviter
-- les doublons sous charge concurrente.

CREATE TABLE IF NOT EXISTS public.vehicle_type_sequences (
  type_code TEXT PRIMARY KEY,
  next_seq  INT  NOT NULL DEFAULT 1
);

GRANT ALL ON public.vehicle_type_sequences TO service_role;

-- ─── 2. Fonction d'attribution du prochain identifiant ───────────────────
-- Retourne une chaîne de la forme "FM-BUL-001".
-- L'opération INSERT … ON CONFLICT est exécutée dans un seul round-trip ;
-- le RETURNING récupère le numéro alloué *avant* incrémentation.

CREATE OR REPLACE FUNCTION public.fn_next_vehicle_id(p_type_code TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seq INT;
BEGIN
  -- Insère 2 si le type est nouveau (seq 1 alloué) ;
  -- sinon incrémente et retourne la valeur avant incrément.
  INSERT INTO public.vehicle_type_sequences (type_code, next_seq)
  VALUES (p_type_code, 2)
  ON CONFLICT (type_code) DO UPDATE
    SET next_seq = vehicle_type_sequences.next_seq + 1
  RETURNING next_seq - 1 INTO v_seq;

  RETURN 'FM-' || p_type_code || '-' || LPAD(v_seq::TEXT, 3, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_next_vehicle_id(TEXT) TO service_role;

-- ─── 3. Nouvelles colonnes sur la table devices ───────────────────────────

ALTER TABLE public.devices
  ADD COLUMN IF NOT EXISTS vehicle_type     TEXT,
  ADD COLUMN IF NOT EXISTS vehicle_category TEXT,
  ADD COLUMN IF NOT EXISTS internal_id      TEXT,
  ADD COLUMN IF NOT EXISTS vehicle_model    TEXT,
  ADD COLUMN IF NOT EXISTS vehicle_year     SMALLINT;

-- Index unique sur internal_id (autorise les NULL pour anciens engins)
CREATE UNIQUE INDEX IF NOT EXISTS idx_devices_internal_id
  ON public.devices (internal_id)
  WHERE internal_id IS NOT NULL;

-- ─── 4. Mise à jour du RPC get_fleet_positions() ─────────────────────────
-- Le type de retour change : DROP + CREATE nécessaire en PostgreSQL.

DROP FUNCTION IF EXISTS public.get_fleet_positions() CASCADE;

CREATE FUNCTION public.get_fleet_positions()
RETURNS TABLE (
  device_id        UUID,
  name             TEXT,
  is_online        BOOLEAN,
  vehicle_type     TEXT,
  vehicle_category TEXT,
  internal_id      TEXT,
  lat              DOUBLE PRECISION,
  lng              DOUBLE PRECISION,
  speed_kmh        REAL,
  heading          SMALLINT,
  altitude         REAL,
  engine_on        BOOLEAN,
  battery_main     REAL,
  battery_backup   REAL,
  gsm_bars         SMALLINT,
  gsm_carrier      TEXT,
  gps_source       TEXT,
  recorded_at      TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT dp.device_id,
         d.name,
         d.is_online,
         d.vehicle_type,
         d.vehicle_category,
         d.internal_id,
         dp.lat, dp.lng, dp.speed_kmh, dp.heading, dp.altitude,
         dp.engine_on, dp.battery_main, dp.battery_backup,
         dp.gsm_bars, dp.gsm_carrier, dp.gps_source, dp.recorded_at
  FROM   public.device_positions dp
  JOIN   public.devices d ON d.id = dp.device_id
  WHERE  d.owner_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.get_fleet_positions() TO authenticated;
