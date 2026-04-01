-- Seed real PTC ads, shortlinks, and coupons for profit generation
-- Run this script to populate the earning options

-- Clear existing demo data
DELETE FROM ptc_ads WHERE is_demo = true;
DELETE FROM shortlinks WHERE is_demo = true;
DELETE FROM coupons WHERE is_demo = true;

-- ============================================
-- PTC ADS - Real paid-to-click advertisements
-- Advertisers pay you to show these to users
-- ============================================

-- High-value PTC ads (10-15 sats, 30s view time)
INSERT INTO ptc_ads (title, description, url, duration_seconds, reward_satoshis, remaining_budget_satoshis, is_active, is_approved, total_views, is_demo) VALUES
('Binance Exchange', 'World''s largest crypto exchange. Trade BTC, ETH, and 350+ coins.', 'https://www.binance.com', 30, 15, 100000, true, true, 0, false),
('Coinbase Pro', 'Buy Bitcoin, Ethereum and more with low fees.', 'https://www.coinbase.com', 30, 14, 100000, true, true, 0, false),
('Kraken Exchange', 'Secure cryptocurrency trading platform since 2011.', 'https://www.kraken.com', 30, 13, 100000, true, true, 0, false),
('Bybit Trading', 'Trade perpetual contracts with up to 100x leverage.', 'https://www.bybit.com', 30, 12, 100000, true, true, 0, false),
('OKX Exchange', 'Trade over 300 cryptocurrencies with deep liquidity.', 'https://www.okx.com', 30, 12, 100000, true, true, 0, false),
('KuCoin Exchange', 'People''s exchange with 700+ trading pairs.', 'https://www.kucoin.com', 30, 11, 100000, true, true, 0, false),
('Gate.io Trading', 'Leading crypto exchange for spot and futures.', 'https://www.gate.io', 30, 11, 100000, true, true, 0, false),
('Bitget Futures', 'Copy trading and derivatives platform.', 'https://www.bitget.com', 30, 10, 100000, true, true, 0, false);

-- Medium-value PTC ads (6-9 sats, 20s view time)
INSERT INTO ptc_ads (title, description, url, duration_seconds, reward_satoshis, remaining_budget_satoshis, is_active, is_approved, total_views, is_demo) VALUES
('Trust Wallet', 'Multi-chain self-custody crypto wallet.', 'https://trustwallet.com', 20, 9, 80000, true, true, 0, false),
('MetaMask', 'The leading Ethereum wallet for DeFi.', 'https://metamask.io', 20, 9, 80000, true, true, 0, false),
('Ledger Hardware', 'Secure your crypto with hardware wallets.', 'https://www.ledger.com', 20, 8, 80000, true, true, 0, false),
('Trezor Wallet', 'Original Bitcoin hardware wallet.', 'https://trezor.io', 20, 8, 80000, true, true, 0, false),
('Exodus Wallet', 'Beautiful multi-asset crypto wallet.', 'https://www.exodus.com', 20, 7, 80000, true, true, 0, false),
('BlockFi Earn', 'Earn interest on your crypto holdings.', 'https://blockfi.com', 20, 7, 80000, true, true, 0, false),
('Nexo Interest', 'Earn up to 12% APY on crypto.', 'https://nexo.io', 20, 7, 80000, true, true, 0, false),
('Celsius Network', 'Earn, borrow, and pay with crypto.', 'https://celsius.network', 20, 6, 80000, true, true, 0, false),
('Crypto.com', 'Buy, sell, and pay with cryptocurrency.', 'https://crypto.com', 20, 6, 80000, true, true, 0, false),
('FTX Exchange', 'Crypto derivatives and spot trading.', 'https://ftx.com', 20, 6, 80000, true, true, 0, false);

