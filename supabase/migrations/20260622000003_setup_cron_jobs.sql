-- =============================================================================
-- FND-06: Setup pg_cron + pg_net and declare scheduled jobs
-- Without this, cron jobs don't exist after a clean project reset.
--
-- NOTE: SUPABASE_SERVICE_ROLE_KEY must be stored in vault or replaced
-- with the actual key in Supabase Dashboard > Database > Cron.
-- The jobs below use a placeholder that must be configured per-environment.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Helper: project URL from current_setting (set by Supabase automatically)
-- Falls back to empty string if not available
DO $$
DECLARE
  project_url TEXT;
  service_key TEXT;
BEGIN
  -- These will need to be set via Supabase Dashboard or vault
  project_url := current_setting('app.settings.supabase_url', true);
  service_key := current_setting('app.settings.service_role_key', true);

  IF project_url IS NULL OR project_url = '' THEN
    RAISE NOTICE 'app.settings.supabase_url not set — cron jobs must be configured manually in Supabase Dashboard';
    RETURN;
  END IF;

  -- rotate-hmac-keys: daily at 04:00 UTC
  PERFORM cron.schedule(
    'rotate-hmac-keys',
    '0 4 * * *',
    format(
      $$SELECT net.http_post('%s/functions/v1/rotate-hmac-keys', '{}'::jsonb, '{"Authorization":"Bearer %s"}'::jsonb)$$,
      project_url, service_key
    )
  );

  -- daily-maintenance-reminders: daily at 06:00 UTC
  PERFORM cron.schedule(
    'daily-maintenance-reminders',
    '0 6 * * *',
    format(
      $$SELECT net.http_post('%s/functions/v1/daily-maintenance-reminders', '{}'::jsonb, '{"Authorization":"Bearer %s"}'::jsonb)$$,
      project_url, service_key
    )
  );

  -- anomaly-detector: daily at 07:00 UTC
  PERFORM cron.schedule(
    'anomaly-detector',
    '0 7 * * *',
    format(
      $$SELECT net.http_post('%s/functions/v1/anomaly-detector', '{}'::jsonb, '{"Authorization":"Bearer %s"}'::jsonb)$$,
      project_url, service_key
    )
  );

  -- engine-score: weekly Monday 05:00 UTC
  PERFORM cron.schedule(
    'engine-score',
    '0 5 * * 1',
    format(
      $$SELECT net.http_post('%s/functions/v1/engine-score', '{}'::jsonb, '{"Authorization":"Bearer %s"}'::jsonb)$$,
      project_url, service_key
    )
  );

  -- webhooks-dispatch: every 2 minutes
  PERFORM cron.schedule(
    'webhooks-dispatch',
    '*/2 * * * *',
    format(
      $$SELECT net.http_post('%s/functions/v1/webhooks-dispatch', '{}'::jsonb, '{"Authorization":"Bearer %s"}'::jsonb)$$,
      project_url, service_key
    )
  );

END $$;
