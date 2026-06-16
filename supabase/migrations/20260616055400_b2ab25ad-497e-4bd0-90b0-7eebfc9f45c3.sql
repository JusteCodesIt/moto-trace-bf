CREATE POLICY "owner_can_delete_device_channel" ON realtime.messages
FOR DELETE TO authenticated
USING (
  topic LIKE 'device:%'
  AND EXISTS (
    SELECT 1 FROM public.devices d
    WHERE d.id::text = split_part(topic, ':', 2)
      AND d.owner_id = auth.uid()
  )
);