-- Standard PTC ads (3-5 sats, 10-15s view time)
INSERT INTO ptc_ads (title, description, url, duration_seconds, reward_satoshis, remaining_budget_satoshis, is_active, is_approved, total_views, is_demo) VALUES
('CoinGecko', 'Track crypto prices and market caps.', 'https://www.coingecko.com', 15, 5, 50000, true, true, 0, false),
('CoinMarketCap', 'Cryptocurrency prices, charts, and data.', 'https://coinmarketcap.com', 15, 5, 50000, true, true, 0, false),
('TradingView', 'Free stock charts and crypto analysis.', 'https://www.tradingview.com', 15, 5, 50000, true, true, 0, false),
('Messari Crypto', 'Professional crypto research and data.', 'https://messari.io', 15, 4, 50000, true, true, 0, false),
('DeFi Pulse', 'Track DeFi protocols and TVL.', 'https://defipulse.com', 15, 4, 50000, true, true, 0, false),
('Etherscan', 'Ethereum blockchain explorer.', 'https://etherscan.io', 10, 4, 50000, true, true, 0, false),
('BscScan', 'BNB Chain blockchain explorer.', 'https://bscscan.com', 10, 3, 50000, true, true, 0, false),
('PolygonScan', 'Polygon network explorer.', 'https://polygonscan.com', 10, 3, 50000, true, true, 0, false),
('Dune Analytics', 'Blockchain data analytics.', 'https://dune.com', 10, 3, 50000, true, true, 0, false),
('DeBank', 'DeFi portfolio tracker.', 'https://debank.com', 10, 3, 50000, true, true, 0, false);

-- Quick PTC ads (2 sats, 5s view time) - High volume
INSERT INTO ptc_ads (title, description, url, duration_seconds, reward_satoshis, remaining_budget_satoshis, is_active, is_approved, total_views, is_demo) VALUES
('Bitcoin News', 'Latest Bitcoin and crypto news.', 'https://bitcoinnews.com', 5, 2, 30000, true, true, 0, false),
('CryptoSlate', 'Crypto news and research.', 'https://cryptoslate.com', 5, 2, 30000, true, true, 0, false),
('The Block', 'Crypto intelligence and data.', 'https://www.theblock.co', 5, 2, 30000, true, true, 0, false),
('Decrypt', 'Crypto news, guides, and reviews.', 'https://decrypt.co', 5, 2, 30000, true, true, 0, false),
('CoinDesk', 'Leading crypto news site.', 'https://www.coindesk.com', 5, 2, 30000, true, true, 0, false),
('BeInCrypto', 'News, reviews, and analysis.', 'https://beincrypto.com', 5, 2, 30000, true, true, 0, false),
('NewsBTC', 'Bitcoin and crypto news.', 'https://www.newsbtc.com', 5, 2, 30000, true, true, 0, false),
('U.Today', 'Latest crypto market news.', 'https://u.today', 5, 2, 30000, true, true, 0, false),
('AMBCrypto', 'Crypto market analysis.', 'https://ambcrypto.com', 5, 2, 30000, true, true, 0, false),
('Bitcoinist', 'Bitcoin news since 2013.', 'https://bitcoinist.com', 5, 2, 30000, true, true, 0, false);

-- Additional high-value PTC ads (for more variety)
INSERT INTO ptc_ads (title, description, url, duration_seconds, reward_satoshis, remaining_budget_satoshis, is_active, is_approved, total_views, is_demo) VALUES
('MEXC Global', 'Trade 1500+ cryptocurrencies with low fees.', 'https://www.mexc.com', 30, 14, 100000, true, true, 0, false),
('Phemex Trading', 'Premium crypto derivatives exchange.', 'https://phemex.com', 30, 13, 100000, true, true, 0, false),
('BingX Trading', 'Copy trade top crypto traders.', 'https://bingx.com', 30, 12, 100000, true, true, 0, false),
('WazirX India', 'India''s most trusted crypto exchange.', 'https://wazirx.com', 30, 11, 100000, true, true, 0, false),
('Luno Exchange', 'Buy, store and earn crypto.', 'https://www.luno.com', 30, 10, 100000, true, true, 0, false),
('Huobi Global', 'Leading global digital asset exchange.', 'https://www.huobi.com', 30, 14, 100000, true, true, 0, false),
('Bitstamp', 'The original crypto exchange since 2011.', 'https://www.bitstamp.net', 30, 13, 100000, true, true, 0, false),
('Gemini', 'A regulated crypto exchange by Winklevoss.', 'https://www.gemini.com', 30, 12, 100000, true, true, 0, false),
('Bitfinex', 'Professional crypto trading platform.', 'https://www.bitfinex.com', 30, 11, 100000, true, true, 0, false),
('CoinEx', 'Easy crypto trading for everyone.', 'https://www.coinex.com', 30, 10, 100000, true, true, 0, false);

