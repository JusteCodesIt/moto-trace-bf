-- =============================================================================
-- PSH-03: Trigger to send push notifications for critical alerts
-- Uses pg_net to call the send-push edge function on critical alert inserts.
-- This ensures notifications are sent even if the app-level fire-and-forget fails.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.notify_critical_alert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id UUID;
  v_project_url TEXT;
  v_service_key TEXT;
BEGIN
  IF NEW.kind NOT IN ('imu_shock', 'imu_rollover', 'geofence_exit') THEN
    RETURN NEW;
  END IF;

  SELECT owner_id INTO v_owner_id
  FROM public.devices WHERE id = NEW.device_id;

  IF v_owner_id IS NULL THEN RETURN NEW; END IF;

  v_project_url := current_setting('app.settings.supabase_url', true);
  v_service_key := current_setting('app.settings.service_role_key', true);

  IF v_project_url IS NULL OR v_project_url = '' THEN RETURN NEW; END IF;

  PERFORM net.http_post(
    url     := v_project_url || '/functions/v1/send-push',
    body    := jsonb_build_object(
      'user_id', v_owner_id::text,
      'title', NEW.title,
      'body', COALESCE(NEW.message, ''),
      'tag', NEW.kind,
      'requireInteraction', true
    ),
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_service_key,
      'Content-Type', 'application/json'
    )
  );

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_critical_alert_push ON public.alerts;
CREATE TRIGGER trg_critical_alert_push
  AFTER INSERT ON public.alerts
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_critical_alert();
