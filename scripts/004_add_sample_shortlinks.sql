-- Add sample shortlinks for users to visit
INSERT INTO shortlinks (name, url, reward_satoshis, view_duration_seconds, is_active, daily_limit) VALUES
  ('Crypto News Daily', 'https://example.com/crypto-news', 2, 10, true, 1),
  ('Bitcoin Magazine', 'https://example.com/bitcoin-magazine', 3, 15, true, 1),
  ('Blockchain Explorer', 'https://example.com/blockchain', 2, 10, true, 1),
  ('Crypto Trading Tips', 'https://example.com/trading-tips', 4, 20, true, 1),
  ('DeFi Updates', 'https://example.com/defi', 3, 15, true, 1),
  ('NFT Gallery', 'https://example.com/nft-gallery', 2, 10, true, 1),
  ('Mining Guide', 'https://example.com/mining', 5, 25, true, 1),
  ('Wallet Security', 'https://example.com/wallet-security', 3, 15, true, 1),
  ('Market Analysis', 'https://example.com/market-analysis', 4, 20, true, 1),
  ('Tech Reviews', 'https://example.com/tech-reviews', 2, 10, true, 1)
ON CONFLICT DO NOTHING;

-- Add sample coupons
INSERT INTO coupons (code, reward_satoshis, description, expires_at, max_uses, is_active) VALUES
  ('WELCOME2024', 50, 'Welcome bonus for new users', '2025-12-31 23:59:59+00', 10000, true),
  ('BITCOIN500', 100, 'Bitcoin celebration bonus', '2025-06-30 23:59:59+00', 5000, true),
  ('SATOSHI100', 25, 'Community reward code', '2025-12-31 23:59:59+00', 20000, true),
  ('FAUCETFUN', 30, 'Fun faucet bonus', '2025-12-31 23:59:59+00', 15000, true),
  ('EARNMORE', 75, 'Earn more satoshis', '2025-12-31 23:59:59+00', 8000, true)
ON CONFLICT DO NOTHING;