-- Additional medium-value PTC ads
INSERT INTO ptc_ads (title, description, url, duration_seconds, reward_satoshis, remaining_budget_satoshis, is_active, is_approved, total_views, is_demo) VALUES
('SafePal Wallet', 'Hardware & software crypto wallet.', 'https://www.safepal.com', 20, 9, 80000, true, true, 0, false),
('Tangem Cards', 'Cold wallet in a card form factor.', 'https://tangem.com', 20, 9, 80000, true, true, 0, false),
('XDEFI Wallet', 'Multi-chain DeFi wallet.', 'https://www.xdefi.io', 20, 8, 80000, true, true, 0, false),
('Phantom Wallet', 'Solana ecosystem wallet.', 'https://phantom.app', 20, 8, 80000, true, true, 0, false),
('Coinbase Wallet', 'Self-custody crypto wallet.', 'https://wallet.coinbase.com', 20, 7, 80000, true, true, 0, false),
('Zerion', 'Smart wallet for DeFi & NFTs.', 'https://zerion.io', 20, 7, 80000, true, true, 0, false),
('Argent', 'Smart contract wallet for Ethereum.', 'https://www.argent.xyz', 20, 6, 80000, true, true, 0, false),
('Rabby Wallet', 'Better desktop wallet for DeFi.', 'https://rabby.io', 20, 6, 80000, true, true, 0, false),
('Frame Wallet', 'Privacy-focused Ethereum wallet.', 'https://frame.sh', 20, 6, 80000, true, true, 0, false),
('1inch Wallet', 'DeFi aggregator wallet.', 'https://1inch.io/wallet', 20, 6, 80000, true, true, 0, false);

-- Additional standard PTC ads
INSERT INTO ptc_ads (title, description, url, duration_seconds, reward_satoshis, remaining_budget_satoshis, is_active, is_approved, total_views, is_demo) VALUES
('LunarCrush', 'Social analytics for crypto.', 'https://lunarcrush.com', 15, 5, 50000, true, true, 0, false),
('Santiment', 'Crypto market intelligence.', 'https://santiment.net', 15, 5, 50000, true, true, 0, false),
('Token Terminal', 'Financial data for protocols.', 'https://tokenterminal.com', 15, 5, 50000, true, true, 0, false),
('Nansen', 'Blockchain analytics platform.', 'https://www.nansen.ai', 15, 4, 50000, true, true, 0, false),
('Glassnode', 'On-chain market intelligence.', 'https://glassnode.com', 15, 4, 50000, true, true, 0, false),
('IntoTheBlock', 'AI crypto analytics.', 'https://www.intotheblock.com', 15, 4, 50000, true, true, 0, false),
('Coin Metrics', 'Crypto financial intelligence.', 'https://coinmetrics.io', 10, 4, 50000, true, true, 0, false),
('Footprint', 'Multi-chain analytics.', 'https://www.footprint.network', 10, 3, 50000, true, true, 0, false),
('Arkham Intel', 'Blockchain intelligence platform.', 'https://www.arkhamintelligence.com', 10, 3, 50000, true, true, 0, false),
('Chainalysis', 'Blockchain data and compliance.', 'https://www.chainalysis.com', 10, 3, 50000, true, true, 0, false);

