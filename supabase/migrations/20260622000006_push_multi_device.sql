-- =============================================================================
-- PSH-04: Support multiple push subscriptions per user (multi-device)
-- Change UNIQUE(user_id) to UNIQUE(user_id, endpoint)
-- =============================================================================

-- Drop old constraint if it exists
DO $$ BEGIN
  ALTER TABLE public.push_subscriptions DROP CONSTRAINT IF EXISTS push_subscriptions_user_id_key;
  ALTER TABLE public.push_subscriptions DROP CONSTRAINT IF EXISTS push_subscriptions_pkey;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

-- Ensure we have a proper primary key
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'push_subscriptions' AND constraint_type = 'PRIMARY KEY'
  ) THEN
    ALTER TABLE public.push_subscriptions ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();
    ALTER TABLE public.push_subscriptions ADD PRIMARY KEY (id);
  END IF;
END $$;

-- Add the new composite unique constraint
ALTER TABLE public.push_subscriptions
  DROP CONSTRAINT IF EXISTS push_subscriptions_user_endpoint_key;
ALTER TABLE public.push_subscriptions
  ADD CONSTRAINT push_subscriptions_user_endpoint_key UNIQUE (user_id, endpoint);
