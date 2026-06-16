-- ════════════════════════════════════════════════════════════════════════════
-- Fleet Scale Migration — 17 flottes × 750 engins (12 750 véhicules total)
--
-- Ce que ça résout par rapport au schéma naïf :
--
--   ① Démarrage O(1) : device_positions dénormalise la dernière position de
--     chaque engin. Un seul appel RPC get_fleet_positions() remplace les
--     750 requêtes parallèles sur telemetry.
--
--   ② Trigger de mise à jour : chaque INSERT dans telemetry déclenche un
--     UPSERT atomique dans device_positions. Lecture toujours O(1).
--
--   ③ RLS par propriétaire : JOIN sur devices.owner_id = auth.uid() → chaque
--     admin voit exclusivement sa flotte, sans paramètre explicite.
--
--   ④ Realtime ciblé : seule la table device_positions est publiée. Le
--     volume d'événements Realtime est ×N plus petit que telemetry (1 row
--     par device, pas 1 row par trame).
--
--   ⑤ Backfill à la migration : les engins déjà enregistrés sont pré-
--     chargés via DISTINCT ON afin que get_fleet_positions() réponde
--     immédiatement après le déploiement.
-- ════════════════════════════════════════════════════════════════════════════


-- ─── Table : device_positions ─────────────────────────────────────────────
-- Une seule ligne par engin, écrasée à chaque nouvelle trame — O(1) lecture.
CREATE TABLE IF NOT EXISTS public.device_positions (
  device_id      UUID             PRIMARY KEY
                                  REFERENCES public.devices(id) ON DELETE CASCADE,
  lat            DOUBLE PRECISION NOT NULL DEFAULT 0,
  lng            DOUBLE PRECISION NOT NULL DEFAULT 0,
  speed_kmh      REAL             NOT NULL DEFAULT 0,
  heading        SMALLINT         NOT NULL DEFAULT 0,
  altitude       REAL             NOT NULL DEFAULT 0,
  engine_on      BOOLEAN          NOT NULL DEFAULT false,
  battery_main   REAL             NOT NULL DEFAULT 0,
  battery_backup REAL             NOT NULL DEFAULT 0,
  gsm_bars       SMALLINT         NOT NULL DEFAULT 0,
  gsm_carrier    TEXT             NOT NULL DEFAULT '',
  gps_source     TEXT,
  recorded_at    TIMESTAMPTZ      NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ      NOT NULL DEFAULT now()
);

GRANT SELECT ON public.device_positions TO authenticated;
GRANT ALL    ON public.device_positions TO service_role;
ALTER TABLE public.device_positions ENABLE ROW LEVEL SECURITY;

-- Chaque admin voit seulement les positions de ses engins (via devices.owner_id)
CREATE POLICY "owner_select_positions"
  ON public.device_positions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.devices d
      WHERE d.id = device_positions.device_id
        AND d.owner_id = auth.uid()
    )
  );

-- Index de support pour le JOIN de la politique RLS
CREATE INDEX IF NOT EXISTS idx_device_positions_device
  ON public.device_positions(device_id);


