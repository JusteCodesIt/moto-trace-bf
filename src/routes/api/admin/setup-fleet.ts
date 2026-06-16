// Route one-shot — applique la migration fleet_scale (device_positions + trigger + RPC).
// SUPPRIMER ce fichier après la première exécution réussie.
//
// Appel depuis la console navigateur (une fois connecté comme admin) :
//
//   const { data: { session } } = await supabase.auth.getSession();
//   const r = await fetch('/api/admin/setup-fleet', {
//     method: 'POST',
//     headers: { Authorization: `Bearer ${session.access_token}` }
//   });
//   console.log(await r.json());

import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// ── DDL complet de la migration fleet_scale ────────────────────────────────

const MIGRATION_SQL = /* sql */`

-- ─── device_positions : dernière position par engin, O(1) ────────────────
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

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'device_positions' AND policyname = 'owner_select_positions'
  ) THEN
    ALTER TABLE public.device_positions ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "owner_select_positions"
      ON public.device_positions FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.devices d
          WHERE d.id = device_positions.device_id
            AND d.owner_id = auth.uid()
        )
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_device_positions_device
  ON public.device_positions(device_id);

-- ─── Trigger : maintient device_positions à jour sur chaque INSERT telemetry
CREATE OR REPLACE FUNCTION public.fn_upsert_device_position()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.device_positions (
    device_id, lat, lng, speed_kmh, heading, altitude,
    engine_on, battery_main, battery_backup,
    gsm_bars, gsm_carrier, gps_source, recorded_at, updated_at
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
    WHERE EXCLUDED.recorded_at > device_positions.recorded_at;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_upsert_device_position ON public.telemetry;
CREATE TRIGGER trg_upsert_device_position
  AFTER INSERT ON public.telemetry
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_upsert_device_position();

-- ─── RPC : toutes les positions de la flotte en un seul round-trip ────────
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
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT dp.device_id, d.name, d.is_online,
         dp.lat, dp.lng, dp.speed_kmh, dp.heading, dp.altitude,
         dp.engine_on, dp.battery_main, dp.battery_backup,
         dp.gsm_bars, dp.gsm_carrier, dp.gps_source, dp.recorded_at
  FROM public.device_positions dp
  JOIN public.devices d ON d.id = dp.device_id
  WHERE d.owner_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.get_fleet_positions() TO authenticated;

-- ─── Realtime : active les événements sur device_positions ────────────────
DO $$ BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.device_positions;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

-- ─── Backfill : charge l'historique existant dans device_positions ─────────
INSERT INTO public.device_positions (
  device_id, lat, lng, speed_kmh, heading, altitude,
  engine_on, battery_main, battery_backup,
  gsm_bars, gsm_carrier, gps_source, recorded_at
)
SELECT DISTINCT ON (device_id)
  device_id, lat, lng,
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

`;

// ── Helper ─────────────────────────────────────────────────────────────────

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// ── Route ──────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/api/admin/setup-fleet")({
  component: () => null,
  server: {
    handlers: {
      POST: async ({ request }) => {
        // ① Vérifier que l'appelant est un utilisateur Supabase authentifié
        const token = request.headers.get("authorization")?.replace(/^bearer\s+/i, "");
        if (!token) return json({ error: "unauthorized" }, 401);

        const { data: { user }, error: authErr } =
          await supabaseAdmin.auth.getUser(token);
        if (authErr || !user) return json({ error: "unauthorized" }, 401);

        // ② Appeler pg-meta depuis le Worker (côté serveur — clé jamais exposée)
        const supabaseUrl = (process.env.SUPABASE_URL ?? "").replace(/\/$/, "");
        const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

        if (!supabaseUrl || !serviceKey) {
          return json({ error: "missing_server_env" }, 500);
        }

        let pgBody = "";
        let pgStatus = 0;
        try {
          const pgRes = await fetch(`${supabaseUrl}/pg-meta/v1/query`, {
            method: "POST",
            headers: {
              Authorization:  `Bearer ${serviceKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ query: MIGRATION_SQL }),
          });
          pgStatus = pgRes.status;
          pgBody   = await pgRes.text();

          if (!pgRes.ok) {
            return json({ error: "pg_meta_failed", status: pgStatus, detail: pgBody }, 500);
          }
        } catch (err) {
          return json({ error: "fetch_failed", detail: String(err) }, 500);
        }

        return json({
          ok: true,
          message: "Migration fleet_scale appliquée avec succès.",
          user: user.email,
        });
      },
    },
  },
});