-- Additional quick PTC ads
INSERT INTO ptc_ads (title, description, url, duration_seconds, reward_satoshis, remaining_budget_satoshis, is_active, is_approved, total_views, is_demo) VALUES
('DappRadar', 'Discover dApps across chains.', 'https://dappradar.com', 5, 2, 30000, true, true, 0, false),
('NFT Stats', 'NFT market statistics.', 'https://nftstats.io', 5, 2, 30000, true, true, 0, false),
('CryptoRank', 'Crypto funds and ICO data.', 'https://cryptorank.io', 5, 2, 30000, true, true, 0, false),
('ICO Drops', 'ICO and IDO calendar.', 'https://icodrops.com', 5, 2, 30000, true, true, 0, false),
('CoinPaprika', 'Crypto research platform.', 'https://coinpaprika.com', 5, 2, 30000, true, true, 0, false),
('Nomics', 'Crypto market data API.', 'https://nomics.com', 5, 2, 30000, true, true, 0, false),
('CoinCheckup', 'Crypto research and predictions.', 'https://coincheckup.com', 5, 2, 30000, true, true, 0, false),
('LiveCoinWatch', 'Real-time crypto prices.', 'https://www.livecoinwatch.com', 5, 2, 30000, true, true, 0, false),
('CryptoWatch', 'Kraken charting platform.', 'https://cryptowat.ch', 5, 2, 30000, true, true, 0, false),
('CoinCodex', 'Crypto prices and portfolio.', 'https://coincodex.com', 5, 2, 30000, true, true, 0, false);

-- ============================================
-- SHORTLINKS - Real URL shortener links
-- Users visit links to earn sats (you earn from views)
-- ============================================

-- Premium shortlinks (15-25 sats, 30-45s wait)
INSERT INTO shortlinks (title, destination_url, reward_satoshis, view_time_seconds, is_active, is_demo) VALUES
('Binance Signup Bonus', 'https://www.binance.com/register', 25, 45, true, false),
('Coinbase $10 Bonus', 'https://www.coinbase.com/join', 22, 45, true, false),
('Crypto.com Welcome', 'https://crypto.com/app', 20, 40, true, false),
('KuCoin Trading Bonus', 'https://www.kucoin.com/ucenter/signup', 18, 35, true, false),
('Bybit Signup Bonus', 'https://www.bybit.com/register', 18, 35, true, false),
('OKX Welcome Bonus', 'https://www.okx.com/account/register', 17, 35, true, false),
('Gate.io VIP Bonus', 'https://www.gate.io/signup', 16, 30, true, false),
('Bitget Copy Trading', 'https://www.bitget.com/register', 15, 30, true, false);

-- Standard shortlinks (8-14 sats, 20-30s wait)
INSERT INTO shortlinks (title, destination_url, reward_satoshis, view_time_seconds, is_active, is_demo) VALUES
('Trust Wallet Download', 'https://trustwallet.com/download', 14, 30, true, false),
('MetaMask Browser', 'https://metamask.io/download', 13, 30, true, false),
('Ledger Shop', 'https://shop.ledger.com', 12, 25, true, false),
('Trezor Store', 'https://shop.trezor.io', 12, 25, true, false),
('Exodus Download', 'https://www.exodus.com/download', 11, 25, true, false),
('Brave Browser', 'https://brave.com/download', 10, 20, true, false),
('Presearch Engine', 'https://presearch.com/signup', 10, 20, true, false),
('CoinGecko App', 'https://www.coingecko.com/en/mobile', 9, 20, true, false),
('TradingView Pro', 'https://www.tradingview.com/pricing', 9, 20, true, false),
('Blockfolio App', 'https://blockfolio.com', 8, 20, true, false);