-- ─── Trigger : fn_upsert_device_position ──────────────────────────────────
-- Déclenché AFTER INSERT sur telemetry → maintient device_positions à jour
-- en O(1) par trame. La clause WHERE EXCLUDED.recorded_at > … empêche les
-- trames arrivées en désordre d'écraser une trame plus récente.
CREATE OR REPLACE FUNCTION public.fn_upsert_device_position()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.device_positions (
    device_id,
    lat, lng, speed_kmh, heading, altitude,
    engine_on,
    battery_main, battery_backup,
    gsm_bars, gsm_carrier,
    gps_source,
    recorded_at, updated_at
  )
  VALUES (
    NEW.device_id,
    NEW.lat, NEW.lng,
    COALESCE(NEW.speed_kmh,     0),
    COALESCE(NEW.heading,       0),
    COALESCE(NEW.altitude,      0),
    COALESCE(NEW.engine_on,     false),
    COALESCE(NEW.battery_main,  0),
    COALESCE(NEW.battery_backup,0),
    COALESCE(NEW.gsm_bars,      0),
    COALESCE(NEW.gsm_carrier,   ''),
    NEW.gps_source,
    NEW.recorded_at,
    now()
  )
  ON CONFLICT (device_id) DO UPDATE
    SET lat            = EXCLUDED.lat,
        lng            = EXCLUDED.lng,
        speed_kmh      = EXCLUDED.speed_kmh,
        heading        = EXCLUDED.heading,
        altitude       = EXCLUDED.altitude,
        engine_on      = EXCLUDED.engine_on,
        battery_main   = EXCLUDED.battery_main,
        battery_backup = EXCLUDED.battery_backup,
        gsm_bars       = EXCLUDED.gsm_bars,
        gsm_carrier    = EXCLUDED.gsm_carrier,
        gps_source     = EXCLUDED.gps_source,
        recorded_at    = EXCLUDED.recorded_at,
        updated_at     = now()
    -- Ne pas réécrire si la trame entrante est plus ancienne (désordre réseau)
    WHERE EXCLUDED.recorded_at > device_positions.recorded_at;

  RETURN NEW;
END;
$$;

-- Supprimer le trigger existant s'il y en a un, puis le recréer
DROP TRIGGER IF EXISTS trg_upsert_device_position ON public.telemetry;
CREATE TRIGGER trg_upsert_device_position
  AFTER INSERT ON public.telemetry
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_upsert_device_position();


-- ─── RPC : get_fleet_positions() ──────────────────────────────────────────
-- Renvoie la dernière position de tous les engins de la flotte de l'admin
-- connecté en un seul round-trip. SECURITY DEFINER + auth.uid() garantit
-- l'isolation multi-tenant sans passer de paramètre.
CREATE OR REPLACE FUNCTION public.get_fleet_positions()
RETURNS TABLE (
  device_id      UUID,
  name           TEXT,
  is_online      BOOLEAN,
  lat            DOUBLE PRECISION,
  lng            DOUBLE PRECISION,
  speed_kmh      REAL,
  heading        SMALLINT,
  altitude       REAL,
  engine_on      BOOLEAN,
  battery_main   REAL,
  battery_backup REAL,
  gsm_bars       SMALLINT,
  gsm_carrier    TEXT,
  gps_source     TEXT,
  recorded_at    TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    dp.device_id,
    d.name,
    d.is_online,
    dp.lat,
    dp.lng,
    dp.speed_kmh,
    dp.heading,
    dp.altitude,
    dp.engine_on,
    dp.battery_main,
    dp.battery_backup,
    dp.gsm_bars,
    dp.gsm_carrier,
    dp.gps_source,
    dp.recorded_at
  FROM public.device_positions dp
  JOIN public.devices d ON d.id = dp.device_id
  WHERE d.owner_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.get_fleet_positions() TO authenticated;


-- ─── Realtime : activer la publication sur device_positions ───────────────
-- La Edge Function fleet-ws souscrit aux changements de cette table via
-- Supabase Realtime (postgres_changes). Sans cette ligne, les événements
-- ne sont pas émis.
ALTER PUBLICATION supabase_realtime ADD TABLE public.device_positions;


-- ─── Backfill : peupler device_positions depuis l'historique telemetry ────
-- Permet à get_fleet_positions() de répondre immédiatement après la migration
-- pour les engins qui ont déjà envoyé des trames.
INSERT INTO public.device_positions (
  device_id,
  lat, lng, speed_kmh, heading, altitude,
  engine_on, battery_main, battery_backup,
  gsm_bars, gsm_carrier, gps_source, recorded_at
)
SELECT DISTINCT ON (device_id)
  device_id,
  lat, lng,
  COALESCE(speed_kmh,     0),
  COALESCE(heading,       0),
  COALESCE(altitude,      0),
  COALESCE(engine_on,     false),
  COALESCE(battery_main,  0),
  COALESCE(battery_backup,0),
  COALESCE(gsm_bars,      0),
  COALESCE(gsm_carrier,   ''),
  gps_source,
  recorded_at
FROM public.telemetry
ORDER BY device_id, recorded_at DESC
ON CONFLICT (device_id) DO NOTHING;
