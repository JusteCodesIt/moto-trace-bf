
-- =====================================================
-- Trigger helper for updated_at
-- =====================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- =====================================================
-- devices
-- =====================================================
CREATE TABLE public.devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL,
  name TEXT NOT NULL DEFAULT 'MotoTrack',
  plate TEXT,
  firmware TEXT,
  pairing_code TEXT UNIQUE,
  last_seen_at TIMESTAMPTZ,
  is_online BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.devices TO authenticated;
GRANT ALL ON public.devices TO service_role;
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_select_devices" ON public.devices FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "owner_insert_devices" ON public.devices FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "owner_update_devices" ON public.devices FOR UPDATE TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "owner_delete_devices" ON public.devices FOR DELETE TO authenticated USING (owner_id = auth.uid());
CREATE TRIGGER trg_devices_updated BEFORE UPDATE ON public.devices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_devices_owner ON public.devices(owner_id);

-- =====================================================
-- device_keys (HMAC secrets) — never readable by clients
-- =====================================================
CREATE TABLE public.device_keys (
  device_id UUID PRIMARY KEY REFERENCES public.devices(id) ON DELETE CASCADE,
  hmac_secret TEXT NOT NULL,
  rotated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.device_keys TO service_role;
ALTER TABLE public.device_keys ENABLE ROW LEVEL SECURITY;
-- no policies for authenticated → invisible to clients

-- =====================================================
-- telemetry
-- =====================================================
CREATE TABLE public.telemetry (
  id BIGSERIAL PRIMARY KEY,
  device_id UUID NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  speed_kmh REAL,
  heading SMALLINT,
  altitude REAL,
  satellites SMALLINT,
  hdop REAL,
  battery_main REAL,
  battery_backup REAL,
  gsm_bars SMALLINT,
  gsm_carrier TEXT,
  engine_on BOOLEAN,
  accel_x REAL, accel_y REAL, accel_z REAL,
  raw JSONB
);
GRANT SELECT, INSERT ON public.telemetry TO authenticated;
GRANT USAGE ON SEQUENCE public.telemetry_id_seq TO authenticated;
GRANT ALL ON public.telemetry TO service_role;
GRANT ALL ON SEQUENCE public.telemetry_id_seq TO service_role;
ALTER TABLE public.telemetry ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_select_telemetry" ON public.telemetry FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.devices d WHERE d.id = telemetry.device_id AND d.owner_id = auth.uid()));
CREATE INDEX idx_telemetry_device_time ON public.telemetry(device_id, recorded_at DESC);

-- =====================================================
-- geofences
-- =====================================================
CREATE TABLE public.geofences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  shape TEXT NOT NULL CHECK (shape IN ('circle','rect')),
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  radius_m INTEGER NOT NULL DEFAULT 250,
  alert_on_exit BOOLEAN NOT NULL DEFAULT true,
  alert_on_enter BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.geofences TO authenticated;
GRANT ALL ON public.geofences TO service_role;
ALTER TABLE public.geofences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_all_geofences" ON public.geofences FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.devices d WHERE d.id = geofences.device_id AND d.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.devices d WHERE d.id = geofences.device_id AND d.owner_id = auth.uid()));
CREATE TRIGGER trg_geofences_updated BEFORE UPDATE ON public.geofences FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- alerts
-- =====================================================
CREATE TABLE public.alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('critical','warning','info')),
  title TEXT NOT NULL,
  message TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alerts TO authenticated;
GRANT ALL ON public.alerts TO service_role;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_all_alerts" ON public.alerts FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.devices d WHERE d.id = alerts.device_id AND d.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.devices d WHERE d.id = alerts.device_id AND d.owner_id = auth.uid()));
CREATE INDEX idx_alerts_device_time ON public.alerts(device_id, created_at DESC);

-- =====================================================
-- commands (queue for the device to poll)
-- =====================================================
CREATE TABLE public.commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('ping','reboot','low_power','wake','locate','rotate_key')),
  payload JSONB,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','ack','failed')),
  issued_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  ack_at TIMESTAMPTZ
);
GRANT SELECT, INSERT, UPDATE ON public.commands TO authenticated;
GRANT ALL ON public.commands TO service_role;
ALTER TABLE public.commands ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_select_commands" ON public.commands FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.devices d WHERE d.id = commands.device_id AND d.owner_id = auth.uid()));
CREATE POLICY "owner_insert_commands" ON public.commands FOR INSERT TO authenticated
  WITH CHECK (
    issued_by = auth.uid()
    AND EXISTS (SELECT 1 FROM public.devices d WHERE d.id = commands.device_id AND d.owner_id = auth.uid())
  );

-- =====================================================
-- Realtime publication
-- =====================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.telemetry;
ALTER PUBLICATION supabase_realtime ADD TABLE public.alerts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.devices;
ALTER PUBLICATION supabase_realtime ADD TABLE public.commands;
ALTER PUBLICATION supabase_realtime ADD TABLE public.geofences;

-- =====================================================
-- Helper: auto-update devices.last_seen_at / is_online when telemetry arrives
-- =====================================================
CREATE OR REPLACE FUNCTION public.touch_device_on_telemetry()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.devices
    SET last_seen_at = NEW.recorded_at, is_online = true, updated_at = now()
    WHERE id = NEW.device_id;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_telemetry_touch AFTER INSERT ON public.telemetry
  FOR EACH ROW EXECUTE FUNCTION public.touch_device_on_telemetry();
