
-- Realtime channel authorization
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner_can_read_device_channel" ON realtime.messages;
CREATE POLICY "owner_can_read_device_channel"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.devices d
    WHERE d.owner_id = auth.uid()
      AND realtime.topic() = 'device:' || d.id::text
  )
);

-- Tighten commands insert: enforce safe initial state
DROP POLICY IF EXISTS "owner_insert_commands" ON public.commands;
CREATE POLICY "owner_insert_commands"
ON public.commands
FOR INSERT
TO authenticated
WITH CHECK (
  issued_by = auth.uid()
  AND status = 'pending'
  AND sent_at IS NULL
  AND ack_at IS NULL
  AND EXISTS (
    SELECT 1 FROM public.devices d
    WHERE d.id = commands.device_id AND d.owner_id = auth.uid()
  )
);
