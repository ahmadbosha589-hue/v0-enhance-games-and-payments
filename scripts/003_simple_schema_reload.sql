-- Simple schema cache reload for PostgREST
-- This just sends the NOTIFY signal without modifying any functions

-- Send the pgrst reload signal
NOTIFY pgrst, 'reload schema';

-- Verify tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;
