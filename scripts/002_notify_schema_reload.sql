-- Notify PostgREST to reload schema cache
-- This sends a NOTIFY to the pgrst channel which PostgREST listens to

-- First ensure the pgrst_watch function exists
CREATE OR REPLACE FUNCTION extensions.pgrst_ddl_watch()
RETURNS event_trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_notify('pgrst', 'reload schema');
END;
$$;

-- Send the reload notification
NOTIFY pgrst, 'reload schema';

-- Also try to refresh the schema cache by touching each table
-- This forces PostgREST to re-read the schema
DO $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN 
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_type = 'BASE TABLE'
  LOOP
    -- Analyze each table to update statistics
    EXECUTE 'ANALYZE public.' || quote_ident(tbl);
  END LOOP;
END;
$$;

-- Grant usage on schemas to ensure PostgREST can see them
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role;

-- Grant permissions on all existing tables
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;

-- Final notification
SELECT pg_notify('pgrst', 'reload schema');