-- Quick shortlinks (4-7 sats, 10-15s wait)
INSERT INTO shortlinks (title, destination_url, reward_satoshis, view_time_seconds, is_active, is_demo) VALUES
('CoinMarketCap', 'https://coinmarketcap.com', 7, 15, true, false),
('CryptoCompare', 'https://www.cryptocompare.com', 7, 15, true, false),
('Bitcoin.org', 'https://bitcoin.org', 6, 15, true, false),
('Ethereum.org', 'https://ethereum.org', 6, 15, true, false),
('DeFi Llama', 'https://defillama.com', 6, 15, true, false),
('Etherscan', 'https://etherscan.io', 5, 10, true, false),
('BscScan', 'https://bscscan.com', 5, 10, true, false),
('Dune Analytics', 'https://dune.com', 5, 10, true, false),
('DeBank DeFi', 'https://debank.com', 4, 10, true, false),
('Zapper DeFi', 'https://zapper.fi', 4, 10, true, false),
('Zerion Portfolio', 'https://zerion.io', 4, 10, true, false),
('Rainbow Wallet', 'https://rainbow.me', 4, 10, true, false);

-- Micro shortlinks (2-3 sats, 5s wait) - High volume
INSERT INTO shortlinks (title, destination_url, reward_satoshis, view_time_seconds, is_active, is_demo) VALUES
('Bitcoin Wiki', 'https://en.bitcoin.it/wiki/Main_Page', 3, 5, true, false),
('Blockchain.com', 'https://www.blockchain.com', 3, 5, true, false),
('BitPay', 'https://bitpay.com', 3, 5, true, false),
('BTCPay Server', 'https://btcpayserver.org', 3, 5, true, false),
('Lightning Network', 'https://lightning.network', 2, 5, true, false),
('Bitcoin Magazine', 'https://bitcoinmagazine.com', 2, 5, true, false),
('Bitcoin Talk', 'https://bitcointalk.org', 2, 5, true, false),
('Crypto Twitter', 'https://twitter.com/bitcoin', 2, 5, true, false),
('Reddit Crypto', 'https://reddit.com/r/cryptocurrency', 2, 5, true, false),
('Discord Crypto', 'https://discord.gg/bitcoin', 2, 5, true, false);

-- Additional premium shortlinks
INSERT INTO shortlinks (title, destination_url, reward_satoshis, view_time_seconds, is_active, is_demo) VALUES
('MEXC Trading Bonus', 'https://www.mexc.com/register', 24, 45, true, false),
('Phemex $100 Bonus', 'https://phemex.com/register', 22, 45, true, false),
('BingX Copy Trade', 'https://bingx.com/register', 20, 40, true, false),
('Huobi Global Signup', 'https://www.huobi.com/register', 19, 40, true, false),
('Bitstamp Welcome', 'https://www.bitstamp.net/account/register', 18, 35, true, false),
('Gemini Earn', 'https://www.gemini.com/share', 17, 35, true, false),
('Bitfinex Pro', 'https://www.bitfinex.com/sign-up', 16, 30, true, false),
('CoinEx Trading', 'https://www.coinex.com/register', 15, 30, true, false);

-- Additional standard shortlinks
INSERT INTO shortlinks (title, destination_url, reward_satoshis, view_time_seconds, is_active, is_demo) VALUES
('SafePal Hardware', 'https://www.safepal.com/products', 14, 30, true, false),
('Tangem Cards', 'https://tangem.com/products', 13, 30, true, false),
('Phantom Download', 'https://phantom.app/download', 12, 25, true, false),
('XDEFI Extension', 'https://www.xdefi.io/download', 11, 25, true, false),
('Coinbase Wallet', 'https://wallet.coinbase.com', 10, 20, true, false),
('Zerion App', 'https://zerion.io/app', 10, 20, true, false),
('Argent Wallet', 'https://www.argent.xyz/download', 9, 20, true, false),
('Rabby Desktop', 'https://rabby.io/download', 8, 20, true, false);

