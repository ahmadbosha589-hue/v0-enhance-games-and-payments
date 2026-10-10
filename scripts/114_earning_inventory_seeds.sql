-- 114: Earning inventory seeds (PTC ads, shortlinks, coupons).
--
-- The standalone scripts/seed-ptc-shortlinks-coupons.sql is NEVER executed by
-- the migration runner (scripts/migrate.mjs picks only 071-099 and 1xx files),
-- so production databases migrated with the runner had zero PTC ads,
-- shortlinks, and coupons. This migration ports the real (is_demo = false)
-- rows, idempotently, preserving the exact reward/duration numbers.
--
-- Idempotency: dedupe on the natural key of each table (url / destination_url
-- / description+reward+max_uses) so re-running or re-seeding never duplicates.

-- ============================================================================
-- PTC ADS — real paid-to-click advertisements (multi-tier pricing)
-- ============================================================================
INSERT INTO public.ptc_ads (title, description, url, duration_seconds, reward_satoshis, remaining_budget_satoshis, is_active, is_approved, is_demo)
SELECT v.title, v.description, v.url, v.duration, v.reward, v.budget, true, true, false
FROM (VALUES
  -- High-value tier (30s, 10-15 sats)
  ('Binance Exchange', 'World''s largest crypto exchange. Trade BTC, ETH, and 350+ coins.', 'https://www.binance.com', 30, 15, 100000),
  ('Coinbase Pro', 'Buy Bitcoin, Ethereum and more with low fees.', 'https://www.coinbase.com', 30, 14, 100000),
  ('Kraken Exchange', 'Secure cryptocurrency trading platform since 2011.', 'https://www.kraken.com', 30, 13, 100000),
  ('Bybit Trading', 'Trade perpetual contracts with up to 100x leverage.', 'https://www.bybit.com', 30, 12, 100000),
  ('OKX Exchange', 'Trade over 300 cryptocurrencies with deep liquidity.', 'https://www.okx.com', 30, 12, 100000),
  ('KuCoin Exchange', 'People''s exchange with 700+ trading pairs.', 'https://www.kucoin.com', 30, 11, 100000),
  ('Gate.io Trading', 'Leading crypto exchange for spot and futures.', 'https://www.gate.io', 30, 11, 100000),
  ('Bitget Futures', 'Copy trading and derivatives platform.', 'https://www.bitget.com', 30, 10, 100000),
  -- Medium tier (20s, 6-9 sats)
  ('Trust Wallet', 'Multi-chain self-custody crypto wallet.', 'https://trustwallet.com', 20, 9, 80000),
  ('MetaMask', 'The leading Ethereum wallet for DeFi.', 'https://metamask.io', 20, 9, 80000),
  ('Ledger Hardware', 'Secure your crypto with hardware wallets.', 'https://www.ledger.com', 20, 8, 80000),
  ('Trezor Wallet', 'Original Bitcoin hardware wallet.', 'https://trezor.io', 20, 8, 80000),
  ('Exodus Wallet', 'Beautiful multi-asset crypto wallet.', 'https://www.exodus.com', 20, 7, 80000),
  ('Nexo Interest', 'Earn up to 12% APY on crypto.', 'https://nexo.io', 20, 7, 80000),
  ('Crypto.com', 'Buy, sell, and pay with cryptocurrency.', 'https://crypto.com', 20, 6, 80000),
  -- Standard tier (10-15s, 3-5 sats)
  ('CoinGecko', 'Track crypto prices and market caps.', 'https://www.coingecko.com', 15, 5, 50000),
  ('CoinMarketCap', 'Cryptocurrency prices, charts, and data.', 'https://coinmarketcap.com', 15, 5, 50000),
  ('TradingView', 'Free stock charts and crypto analysis.', 'https://www.tradingview.com', 15, 5, 50000),
  ('Messari Crypto', 'Professional crypto research and data.', 'https://messari.io', 15, 4, 50000),
  ('DeFi Pulse', 'Track DeFi protocols and TVL.', 'https://defipulse.com', 15, 4, 50000),
  ('Etherscan', 'Ethereum blockchain explorer.', 'https://etherscan.io', 10, 4, 50000),
  ('BscScan', 'BNB Chain blockchain explorer.', 'https://bscscan.com', 10, 3, 50000),
  ('PolygonScan', 'Polygon network explorer.', 'https://polygonscan.com', 10, 3, 50000),
  -- Quick tier (5s, 2 sats)
  ('Bitcoin News', 'Latest Bitcoin and crypto news.', 'https://bitcoinnews.com', 5, 2, 30000),
  ('CryptoSlate', 'Crypto news and research.', 'https://cryptoslate.com', 5, 2, 30000),
  ('The Block', 'Crypto intelligence and data.', 'https://www.theblock.co', 5, 2, 30000),
  ('Decrypt', 'Crypto news, guides, and reviews.', 'https://decrypt.co', 5, 2, 30000),
  ('CoinDesk', 'Leading crypto news site.', 'https://www.coindesk.com', 5, 2, 30000),
  ('BeInCrypto', 'News, reviews, and analysis.', 'https://beincrypto.com', 5, 2, 30000),
  ('NewsBTC', 'Bitcoin and crypto news.', 'https://www.newsbtc.com', 5, 2, 30000),
  ('U.Today', 'Latest crypto market news.', 'https://u.today', 5, 2, 30000),
  ('AMBCrypto', 'Crypto market analysis.', 'https://ambcrypto.com', 5, 2, 30000),
  ('Bitcoinist', 'Bitcoin news since 2013.', 'https://bitcoinist.com', 5, 2, 30000),
  -- Additional exchanges (high-value tier)
  ('MEXC Global', 'Trade 1500+ cryptocurrencies with low fees.', 'https://www.mexc.com', 30, 14, 100000),
  ('Phemex Trading', 'Premium crypto derivatives exchange.', 'https://phemex.com', 30, 13, 100000),
  ('BingX Trading', 'Copy trade top crypto traders.', 'https://bingx.com', 30, 12, 100000),
  ('WazirX India', 'India''s most trusted crypto exchange.', 'https://wazirx.com', 30, 11, 100000),
  ('Luno Exchange', 'Buy, store and earn crypto.', 'https://www.luno.com', 30, 10, 100000),
  ('Huobi Global', 'Leading global digital asset exchange.', 'https://www.huobi.com', 30, 14, 100000),
  ('Bitstamp', 'The original crypto exchange since 2011.', 'https://www.bitstamp.net', 30, 13, 100000),
  ('Gemini', 'A regulated crypto exchange by Winklevoss.', 'https://www.gemini.com', 30, 12, 100000),
  ('Bitfinex', 'Professional crypto trading platform.', 'https://www.bitfinex.com', 30, 11, 100000),
  ('CoinEx', 'Easy crypto trading for everyone.', 'https://www.coinex.com', 30, 10, 100000),
  -- Additional wallets (medium tier)
  ('SafePal Wallet', 'Hardware & software crypto wallet.', 'https://www.safepal.com', 20, 9, 80000),
  ('Tangem Cards', 'Cold wallet in a card form factor.', 'https://tangem.com', 20, 9, 80000),
  ('XDEFI Wallet', 'Multi-chain DeFi wallet.', 'https://www.xdefi.io', 20, 8, 80000),
  ('Phantom Wallet', 'Solana ecosystem wallet.', 'https://phantom.app', 20, 8, 80000),
  ('Coinbase Wallet', 'Self-custody crypto wallet.', 'https://wallet.coinbase.com', 20, 7, 80000),
  ('Zerion', 'Smart wallet for DeFi & NFTs.', 'https://zerion.io', 20, 7, 80000),
  ('Argent', 'Smart contract wallet for Ethereum.', 'https://www.argent.xyz', 20, 6, 80000),
  ('Rabby Wallet', 'Better desktop wallet for DeFi.', 'https://rabby.io', 20, 6, 80000)
) AS v(title, description, url, duration, reward, budget)
WHERE NOT EXISTS (SELECT 1 FROM public.ptc_ads WHERE url = v.url);

