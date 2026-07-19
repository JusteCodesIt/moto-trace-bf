-- =============================================================================
-- Security corrections migration (SEC-04, SEC-05, SEC-06, FND-10, FND-11, FND-12)
-- =============================================================================

-- SEC-04: Add WITH CHECK to owner_update_devices to prevent owner_id transfer
DROP POLICY IF EXISTS "owner_update_devices" ON public.devices;
CREATE POLICY "owner_update_devices" ON public.devices
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- SEC-05: Enable RLS on vehicle_type_sequences
ALTER TABLE IF EXISTS public.vehicle_type_sequences ENABLE ROW LEVEL SECURITY;
-- Only service_role should manipulate sequences
DROP POLICY IF EXISTS "service_role_manage_sequences" ON public.vehicle_type_sequences;

-- SEC-06: Fix policies from TO PUBLIC to TO authenticated
-- push_subscriptions
DO $$ BEGIN
  DROP POLICY IF EXISTS "owner_can_manage_push_sub" ON public.push_subscriptions;
  CREATE POLICY "owner_can_manage_push_sub"
    ON public.push_subscriptions
    FOR ALL TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- engine_scores
DO $$ BEGIN
  DROP POLICY IF EXISTS "owner_select_engine_scores" ON public.engine_scores;
  CREATE POLICY "owner_select_engine_scores"
    ON public.engine_scores
    FOR SELECT TO authenticated
    USING (owner_id = auth.uid());
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- webhook_endpoints
DO $$ BEGIN
  DROP POLICY IF EXISTS "owner_manage_webhook_endpoints" ON public.webhook_endpoints;
  CREATE POLICY "owner_manage_webhook_endpoints"
    ON public.webhook_endpoints
    FOR ALL TO authenticated
    USING (owner_id = auth.uid())
    WITH CHECK (owner_id = auth.uid());
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- webhook_deliveries: read-only for authenticated (via endpoint ownership)
DO $$ BEGIN
  DROP POLICY IF EXISTS "owner_select_webhook_deliveries" ON public.webhook_deliveries;
  CREATE POLICY "owner_select_webhook_deliveries"
    ON public.webhook_deliveries
    FOR SELECT TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM public.webhook_endpoints we
        WHERE we.id = webhook_deliveries.endpoint_id
          AND we.owner_id = auth.uid()
      )
    );
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- data_subject_requests
DO $$ BEGIN
  DROP POLICY IF EXISTS "owner_manage_dsr" ON public.data_subject_requests;
  CREATE POLICY "owner_manage_dsr"
    ON public.data_subject_requests
    FOR ALL TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- FND-10: Remove GRANT INSERT on telemetry for authenticated (all inserts via service_role)
REVOKE INSERT ON public.telemetry FROM authenticated;

-- FND-11: Add WITH CHECK to owner_update_commands
DO $$ BEGIN
  DROP POLICY IF EXISTS "owner_update_commands" ON public.commands;
  CREATE POLICY "owner_update_commands"
    ON public.commands
    FOR UPDATE TO authenticated
    USING (issued_by = auth.uid())
    WITH CHECK (issued_by = auth.uid());
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- FND-12: Restrict push_subscriptions to INSERT, DELETE only (no SELECT of keys)
DO $$ BEGIN
  REVOKE ALL ON public.push_subscriptions FROM authenticated;
  GRANT INSERT, DELETE ON public.push_subscriptions TO authenticated;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;
