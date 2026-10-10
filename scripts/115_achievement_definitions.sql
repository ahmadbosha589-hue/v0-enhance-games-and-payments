-- 115: Achievement definitions — tracked + type-corrected.
--
-- Two production bugs fixed here:
-- 1. scripts/021 (pre-071, never run by the migration runner) seeded
--    requirement_type values ('count','amount','streak','single') that
--    app/api/achievements/check/route.ts never reads, so no achievement could
--    ever unlock.
-- 2. scripts/seed-realistic-achievements.sql uses 'total_claims' /
--    'claim_streak' / 'total_earned' / 'referral_count' / 'ptc_views' /
--    'offers_completed' / 'withdrawal_count' / 'special' — of which the engine
--    reads only claims/streak/earnings/referrals/games_won.
--
-- This migration upserts the real definitions using the engine's vocabulary
-- (claims, streak, earnings, referrals, games_won, ptc_views,
-- offers_completed, withdrawal_count), retires types the engine cannot
-- evaluate ('special' — time-window logic is not implemented, honestly
-- disabled instead of fake-unlockable), and deletes the stale 021-era rows.

-- ============================================================================
-- 1. Retire requirement types the engine cannot evaluate.
-- ============================================================================
UPDATE public.achievements SET is_active = false
WHERE requirement_type IN ('count', 'amount', 'single', 'special', 'total_claims', 'claim_streak', 'total_earned', 'referral_count', 'total_withdrawn');