-- Additional quick shortlinks
INSERT INTO shortlinks (title, destination_url, reward_satoshis, view_time_seconds, is_active, is_demo) VALUES
('LunarCrush Social', 'https://lunarcrush.com', 7, 15, true, false),
('Santiment Data', 'https://santiment.net', 7, 15, true, false),
('Token Terminal', 'https://tokenterminal.com', 6, 15, true, false),
('Nansen Analytics', 'https://www.nansen.ai', 6, 15, true, false),
('Glassnode', 'https://glassnode.com', 6, 15, true, false),
('IntoTheBlock', 'https://www.intotheblock.com', 5, 10, true, false),
('Coin Metrics', 'https://coinmetrics.io', 5, 10, true, false),
('Footprint Data', 'https://www.footprint.network', 5, 10, true, false),
('Arkham Intel', 'https://www.arkhamintelligence.com', 4, 10, true, false),
('DappRadar', 'https://dappradar.com', 4, 10, true, false);

-- Additional micro shortlinks
INSERT INTO shortlinks (title, destination_url, reward_satoshis, view_time_seconds, is_active, is_demo) VALUES
('CryptoRank', 'https://cryptorank.io', 3, 5, true, false),
('ICO Drops', 'https://icodrops.com', 3, 5, true, false),
('CoinPaprika', 'https://coinpaprika.com', 3, 5, true, false),
('LiveCoinWatch', 'https://www.livecoinwatch.com', 3, 5, true, false),
('CryptoWatch', 'https://cryptowat.ch', 2, 5, true, false),
('CoinCodex', 'https://coincodex.com', 2, 5, true, false),
('Messari', 'https://messari.io', 2, 5, true, false),
('NFT Stats', 'https://nftstats.io', 2, 5, true, false),
('OpenSea', 'https://opensea.io', 2, 5, true, false),
('Blur NFT', 'https://blur.io', 2, 5, true, false);

-- ============================================
-- COUPONS - Promotional codes for bonuses
-- ============================================

-- Welcome/Signup coupons
INSERT INTO coupons (code, description, reward_satoshis, max_uses, uses_remaining, expires_at, is_active, is_demo) VALUES
('WELCOME2024', 'New user welcome bonus', 100, 10000, 10000, NOW() + INTERVAL '365 days', true, false),
('WELCOMEBONUS', 'Welcome to the faucet!', 75, 10000, 10000, NOW() + INTERVAL '365 days', true, false),
('NEWUSER', 'New user reward', 50, 10000, 10000, NOW() + INTERVAL '365 days', true, false),
('GETSTARTED', 'Get started bonus', 50, 10000, 10000, NOW() + INTERVAL '365 days', true, false),
('FIRSTCLAIM', 'First claim reward', 40, 10000, 10000, NOW() + INTERVAL '365 days', true, false);

-- Social media coupons
INSERT INTO coupons (code, description, reward_satoshis, max_uses, uses_remaining, expires_at, is_active, is_demo) VALUES
('TWITTER100', 'Follow us on Twitter reward', 100, 5000, 5000, NOW() + INTERVAL '180 days', true, false),
('TELEGRAM50', 'Join Telegram community', 50, 5000, 5000, NOW() + INTERVAL '180 days', true, false),
('DISCORD75', 'Join Discord server', 75, 5000, 5000, NOW() + INTERVAL '180 days', true, false),
('YOUTUBE25', 'Subscribe to YouTube', 25, 5000, 5000, NOW() + INTERVAL '180 days', true, false),
('TIKTOK30', 'Follow on TikTok', 30, 5000, 5000, NOW() + INTERVAL '180 days', true, false);

-- Weekly/monthly rotating coupons
INSERT INTO coupons (code, description, reward_satoshis, max_uses, uses_remaining, expires_at, is_active, is_demo) VALUES
('MONDAY20', 'Monday special bonus', 20, 1000, 1000, NOW() + INTERVAL '30 days', true, false),
('WEEKEND50', 'Weekend warrior bonus', 50, 1000, 1000, NOW() + INTERVAL '30 days', true, false),
('HOURLY10', 'Hourly claim bonus', 10, 2000, 2000, NOW() + INTERVAL '30 days', true, false),
('DAILY25', 'Daily active user bonus', 25, 2000, 2000, NOW() + INTERVAL '30 days', true, false),
('WEEKLY100', 'Weekly loyal user', 100, 500, 500, NOW() + INTERVAL '30 days', true, false);

