CREATE TABLE IF NOT EXISTS public.schema_migrations (
  filename   TEXT PRIMARY KEY,
  checksum   TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