-- ============================================================================
-- SHORTLINKS — real destinations (multi-tier pricing)
-- ============================================================================
INSERT INTO public.shortlinks (title, destination_url, reward_satoshis, view_time_seconds, is_active, is_demo)
SELECT v.title, v.url, v.reward, v.wait, true, false
FROM (VALUES
  -- High-value tier (30-45s wait, 15-25 sats)
  ('Binance Signup Bonus', 'https://www.binance.com/register', 25, 45),
  ('Coinbase $10 Bonus', 'https://www.coinbase.com/join', 22, 45),
  ('Crypto.com Welcome', 'https://crypto.com/app', 20, 40),
  ('KuCoin Trading Bonus', 'https://www.kucoin.com/ucenter/signup', 18, 35),
  ('Bybit Signup Bonus', 'https://www.bybit.com/register', 18, 35),
  ('OKX Welcome Bonus', 'https://www.okx.com/account/register', 17, 35),
  ('Gate.io VIP Bonus', 'https://www.gate.io/signup', 16, 30),
  ('Bitget Copy Trading', 'https://www.bitget.com/register', 15, 30),
  -- Standard tier (20-30s wait, 9-14 sats)
  ('Trust Wallet Download', 'https://trustwallet.com/download', 14, 30),
  ('MetaMask Browser', 'https://metamask.io/download', 13, 30),
  ('Ledger Shop', 'https://shop.ledger.com', 12, 25),
  ('Trezor Store', 'https://shop.trezor.io', 12, 25),
  ('Exodus Download', 'https://www.exodus.com/download', 11, 25),
  ('Brave Browser', 'https://brave.com/download', 10, 20),
  ('Presearch Engine', 'https://presearch.com/signup', 10, 20),
  ('CoinGecko App', 'https://www.coingecko.com/en/mobile', 9, 20),
  ('TradingView Pro', 'https://www.tradingview.com/pricing', 9, 20),
  -- Quick tier (5s wait, 2-3 sats)
  ('CryptoRank', 'https://cryptorank.io', 3, 5),
  ('ICO Drops', 'https://icodrops.com', 3, 5),
  ('CoinPaprika', 'https://coinpaprika.com', 3, 5),
  ('LiveCoinWatch', 'https://www.livecoinwatch.com', 3, 5),
  ('CryptoWatch', 'https://cryptowat.ch', 2, 5),
  ('CoinCodex', 'https://coincodex.com', 2, 5),
  ('Messari', 'https://messari.io', 2, 5),
  ('NFT Stats', 'https://nftstats.io', 2, 5),
  ('OpenSea', 'https://opensea.io', 2, 5),
  ('Blur NFT', 'https://blur.io', 2, 5)
) AS v(title, url, reward, wait)
WHERE NOT EXISTS (SELECT 1 FROM public.shortlinks WHERE destination_url = v.url);

