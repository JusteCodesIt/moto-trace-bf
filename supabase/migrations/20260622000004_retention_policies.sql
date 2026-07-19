-- =============================================================================
-- FND-07: Data retention policies via pg_cron
-- Purge old data to keep storage costs reasonable at fleet scale.
-- =============================================================================

-- (a) Purge telemetry older than 90 days — runs daily at 03:00 UTC
SELECT cron.schedule(
  'purge-telemetry-90d',
  '0 3 * * *',
  $$DELETE FROM public.telemetry WHERE recorded_at < now() - interval '90 days'$$
);

-- (b) Purge webhook_deliveries older than 30 days
SELECT cron.schedule(
  'purge-webhook-deliveries-30d',
  '10 3 * * *',
  $$DELETE FROM public.webhook_deliveries WHERE created_at < now() - interval '30 days'$$
);

-- (c) Purge expired share_links
SELECT cron.schedule(
  'purge-expired-share-links',
  '20 3 * * *',
  $$DELETE FROM public.share_links WHERE expires_at < now()$$
);

-- (d) Purge read alerts older than 60 days
SELECT cron.schedule(
  'purge-read-alerts-60d',
  '30 3 * * *',
  $$DELETE FROM public.alerts WHERE read = true AND created_at < now() - interval '60 days'$$
);

-- (e) Purge audit_logs older than 1 year
SELECT cron.schedule(
  'purge-audit-logs-1y',
  '40 3 * * *',
  $$DELETE FROM public.audit_logs WHERE created_at < now() - interval '1 year'$$
);
