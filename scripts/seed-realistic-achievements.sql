-- Seed Realistic Achievements with proper rates based on website earning potential
-- $0.0001 per manual faucet claim, ~7 second cooldown
-- This means ~500 claims/hour max, ~$0.05/hour from manual faucet alone

-- First, clear existing achievements to avoid duplicates
DELETE FROM achievements WHERE slug IN (
  'first-claim', 'claim-10', 'claim-50', 'claim-100', 'claim-500', 'claim-1000', 'claim-5000',
  'streak-3', 'streak-7', 'streak-14', 'streak-30', 'streak-60', 'streak-90',
  'earn-100', 'earn-500', 'earn-1000', 'earn-5000', 'earn-10000', 'earn-50000',
  'refer-1', 'refer-5', 'refer-10', 'refer-25', 'refer-50',
  'ptc-first', 'ptc-10', 'ptc-50', 'ptc-100',
  'offerwall-first', 'offerwall-10', 'offerwall-25',
  'first-withdrawal', 'withdraw-1000', 'withdraw-10000',
  'early-adopter', 'night-owl', 'weekend-warrior'
);

-- Claims Achievements (realistic for $0.0001/claim)
INSERT INTO achievements (slug, name, description, icon, category, requirement_type, requirement_value, reward_satoshis, xp_reward, badge_color, is_hidden, is_active, sort_order) VALUES
('first-claim', 'First Steps', 'Make your first faucet claim', 'rocket', 'claims', 'total_claims', 1, 10, 10, 'green', false, true, 1),
('claim-10', 'Getting Started', 'Complete 10 faucet claims', 'zap', 'claims', 'total_claims', 10, 25, 25, 'green', false, true, 2),
('claim-50', 'Faucet Fan', 'Complete 50 faucet claims', 'droplet', 'claims', 'total_claims', 50, 50, 50, 'blue', false, true, 3),
('claim-100', 'Claim Centurion', 'Complete 100 faucet claims', 'target', 'claims', 'total_claims', 100, 100, 100, 'blue', false, true, 4),
('claim-500', 'Faucet Enthusiast', 'Complete 500 faucet claims', 'flame', 'claims', 'total_claims', 500, 250, 200, 'purple', false, true, 5),
('claim-1000', 'Claim Champion', 'Complete 1,000 faucet claims', 'trophy', 'claims', 'total_claims', 1000, 500, 400, 'amber', false, true, 6),
('claim-5000', 'Faucet Master', 'Complete 5,000 faucet claims', 'crown', 'claims', 'total_claims', 5000, 1000, 1000, 'gold', false, true, 7);

-- Streak Achievements (daily login streaks)
INSERT INTO achievements (slug, name, description, icon, category, requirement_type, requirement_value, reward_satoshis, xp_reward, badge_color, is_hidden, is_active, sort_order) VALUES
('streak-3', 'Three Day Start', 'Maintain a 3-day claim streak', 'flame', 'streak', 'claim_streak', 3, 25, 30, 'orange', false, true, 10),
('streak-7', 'Week Warrior', 'Maintain a 7-day claim streak', 'fire', 'streak', 'claim_streak', 7, 75, 70, 'orange', false, true, 11),
('streak-14', 'Two Week Champion', 'Maintain a 14-day claim streak', 'calendar', 'streak', 'claim_streak', 14, 150, 140, 'red', false, true, 12),
('streak-30', 'Monthly Master', 'Maintain a 30-day claim streak', 'medal', 'streak', 'claim_streak', 30, 300, 300, 'red', false, true, 13),
('streak-60', 'Dedication King', 'Maintain a 60-day claim streak', 'star', 'streak', 'claim_streak', 60, 750, 600, 'purple', false, true, 14),
('streak-90', 'Legendary Streaker', 'Maintain a 90-day claim streak', 'crown', 'streak', 'claim_streak', 90, 1500, 900, 'gold', false, true, 15);

-- Earnings Achievements (in satoshis - realistic based on $0.0001/claim)
-- ~10 sats per claim at current BTC prices
INSERT INTO achievements (slug, name, description, icon, category, requirement_type, requirement_value, reward_satoshis, xp_reward, badge_color, is_hidden, is_active, sort_order) VALUES
('earn-100', 'First Hundred', 'Earn 100 satoshis total', 'coins', 'earnings', 'total_earned', 100, 25, 25, 'green', false, true, 20),
('earn-500', 'Half Thousand', 'Earn 500 satoshis total', 'banknote', 'earnings', 'total_earned', 500, 50, 50, 'green', false, true, 21),
('earn-1000', 'Thousand Club', 'Earn 1,000 satoshis total', 'wallet', 'earnings', 'total_earned', 1000, 100, 100, 'blue', false, true, 22),
('earn-5000', 'Serious Earner', 'Earn 5,000 satoshis total', 'piggybank', 'earnings', 'total_earned', 5000, 250, 250, 'purple', false, true, 23),
('earn-10000', 'Five Figure Club', 'Earn 10,000 satoshis total', 'gem', 'earnings', 'total_earned', 10000, 500, 500, 'amber', false, true, 24),
('earn-50000', 'Crypto Wealthy', 'Earn 50,000 satoshis total', 'diamond', 'earnings', 'total_earned', 50000, 1000, 1000, 'gold', false, true, 25);

