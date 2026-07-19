
ALTER TABLE public.telemetry ADD COLUMN IF NOT EXISTS gps_source TEXT;

DROP POLICY IF EXISTS "owner_update_commands" ON public.commands;
CREATE POLICY "owner_update_commands"
ON public.commands FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.devices d WHERE d.id = commands.device_id AND d.owner_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.devices d WHERE d.id = commands.device_id AND d.owner_id = auth.uid()));

DROP POLICY IF EXISTS "owner_delete_commands" ON public.commands;
CREATE POLICY "owner_delete_commands"
ON public.commands FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.devices d WHERE d.id = commands.device_id AND d.owner_id = auth.uid()));

DROP POLICY IF EXISTS "owner_can_publish_device_channel" ON realtime.messages;
CREATE POLICY "owner_can_publish_device_channel"
ON realtime.messages FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.devices d
    WHERE d.owner_id = auth.uid()
      AND realtime.topic() = 'device:' || d.id::text
  )
);

DROP POLICY IF EXISTS "owner_can_update_device_channel" ON realtime.messages;
CREATE POLICY "owner_can_update_device_channel"
ON realtime.messages FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.devices d
    WHERE d.owner_id = auth.uid()
      AND realtime.topic() = 'device:' || d.id::text
  )
);
