-- 100: Contact messages — real storage for the public contact form.

CREATE TABLE IF NOT EXISTS public.contact_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;

-- Anonymous visitors may submit (insert-only). Reading is service-role only.
DROP POLICY IF EXISTS "anon can submit contact messages" ON public.contact_messages;
CREATE POLICY "anon can submit contact messages"
  ON public.contact_messages
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    CHAR_LENGTH(name) BETWEEN 1 AND 100
    AND CHAR_LENGTH(email) BETWEEN 3 AND 254
    AND CHAR_LENGTH(subject) BETWEEN 1 AND 200
    AND CHAR_LENGTH(message) BETWEEN 1 AND 5000
  );

REVOKE ALL ON public.contact_messages FROM PUBLIC;
GRANT INSERT ON public.contact_messages TO anon, authenticated;
GRANT SELECT, UPDATE, DELETE ON public.contact_messages TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'contact_messages'
      AND indexname = 'idx_contact_messages_created_at'
  ) THEN
    CREATE INDEX idx_contact_messages_created_at
      ON public.contact_messages (created_at DESC);
  END IF;
END $$;
