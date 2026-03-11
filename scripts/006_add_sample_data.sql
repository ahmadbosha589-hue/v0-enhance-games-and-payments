-- Add sample coupons
INSERT INTO public.coupons (code, reward_satoshis, description, expires_at, max_uses, is_active)
VALUES 
  ('WELCOME2024', 50, 'Welcome bonus for new users', '2025-12-31 23:59:59', 10000, true),
  ('BONUS100', 100, 'Special bonus code', '2025-06-30 23:59:59', 5000, true),
  ('FREEBTC', 25, 'Free Bitcoin reward', '2025-12-31 23:59:59', NULL, true),
  ('TWITTER50', 50, 'Twitter giveaway code', '2025-03-31 23:59:59', 1000, true),
  ('TELEGRAM25', 25, 'Telegram community code', '2025-12-31 23:59:59', 2000, true)
ON CONFLICT (code) DO NOTHING;

-- Add sample shortlinks
INSERT INTO public.shortlinks (title, destination_url, reward_satoshis, view_time_seconds, is_active)
VALUES 
  ('Bitcoin News', 'https://bitcoin.org/en/', 3, 10, true),
  ('Crypto Guide', 'https://www.coindesk.com/', 4, 15, true),
  ('Learn Bitcoin', 'https://learnmeabitcoin.com/', 5, 20, true),
  ('Lightning Network', 'https://lightning.network/', 3, 10, true),
  ('Blockchain Basics', 'https://www.blockchain.com/', 4, 15, true),
  ('Crypto Market', 'https://coinmarketcap.com/', 2, 8, true),
  ('Bitcoin Wiki', 'https://en.bitcoin.it/', 3, 12, true),
  ('Satoshi Paper', 'https://bitcoin.org/bitcoin.pdf', 5, 20, true)
ON CONFLICT DO NOTHING;
