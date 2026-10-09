-- 113: ad_network_configs — the encrypted ad-network credential store.
--
-- WHY THIS EXISTS: the table previously lived only in the standalone,
-- unnumbered scripts/create-ad-network-tables.sql, which the migration
-- runner never executes. Admin → Ads → Networks therefore upserted into a
-- nonexistent table in production and every save failed with a 500,
-- leaving the enable switch permanently locked. This migration makes the
-- table part of the tracked schema. It is idempotent: a database that
-- already ran the standalone script simply verifies + adds the updated_by
-- column if missing.

CREATE TABLE IF NOT EXISTS public.ad_network_configs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  network_id TEXT NOT NULL UNIQUE,
  encrypted_config TEXT NOT NULL,
  enabled BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

-- Some deployments created the table without updated_by (the admin UI
-- records who last touched a config). Add it defensively.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ad_network_configs'
      AND column_name = 'updated_by'
  ) THEN
    NULL; -- column already present
  ELSE
    ALTER TABLE public.ad_network_configs
      ADD COLUMN updated_by UUID REFERENCES auth.users(id);
  END IF;
END $$;

-- RLS on; the service-role server does all reads/writes.
ALTER TABLE public.ad_network_configs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ad_network_configs'
      AND policyname = 'Admins can manage ad network configs'
  ) THEN
    CREATE POLICY "Admins can manage ad network configs"
      ON public.ad_network_configs
      FOR ALL
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
          AND profiles.role IN ('admin', 'superadmin')
        )
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ad_network_configs_network_id
  ON public.ad_network_configs (network_id);
CREATE INDEX IF NOT EXISTS idx_ad_network_configs_enabled
  ON public.ad_network_configs (enabled);

REVOKE ALL ON public.ad_network_configs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ad_network_configs TO service_role;
