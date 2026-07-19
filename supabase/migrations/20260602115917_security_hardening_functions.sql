
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_device_on_telemetry() FROM PUBLIC, anon, authenticated;
-- device_keys: explicit deny policy to satisfy linter while keeping no client access
CREATE POLICY "no_client_access_device_keys" ON public.device_keys FOR ALL TO authenticated USING (false) WITH CHECK (false);