-- ============================================================================
-- COUPONS — promotional codes with secure 12-character random codes.
-- The generator function lives only in the standalone seed file, so define it
-- here too (CREATE OR REPLACE is idempotent).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.generate_secure_coupon_code()
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result TEXT := '';
  i INTEGER;
BEGIN
  FOR i IN 1..12 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

INSERT INTO public.coupons (code, description, reward_satoshis, max_uses, uses_remaining, expires_at, is_active, is_demo)
SELECT public.generate_secure_coupon_code(), v.description, v.reward, v.max_uses, v.max_uses, NOW() + (v.expires_days || ' days')::interval, true, false
FROM (VALUES
  ('New user welcome bonus', 100, 100, 365),
  ('Welcome to the faucet!', 75, 100, 365),
  ('New user reward', 50, 100, 365),
  ('Get started bonus', 50, 100, 365),
  ('7 day streak reward', 70, 50, 365),
  ('30 day streak reward', 300, 15, 365),
  ('100 day streak reward', 1000, 5, 365),
  ('Active user reward', 30, 50, 90),
  ('Affiliate member bonus', 60, 25, 180),
  ('Basic tier bonus', 75, 25, 365),
  ('Beta tester reward', 100, 10, 60),
  ('Bitcoin 21M celebration', 21, 100, 90),
  ('Bitcoin halving celebration', 50, 100, 365),
  ('Bitcoin to 100K celebration', 100, 25, 365),
  ('BNB Chain bonus', 35, 40, 180),
  ('Bug report bonus', 200, 3, 365)
) AS v(description, reward, max_uses, expires_days)
CROSS JOIN LATERAL generate_series(1, CASE WHEN v.max_uses <= 100 THEN 5 ELSE 2 END)
WHERE NOT EXISTS (
  SELECT 1 FROM public.coupons c
  WHERE c.description = v.description
    AND c.reward_satoshis = v.reward
    AND c.max_uses = v.max_uses
);
