-- 116: Tournaments auto-seed + offerwall provider rows.
--
-- Two production gaps fixed here:
-- 1. Tournaments only ever existed after an admin clicked "create" in
--    /admin/tournaments (app/api/tournaments/route.ts POST), so a fresh
--    deployment showed an empty public page. This seeds the canonical
--    configs (mirroring TOURNAMENT_CONFIGS) for the CURRENT periods,
--    idempotently. The daily cron (vercel.json → finalize_tournament at
--    03:00 UTC) completes them; the next period's rows are seeded here once
--    per migration — re-runs are deduped by the unique_tournament constraint.
-- 2. app/api/postback/[provider]/route.ts:931 reads each provider's
--    conversion_rate from offerwall_providers and 500s when the row is
--    missing (the comment references a nonexistent
--    scripts/095_ccxua_and_provider_seeds.sql). This upserts ALL 22 provider
--    slugs with the sats-per-$1 conversion rates shown in the UI
--    (app/api/offerwalls/route.ts conversionRate fields).
--    NOTE: rows are seeded is_enabled = true — going live for users still
--    requires each wall's env vars (API key + postback secret); the route
--    fails closed with "Setup Required" until then.

-- ============================================================================
-- 1. Offerwall provider rows — ALL 22 slugs, conversion_rate = sats per $1.
-- ============================================================================
INSERT INTO public.offerwall_providers (name, slug, description, conversion_rate, is_enabled)
VALUES
  ('C.cx.ua', 'ccxua', 'Faucet-native offerwall with PTC clicks.', 1000, true),
  ('CPX Research', 'cpx-research', 'Complete surveys and earn satoshis. High-paying surveys from top brands.', 1000, true),
  ('Torox', 'torox', 'Complete offers, download apps, and watch videos to earn rewards.', 950, true),
  ('AdGate Media', 'adgatemedia', 'Trusted offerwall with thousands of offers worldwide.', 950, true),
  ('Lootably', 'lootably', 'Premium offerwall with high-converting offers and fast payouts.', 1000, true),
  ('BitLabs', 'bitlabs', 'Survey wall with instant credited rewards.', 1000, true),
  ('Notik', 'notik', 'Coins for offers and surveys with fast crediting.', 850, true),
  ('Timewall', 'timewall', 'Watch videos and complete tasks to earn rewards over time.', 800, true),
  ('aYeT Studios', 'ayet-studios', 'High-quality app-install offers.', 950, true),
  ('Wannads', 'wannads', 'Offerwall (postback supported, secret env pending).', 900, true),
  ('Monlix', 'monlix', 'Gamified offerwall with daily offers.', 950, true),
  ('Revenue Universe', 'revu', 'Surveys and offers with reliable tracking.', 900, true),
  ('AdGem', 'adgem', 'Mobile-first offerwall with app installs.', 950, true),
  ('Pollfish', 'pollfish', 'Programmatic survey marketplace.', 1000, true),
  ('TheoremReach', 'theoremreach', 'Survey wall with high completion rates.', 950, true),
  ('Hang My Ads', 'hang-my-ads', 'Offerwall with tasks and offers.', 950, true),
  ('Offerwall.me', 'offerwall-me', 'Simple offerwall with instant rewards.', 900, true),
  ('BicoTasks', 'bicotasks', 'Micro-task wall with quick completions.', 850, true),
  ('MM Wall', 'mm-wall', 'MakeMoney Wall — complete simple tasks and earn instantly.', 800, true),
  ('AdscendMedia', 'adscend', 'Premium offers with high payouts and reliable tracking.', 950, true),
  ('CPAlead', 'cpalead', 'Offerwall with surveys, apps, and trials.', 900, true),
  ('MinuteStaff', 'minutestaff', 'Micro-offer wall with fast crediting.', 850, true)
ON CONFLICT (slug) DO UPDATE SET
  conversion_rate = EXCLUDED.conversion_rate,
  description = COALESCE(offerwall_providers.description, EXCLUDED.description);

