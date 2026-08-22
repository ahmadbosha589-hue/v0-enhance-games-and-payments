-- 097: Admin audit trail — create admin_audit_logs and make it readable.
--
-- Funds-management actions already write here (app/api/admin/funds), but the
-- table never existed and no UI read it. This migration creates it with a
-- service-role-only posture; the Audit page merge ships in code.

CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS on; no client policies: reads/writes go through the service-role server.
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'admin_audit_logs'
      AND indexname = 'idx_admin_audit_logs_created_at'
  ) THEN
    CREATE INDEX idx_admin_audit_logs_created_at
      ON public.admin_audit_logs (created_at DESC);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'admin_audit_logs'
      AND indexname = 'idx_admin_audit_logs_admin_id'
  ) THEN
    CREATE INDEX idx_admin_audit_logs_admin_id
      ON public.admin_audit_logs (admin_id);
  END IF;
END $$;

REVOKE ALL ON public.admin_audit_logs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_audit_logs TO service_role;
