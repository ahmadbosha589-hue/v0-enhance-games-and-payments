-- =====================================================
-- Script 035: Update Offerwalls
-- Add new high-revenue offerwalls: BitLabs, Ayet Studios, HangMyAds, Notik
-- Add missing offerwalls: offerwall.me, bicotasks
-- Remove OfferToro (duplicate of Torox)
-- =====================================================

-- Remove OfferToro (it's the same as Torox)
DELETE FROM public.offerwall_providers WHERE slug = 'offertoro';

-- Add new and missing offerwall providers
INSERT INTO public.offerwall_providers (name, slug, description, logo_url, conversion_rate, is_enabled, total_paid_satoshis) VALUES
  -- High Revenue Offerwalls
  ('BitLabs', 'bitlabs', 'Premium surveys and offers with high payouts. One of the highest-paying offerwalls available.', '/images/offerwalls/bitlabs.png', 1.0, true, 250000),
  ('Ayet Studios', 'ayet-studios', 'Top-tier mobile game offers and app downloads with excellent conversion rates.', '/images/offerwalls/ayet-studios.png', 1.0, true, 180000),
  ('HangMyAds', 'hang-my-ads', 'High-converting CPA offers with great payouts for surveys and app installs.', '/images/offerwalls/hang-my-ads.png', 1.0, true, 150000),
  ('Notik', 'notik', 'Premium offerwall with exclusive high-paying tasks and fast crediting.', '/images/offerwalls/notik.png', 1.0, true, 120000),
  -- Missing offerwalls
  ('Offerwall.me', 'offerwall-me', 'Multi-network offerwall aggregator with offers from multiple providers.', '/images/offerwalls/offerwall-me.png', 1.0, true, 85000),
  ('BicoTasks', 'bicotasks', 'Task-based earning platform with daily offers and bonuses.', '/images/offerwalls/bicotasks.png', 1.0, true, 65000)
ON CONFLICT (slug) DO UPDATE SET 
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  is_enabled = EXCLUDED.is_enabled;

-- Update existing offerwalls with better descriptions
UPDATE public.offerwall_providers SET 
  description = 'Complete high-paying surveys from trusted research companies. Average payout: 50-200 sats per survey.'
WHERE slug = 'cpx-research';

UPDATE public.offerwall_providers SET 
  description = 'Play mobile games, complete offers, and watch videos. Fast crediting and wide variety of tasks.'
WHERE slug = 'torox';

UPDATE public.offerwall_providers SET 
  description = 'Premium offerwall with the best mobile game offers. Great for earning while playing games you love.'
WHERE slug = 'lootably';

UPDATE public.offerwall_providers SET 
  description = 'Thousands of offers including surveys, app downloads, and sign-ups. Trusted by millions worldwide.'
WHERE slug = 'adgate';

UPDATE public.offerwall_providers SET 
  description = 'Complete simple tasks quickly for instant rewards. Great for beginners.'
WHERE slug = 'mm-wall';

UPDATE public.offerwall_providers SET 
  description = 'Earn passively by watching videos and completing timed tasks.'
WHERE slug = 'timewall';

UPDATE public.offerwall_providers SET 
  description = 'Premium CPA network with exclusive high-payout offers and reliable tracking.'
WHERE slug = 'adscend';
