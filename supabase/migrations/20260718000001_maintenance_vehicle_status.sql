-- ═══════════════════════════════════════════════════════════════════════════
-- Migration : maintenance_records + vehicle_status
-- Objectif  : Tables backend pour la page maintenance.tsx
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Table vehicle_status ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vehicle_status (
  device_id            UUID PRIMARY KEY REFERENCES public.devices(id) ON DELETE CASCADE,
  availability         TEXT NOT NULL DEFAULT 'available'
    CHECK (availability IN ('available','in_use','maintenance','broken','reserved')),
  total_km             REAL NOT NULL DEFAULT 0,
  avg_fuel_lph         REAL,
  engine_hours         REAL NOT NULL DEFAULT 0,
  last_maintenance_at  TIMESTAMPTZ,
  next_maintenance_at  TIMESTAMPTZ,
  notes                TEXT,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.vehicle_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_can_manage_vehicle_status"
  ON public.vehicle_status FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.devices d
    WHERE d.id = vehicle_status.device_id AND d.owner_id = auth.uid()
  ));

GRANT ALL ON public.vehicle_status TO authenticated;
GRANT ALL ON public.vehicle_status TO service_role;

-- ─── 2. Table maintenance_records ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.maintenance_records (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id       UUID NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  owner_id        UUID NOT NULL,
  record_type     TEXT NOT NULL DEFAULT 'maintenance'
    CHECK (record_type IN ('maintenance','repair','inspection','tire','oil')),
  title           TEXT NOT NULL,
  description     TEXT,
  cost_xof        INT NOT NULL DEFAULT 0,
  mileage_km      REAL,
  performed_at    DATE NOT NULL DEFAULT CURRENT_DATE,
  next_due_at     DATE,
  next_due_km     REAL,
  parts_replaced  TEXT[],
  garage          TEXT,
  status          TEXT NOT NULL DEFAULT 'completed'
    CHECK (status IN ('completed','pending','cancelled')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.maintenance_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_can_manage_maintenance_records"
  ON public.maintenance_records FOR ALL
  USING (owner_id = auth.uid());

CREATE INDEX idx_maintenance_records_device
  ON public.maintenance_records (device_id, performed_at DESC);

GRANT ALL ON public.maintenance_records TO authenticated;
GRANT ALL ON public.maintenance_records TO service_role;