-- ============================================================================
-- 2. Tournaments for the CURRENT periods (mirrors TOURNAMENT_CONFIGS).
--    Date math matches app/api/tournaments/route.ts getPeriodDates:
--      daily   → UTC midnight today → 23:59:59.999
--      weekly  → UTC Monday 00:00 → Sunday 23:59:59.999
--      monthly → UTC 1st 00:00 → last day 23:59:59.999
--    (start_date/end_date are DATE columns; the time components live in the
--    RPC's period logic, so DATE-only boundaries are the canonical shape.)
-- ============================================================================
INSERT INTO public.tournaments (category, period, title, description, prize_pool_satoshis, prize_distribution, start_date, end_date, status)
SELECT v.category, v.period, v.title, v.description, v.prize_pool, v.prizes::jsonb, v.starts::date, v.ends::date, 'active'
FROM (VALUES
  -- Daily
  ('faucet_claims', 'daily', 'Daily Faucet Champion', 'Claim the manual faucet the most times today', 5000,
   '[50, 30, 20]'::jsonb, date_trunc('day', now()), date_trunc('day', now()) + interval '1 day' - interval '1 second'),
  ('offerwall_earnings', 'daily', 'Daily Offerwall Master', 'Earn the most from offerwalls today', 10000,
   '[50, 30, 20]'::jsonb, date_trunc('day', now()), date_trunc('day', now()) + interval '1 day' - interval '1 second'),
  ('highest_earners', 'daily', 'Daily Top Earner', 'Earn the most overall today', 15000,
   '[50, 30, 20]'::jsonb, date_trunc('day', now()), date_trunc('day', now()) + interval '1 day' - interval '1 second'),
  ('supporter_ads_watched', 'daily', 'Daily Support Champion', 'Watch the most ads today to support the platform', 400,
   '[50, 30, 20]'::jsonb, date_trunc('day', now()), date_trunc('day', now()) + interval '1 day' - interval '1 second'),
  ('supporter_earnings', 'daily', 'Daily Top Supporter', 'Earn the most from supporting today', 600,
   '[50, 30, 20]'::jsonb, date_trunc('day', now()), date_trunc('day', now()) + interval '1 day' - interval '1 second'),
  -- Weekly (Monday-start, matching getPeriodDates)
  ('faucet_claims', 'weekly', 'Weekly Faucet Champion', 'Claim the manual faucet the most times this week', 25000,
   '[40, 25, 15, 10, 10]'::jsonb,
   date_trunc('day', now()) - ((extract(dow from now())::int + 6) % 7) * interval '1 day',
   date_trunc('day', now()) - ((extract(dow from now())::int + 6) % 7) * interval '1 day' + interval '6 days'),
  ('offerwall_earnings', 'weekly', 'Weekly Offerwall Master', 'Earn the most from offerwalls this week', 50000,
   '[40, 25, 15, 10, 10]'::jsonb,
   date_trunc('day', now()) - ((extract(dow from now())::int + 6) % 7) * interval '1 day',
   date_trunc('day', now()) - ((extract(dow from now())::int + 6) % 7) * interval '1 day' + interval '6 days'),
  ('highest_earners', 'weekly', 'Weekly Top Earner', 'Earn the most overall this week', 75000,
   '[40, 25, 15, 10, 10]'::jsonb,
   date_trunc('day', now()) - ((extract(dow from now())::int + 6) % 7) * interval '1 day',
   date_trunc('day', now()) - ((extract(dow from now())::int + 6) % 7) * interval '1 day' + interval '6 days'),
  ('supporter_ads_watched', 'weekly', 'Weekly Support Champion', 'Watch the most ads this week to support the platform', 2000,
   '[40, 25, 15, 10, 10]'::jsonb,
   date_trunc('day', now()) - ((extract(dow from now())::int + 6) % 7) * interval '1 day',
   date_trunc('day', now()) - ((extract(dow from now())::int + 6) % 7) * interval '1 day' + interval '6 days'),
  ('supporter_earnings', 'weekly', 'Weekly Top Supporter', 'Earn the most from supporting this week', 3000,
   '[40, 25, 15, 10, 10]'::jsonb,
   date_trunc('day', now()) - ((extract(dow from now())::int + 6) % 7) * interval '1 day',
   date_trunc('day', now()) - ((extract(dow from now())::int + 6) % 7) * interval '1 day' + interval '6 days'),
  -- Monthly
  ('faucet_claims', 'monthly', 'Monthly Faucet Legend', 'Claim the manual faucet the most times this month', 10000,
   '[35, 20, 15, 10, 8, 5, 4, 3]'::jsonb, date_trunc('month', now()), date_trunc('month', now()) + interval '1 month' - interval '1 day'),
  ('offerwall_earnings', 'monthly', 'Monthly Offerwall Legend', 'Earn the most from offerwalls this month', 20000,
   '[35, 20, 15, 10, 8, 5, 4, 3]'::jsonb, date_trunc('month', now()), date_trunc('month', now()) + interval '1 month' - interval '1 day'),
  ('highest_earners', 'monthly', 'Monthly Grand Champion', 'Earn the most overall this month', 30000,
   '[35, 20, 15, 10, 8, 5, 4, 3]'::jsonb, date_trunc('month', now()), date_trunc('month', now()) + interval '1 month' - interval '1 day')
) AS v(category, period, title, description, prize_pool, prizes, starts, ends)
ON CONFLICT DO NOTHING;

-- Idempotency for tournaments: the unique_tournament constraint is
-- (period, category, start_date). ON CONFLICT DO NOTHING covers re-runs
-- within the same period; once the cron finalizes a period, the next
-- migration run (or an admin clicking create) seeds the next period.
