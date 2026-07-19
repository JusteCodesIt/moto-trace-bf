CREATE TABLE public.share_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  device_id uuid NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  created_by uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX share_links_device_idx ON public.share_links(device_id);
CREATE INDEX share_links_token_idx ON public.share_links(token);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.share_links TO authenticated;
GRANT ALL ON public.share_links TO service_role;

ALTER TABLE public.share_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_select_share_links" ON public.share_links
  FOR SELECT TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY "owner_insert_share_links" ON public.share_links
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (SELECT 1 FROM public.devices d WHERE d.id = device_id AND d.owner_id = auth.uid())
  );

CREATE POLICY "owner_delete_share_links" ON public.share_links
  FOR DELETE TO authenticated
  USING (created_by = auth.uid());