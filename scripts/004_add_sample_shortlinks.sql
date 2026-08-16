-- Add sample shortlinks for users to visit
INSERT INTO public.shortlinks (title, destination_url, reward_satoshis, view_time_seconds, is_active) VALUES
  ('Crypto News Daily', 'https://bitcoin.org', 2, 10, true),
  ('Bitcoin Magazine', 'https://bitcoinmagazine.com', 3, 15, true),
  ('Blockchain Explorer', 'https://blockchain.com', 2, 10, true),
  ('Crypto Trading Tips', 'https://coinmarketcap.com', 4, 20, true),
  ('DeFi Updates', 'https://defipulse.com', 3, 15, true),
  ('NFT Gallery', 'https://opensea.io', 2, 10, true),
  ('Mining Guide', 'https://nicehash.com', 5, 25, true),
  ('Wallet Security', 'https://electrum.org', 3, 15, true),
  ('Market Analysis', 'https://coingecko.com', 4, 20, true),
  ('Tech Reviews', 'https://decrypt.co', 2, 10, true)
ON CONFLICT DO NOTHING;

-- Add sample coupons
INSERT INTO public.coupons (code, reward_satoshis, max_uses, is_active) VALUES
  ('WELCOME2024', 50, 10000, true),
  ('BITCOIN500', 100, 5000, true),
  ('SATOSHI100', 25, 20000, true),
  ('FAUCETFUN', 30, 15000, true),
  ('EARNMORE', 75, 8000, true)
ON CONFLICT (code) DO NOTHING;
