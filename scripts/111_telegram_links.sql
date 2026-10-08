-- 073_add_telegram_links.sql
--
-- Backing tables for the Telegram bot integration
-- (app/api/telegram/webhook/route.ts).
--
-- telegram_links      : chat_id <-> user_id mapping (the bot's /link command)
-- profiles additions  : telegram_chat_id + a one-time telegram_link_token the
--                       user generates in Dashboard -> Settings and sends to
--                       the bot with /link <token>

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT,
  ADD COLUMN IF NOT EXISTS telegram_link_token TEXT;

COMMENT ON COLUMN public.profiles.telegram_chat_id IS 'Linked Telegram chat id (set by the bot /link command)';
COMMENT ON COLUMN public.profiles.telegram_link_token IS 'One-time token used to link a Telegram chat; nulled after use';

CREATE INDEX IF NOT EXISTS idx_profiles_telegram_link_token
  ON public.profiles(telegram_link_token)
  WHERE telegram_link_token IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.telegram_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  linked_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_telegram_links_user ON public.telegram_links(user_id);

ALTER TABLE public.telegram_links ENABLE ROW LEVEL SECURITY;

-- Users can see their own links; writes go through the service role (the bot).
CREATE POLICY "Users can view own telegram links" ON public.telegram_links
  FOR SELECT USING (auth.uid() = user_id);
