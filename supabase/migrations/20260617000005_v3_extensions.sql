-- ═══════════════════════════════════════════════════════════════════════════
-- AutoTrack v3.0 - Extensions automatisation
--
-- 1) telemetry : nouvelles colonnes J1939 + IMU
-- 2) geofence_states : suivi etat precedent (pour alert_on_enter symetrique)
-- 3) maintenance_reminders_sent : idempotence des notifications J-7 / J-1
--
-- Sources :
--   - SAE J1939-71 (SPN 110, 183, 190, 84) pour les colonnes telemetry
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Colonnes telemetry pour J1939 et IMU ────────────────────────────
ALTER TABLE public.telemetry
  ADD COLUMN IF NOT EXISTS engine_rpm        REAL,        -- PGN 61444 SPN 190
  ADD COLUMN IF NOT EXISTS engine_torque_pct SMALLINT,    -- PGN 61444 SPN 513
  ADD COLUMN IF NOT EXISTS coolant_temp_c    SMALLINT,    -- PGN 65262 SPN 110
  ADD COLUMN IF NOT EXISTS oil_temp_c        SMALLINT,    -- PGN 65262 SPN 175
  ADD COLUMN IF NOT EXISTS fuel_rate_lph     REAL,        -- PGN 65266 SPN 183
  ADD COLUMN IF NOT EXISTS fuel_total_l      REAL,        -- PGN 65266 SPN 250
  ADD COLUMN IF NOT EXISTS wheel_speed_kmh   REAL,        -- PGN 65265 SPN 84
  ADD COLUMN IF NOT EXISTS shock_count       SMALLINT,    -- MPU6050 shockCount()
  ADD COLUMN IF NOT EXISTS brake_count       SMALLINT,    -- MPU6050 brakeCount()
  ADD COLUMN IF NOT EXISTS accel_count       SMALLINT,    -- MPU6050 accelCount()
  ADD COLUMN IF NOT EXISTS rollover_count    SMALLINT,    -- MPU6050 rolloverCount()
  ADD COLUMN IF NOT EXISTS cellular_mode     TEXT
    CHECK (cellular_mode IS NULL OR cellular_mode IN ('CAT-M1','AUTO','GSM_2G'));

-- ─── 2. Table geofence_states (pour alert_on_enter symetrique) ─────────
CREATE TABLE IF NOT EXISTS public.geofence_states (
  device_id    UUID NOT NULL,
  geofence_id  UUID NOT NULL,
  inside       BOOLEAN NOT NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (device_id, geofence_id),
  FOREIGN KEY (device_id)   REFERENCES public.devices(id)   ON DELETE CASCADE,
  FOREIGN KEY (geofence_id) REFERENCES public.geofences(id) ON DELETE CASCADE
);

ALTER TABLE public.geofence_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_can_read_geofence_states"
  ON public.geofence_states FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.devices d
    WHERE d.id = geofence_states.device_id AND d.owner_id = auth.uid()
  ));

GRANT SELECT ON public.geofence_states TO authenticated;
GRANT ALL    ON public.geofence_states TO service_role;

-- ─── 3. Idempotence des rappels maintenance J-7 / J-1 ──────────────────
CREATE TABLE IF NOT EXISTS public.maintenance_reminders_sent (
  device_id   UUID NOT NULL,
  reminder_type TEXT NOT NULL CHECK (reminder_type IN ('J-7','J-1','OVERDUE')),
  target_date DATE NOT NULL,
  sent_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (device_id, reminder_type, target_date),
  FOREIGN KEY (device_id) REFERENCES public.devices(id) ON DELETE CASCADE
);

ALTER TABLE public.maintenance_reminders_sent ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_only"
  ON public.maintenance_reminders_sent FOR ALL
  USING (false);

GRANT ALL ON public.maintenance_reminders_sent TO service_role;