-- Referral Achievements
INSERT INTO achievements (slug, name, description, icon, category, requirement_type, requirement_value, reward_satoshis, xp_reward, badge_color, is_hidden, is_active, sort_order) VALUES
('refer-1', 'First Referral', 'Refer your first friend', 'user-plus', 'referrals', 'referral_count', 1, 50, 50, 'blue', false, true, 30),
('refer-5', 'Friendly Face', 'Refer 5 friends', 'users', 'referrals', 'referral_count', 5, 150, 150, 'blue', false, true, 31),
('refer-10', 'Social Butterfly', 'Refer 10 friends', 'network', 'referrals', 'referral_count', 10, 300, 300, 'purple', false, true, 32),
('refer-25', 'Influencer', 'Refer 25 friends', 'megaphone', 'referrals', 'referral_count', 25, 750, 500, 'amber', false, true, 33),
('refer-50', 'Community Leader', 'Refer 50 friends', 'crown', 'referrals', 'referral_count', 50, 1500, 1000, 'gold', false, true, 34);

-- PTC Achievements
INSERT INTO achievements (slug, name, description, icon, category, requirement_type, requirement_value, reward_satoshis, xp_reward, badge_color, is_hidden, is_active, sort_order) VALUES
('ptc-first', 'First View', 'Watch your first PTC ad', 'play', 'ptc', 'ptc_views', 1, 10, 10, 'green', false, true, 40),
('ptc-10', 'Ad Viewer', 'Watch 10 PTC ads', 'eye', 'ptc', 'ptc_views', 10, 50, 50, 'blue', false, true, 41),
('ptc-50', 'Ad Enthusiast', 'Watch 50 PTC ads', 'tv', 'ptc', 'ptc_views', 50, 150, 150, 'purple', false, true, 42),
('ptc-100', 'PTC Pro', 'Watch 100 PTC ads', 'monitor', 'ptc', 'ptc_views', 100, 300, 300, 'amber', false, true, 43);

-- Offerwall Achievements
INSERT INTO achievements (slug, name, description, icon, category, requirement_type, requirement_value, reward_satoshis, xp_reward, badge_color, is_hidden, is_active, sort_order) VALUES
('offerwall-first', 'First Offer', 'Complete your first offer', 'check-circle', 'offerwalls', 'offers_completed', 1, 100, 100, 'green', false, true, 50),
('offerwall-10', 'Offer Hunter', 'Complete 10 offers', 'target', 'offerwalls', 'offers_completed', 10, 500, 500, 'blue', false, true, 51),
('offerwall-25', 'Offer Master', 'Complete 25 offers', 'trophy', 'offerwalls', 'offers_completed', 25, 1000, 1000, 'amber', false, true, 52);

-- Withdrawal Achievements
INSERT INTO achievements (slug, name, description, icon, category, requirement_type, requirement_value, reward_satoshis, xp_reward, badge_color, is_hidden, is_active, sort_order) VALUES
('first-withdrawal', 'First Cashout', 'Make your first withdrawal', 'arrow-up-right', 'withdrawals', 'withdrawal_count', 1, 50, 50, 'green', false, true, 60),
('withdraw-1000', 'Thousand Withdrawn', 'Withdraw 1,000 satoshis total', 'banknote', 'withdrawals', 'total_withdrawn', 1000, 100, 100, 'blue', false, true, 61),
('withdraw-10000', 'Big Cashout', 'Withdraw 10,000 satoshis total', 'wallet', 'withdrawals', 'total_withdrawn', 10000, 500, 500, 'amber', false, true, 62);

-- Special/Hidden Achievements
INSERT INTO achievements (slug, name, description, icon, category, requirement_type, requirement_value, reward_satoshis, xp_reward, badge_color, is_hidden, is_active, sort_order) VALUES
('early-adopter', 'Early Adopter', 'Join during the first month of launch', 'sparkles', 'special', 'special', 1, 500, 500, 'gold', true, true, 70),
('night-owl', 'Night Owl', 'Claim between midnight and 5 AM', 'moon', 'special', 'special', 1, 100, 100, 'purple', true, true, 71),
('weekend-warrior', 'Weekend Warrior', 'Make 50 claims on a weekend', 'calendar', 'special', 'special', 50, 200, 200, 'blue', true, true, 72);