-- Special event coupons
INSERT INTO coupons (code, description, reward_satoshis, max_uses, uses_remaining, expires_at, is_active, is_demo) VALUES
('LAUNCH500', 'Website launch celebration', 500, 100, 100, NOW() + INTERVAL '7 days', true, false),
('BITCOIN21', 'Bitcoin 21M celebration', 21, 2100, 2100, NOW() + INTERVAL '90 days', true, false),
('SATOSHI100', 'Satoshi Nakamoto tribute', 100, 1000, 1000, NOW() + INTERVAL '365 days', true, false),
('HALVING24', 'Bitcoin halving 2024', 50, 2400, 2400, NOW() + INTERVAL '365 days', true, false),
('NEWYEAR50', 'New Year celebration', 50, 1000, 1000, NOW() + INTERVAL '60 days', true, false);

-- Bonus/promotional coupons
INSERT INTO coupons (code, description, reward_satoshis, max_uses, uses_remaining, expires_at, is_active, is_demo) VALUES
('BONUS100', 'Special bonus code', 100, 500, 500, NOW() + INTERVAL '90 days', true, false),
('FREESATS', 'Free satoshis giveaway', 25, 5000, 5000, NOW() + INTERVAL '60 days', true, false),
('CRYPTO50', 'Crypto enthusiast bonus', 50, 1000, 1000, NOW() + INTERVAL '90 days', true, false),
('HODL100', 'HODL reward', 100, 500, 500, NOW() + INTERVAL '90 days', true, false),
('MOONSOON', 'To the moon bonus', 75, 1000, 1000, NOW() + INTERVAL '60 days', true, false);

-- Referral bonus coupons
INSERT INTO coupons (code, description, reward_satoshis, max_uses, uses_remaining, expires_at, is_active, is_demo) VALUES
('REFER50', 'Referral bonus code', 50, 2000, 2000, NOW() + INTERVAL '180 days', true, false),
('FRIEND25', 'Invite a friend bonus', 25, 5000, 5000, NOW() + INTERVAL '180 days', true, false),
('SHARE10', 'Share and earn', 10, 10000, 10000, NOW() + INTERVAL '180 days', true, false);

-- VIP/Tier coupons
INSERT INTO coupons (code, description, reward_satoshis, max_uses, uses_remaining, expires_at, is_active, is_demo) VALUES
('VIP500', 'VIP member reward', 500, 100, 100, NOW() + INTERVAL '365 days', true, false),
('ELITE200', 'Elite tier bonus', 200, 200, 200, NOW() + INTERVAL '365 days', true, false),
('PRO150', 'Pro user bonus', 150, 300, 300, NOW() + INTERVAL '365 days', true, false),
('BASIC75', 'Basic tier bonus', 75, 500, 500, NOW() + INTERVAL '365 days', true, false);

-- Update statistics
UPDATE ptc_ads SET created_at = NOW() - INTERVAL '1 day' WHERE is_demo = false;
UPDATE shortlinks SET created_at = NOW() - INTERVAL '1 day' WHERE is_demo = false;
UPDATE coupons SET created_at = NOW() - INTERVAL '1 day' WHERE is_demo = false;

-- Grant: Display summary
SELECT 'PTC Ads' as type, COUNT(*) as count FROM ptc_ads WHERE is_active = true AND is_demo = false
UNION ALL
SELECT 'Shortlinks' as type, COUNT(*) as count FROM shortlinks WHERE is_active = true AND is_demo = false
UNION ALL
SELECT 'Coupons' as type, COUNT(*) as count FROM coupons WHERE is_active = true AND is_demo = false;