-- ============================================================================
-- 2. Upsert the real definitions (is_active = true), engine-native types.
--    requirement_type → engine mapping used:
--      total_claims    → claims
--      claim_streak    → streak
--      total_earned    → earnings
--      referral_count  → referrals
--      ptc_views       → ptc_views          (engine extended)
--      offers_completed→ offers_completed   (engine extended)
--      withdrawal_count→ withdrawal_count   (engine extended)
--      games wins      → games_won          (added rows)
-- ============================================================================
INSERT INTO public.achievements (slug, name, description, icon, category, requirement_type, requirement_value, reward_satoshis, xp_reward, badge_color, is_hidden, is_active, sort_order)
VALUES
  -- Claims achievements
  ('first-claim', 'First Steps', 'Make your first faucet claim', 'rocket', 'claims', 'claims', 1, 10, 10, 'green', false, true, 1),
  ('claim-10', 'Getting Started', 'Complete 10 faucet claims', 'zap', 'claims', 'claims', 10, 25, 25, 'green', false, true, 2),
  ('claim-50', 'Faucet Fan', 'Complete 50 faucet claims', 'droplet', 'claims', 'claims', 50, 50, 50, 'blue', false, true, 3),
  ('claim-100', 'Claim Centurion', 'Complete 100 faucet claims', 'target', 'claims', 'claims', 100, 100, 100, 'blue', false, true, 4),
  ('claim-500', 'Faucet Enthusiast', 'Complete 500 faucet claims', 'flame', 'claims', 'claims', 500, 250, 200, 'purple', false, true, 5),
  ('claim-1000', 'Claim Champion', 'Complete 1,000 faucet claims', 'trophy', 'claims', 'claims', 1000, 500, 400, 'amber', false, true, 6),
  ('claim-5000', 'Faucet Master', 'Complete 5,000 faucet claims', 'crown', 'claims', 'claims', 5000, 1000, 1000, 'gold', false, true, 7),
  -- Streak achievements
  ('streak-3', 'Three Day Start', 'Maintain a 3-day claim streak', 'flame', 'streak', 'streak', 3, 25, 30, 'orange', false, true, 10),
  ('streak-7', 'Week Warrior', 'Maintain a 7-day claim streak', 'fire', 'streak', 'streak', 7, 75, 70, 'orange', false, true, 11),
  ('streak-14', 'Two Week Champion', 'Maintain a 14-day claim streak', 'calendar', 'streak', 'streak', 14, 150, 140, 'red', false, true, 12),
  ('streak-30', 'Monthly Master', 'Maintain a 30-day claim streak', 'medal', 'streak', 'streak', 30, 300, 300, 'red', false, true, 13),
  ('streak-60', 'Dedication King', 'Maintain a 60-day claim streak', 'star', 'streak', 'streak', 60, 750, 600, 'purple', false, true, 14),
  ('streak-90', 'Legendary Streaker', 'Maintain a 90-day claim streak', 'crown', 'streak', 'streak', 90, 1500, 900, 'gold', false, true, 15),
  -- Earnings achievements
  ('earn-100', 'First Hundred', 'Earn 100 satoshis total', 'coins', 'earnings', 'earnings', 100, 25, 25, 'green', false, true, 20),
  ('earn-500', 'Half Thousand', 'Earn 500 satoshis total', 'banknote', 'earnings', 'earnings', 500, 50, 50, 'green', false, true, 21),
  ('earn-1000', 'Thousand Club', 'Earn 1,000 satoshis total', 'wallet', 'earnings', 'earnings', 1000, 100, 100, 'blue', false, true, 22),
  ('earn-5000', 'Serious Earner', 'Earn 5,000 satoshis total', 'piggybank', 'earnings', 'earnings', 5000, 250, 250, 'purple', false, true, 23),
  ('earn-10000', 'Five Figure Club', 'Earn 10,000 satoshis total', 'gem', 'earnings', 'earnings', 10000, 500, 500, 'amber', false, true, 24),
  ('earn-50000', 'Crypto Wealthy', 'Earn 50,000 satoshis total', 'diamond', 'earnings', 'earnings', 50000, 1000, 1000, 'gold', false, true, 25),
  -- Referral achievements
  ('refer-1', 'First Referral', 'Refer your first friend', 'user-plus', 'referrals', 'referrals', 1, 50, 50, 'blue', false, true, 30),
  ('refer-5', 'Friendly Face', 'Refer 5 friends', 'users', 'referrals', 'referrals', 5, 150, 150, 'blue', false, true, 31),
  ('refer-10', 'Social Butterfly', 'Refer 10 friends', 'network', 'referrals', 'referrals', 10, 300, 300, 'purple', false, true, 32),
  ('refer-25', 'Influencer', 'Refer 25 friends', 'megaphone', 'referrals', 'referrals', 25, 750, 500, 'amber', false, true, 33),
  ('refer-50', 'Community Leader', 'Refer 50 friends', 'crown', 'referrals', 'referrals', 50, 1500, 1000, 'gold', false, true, 34),
  -- PTC achievements (engine extended: ptc_views)
  ('ptc-first', 'First View', 'Watch your first PTC ad', 'play', 'ptc', 'ptc_views', 1, 10, 10, 'green', false, true, 40),
  ('ptc-10', 'Ad Viewer', 'Watch 10 PTC ads', 'eye', 'ptc', 'ptc_views', 10, 50, 50, 'blue', false, true, 41),
  ('ptc-50', 'Ad Enthusiast', 'Watch 50 PTC ads', 'tv', 'ptc', 'ptc_views', 50, 150, 150, 'purple', false, true, 42),
  ('ptc-100', 'PTC Pro', 'Watch 100 PTC ads', 'monitor', 'ptc', 'ptc_views', 100, 300, 300, 'amber', false, true, 43),
  -- Offerwall achievements (engine extended: offers_completed)
  ('offerwall-first', 'First Offer', 'Complete your first offer', 'check-circle', 'offerwalls', 'offers_completed', 1, 100, 100, 'green', false, true, 50),
  ('offerwall-10', 'Offer Hunter', 'Complete 10 offers', 'target', 'offerwalls', 'offers_completed', 10, 500, 500, 'blue', false, true, 51),
  ('offerwall-25', 'Offer Master', 'Complete 25 offers', 'trophy', 'offerwalls', 'offers_completed', 25, 1000, 1000, 'amber', false, true, 52),
  -- Games achievements (games_won)
  ('games-1', 'First Victory', 'Win your first game', 'gamepad-2', 'games', 'games_won', 1, 25, 25, 'green', false, true, 55),
  ('games-10', 'Gaming Regular', 'Win 10 games', 'joystick', 'games', 'games_won', 10, 75, 75, 'blue', false, true, 56),
  ('games-50', 'Gaming Master', 'Win 50 games', 'trophy', 'games', 'games_won', 50, 250, 250, 'purple', false, true, 57),
  -- Withdrawal achievements (engine extended: withdrawal_count)
  ('first-withdrawal', 'First Cashout', 'Make your first withdrawal', 'arrow-up-right', 'withdrawals', 'withdrawal_count', 1, 50, 50, 'green', false, true, 60),
  ('withdraw-10', 'Repeat Cashout', 'Make 10 withdrawals', 'banknote', 'withdrawals', 'withdrawal_count', 10, 150, 150, 'blue', false, true, 61)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  category = EXCLUDED.category,
  requirement_type = EXCLUDED.requirement_type,
  requirement_value = EXCLUDED.requirement_value,
  reward_satoshis = EXCLUDED.reward_satoshis,
  xp_reward = EXCLUDED.xp_reward,
  badge_color = EXCLUDED.badge_color,
  is_hidden = EXCLUDED.is_hidden,
  is_active = EXCLUDED.is_active,
  sort_order = EXCLUDED.sort_order;
