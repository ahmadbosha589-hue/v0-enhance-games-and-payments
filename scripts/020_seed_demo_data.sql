-- Seed script for demo/test data
-- This creates realistic test data for development and testing

-- First, let's create some test users (you would normally use Supabase Auth)
-- These are placeholder UUIDs for demonstration

-- Insert some demo system settings if they don't exist
INSERT INTO system_settings (key, value, description, updated_at)
VALUES
  ('claim_base_amount', '{"min": 10, "max": 50}', 'Base satoshi amount range for claims', NOW()),
  ('claim_cooldown_minutes', '5', 'Minutes between claims', NOW()),
  ('withdrawal_min_amount', '5000', 'Minimum withdrawal amount in satoshis', NOW()),
  ('withdrawal_fee_percent', '5', 'Withdrawal fee percentage', NOW()),
  ('referral_commission_percent', '20', 'Referral commission percentage', NOW()),
  ('streak_bonus_day_2', '10', 'Day 2 streak bonus percentage', NOW()),
  ('streak_bonus_day_3', '20', 'Day 3 streak bonus percentage', NOW()),
  ('streak_bonus_day_4', '30', 'Day 4 streak bonus percentage', NOW()),
  ('streak_bonus_day_5', '50', 'Day 5 streak bonus percentage', NOW()),
  ('streak_bonus_day_6', '75', 'Day 6 streak bonus percentage', NOW()),
  ('streak_bonus_day_7', '100', 'Day 7+ streak bonus percentage', NOW()),
  ('fraud_score_threshold', '70', 'Fraud score threshold for flagging', NOW()),
  ('max_daily_claims', '288', 'Maximum claims per day (24h / 5min)', NOW()),
  ('maintenance_mode', 'false', 'Enable maintenance mode', NOW())
ON CONFLICT (key) DO NOTHING;

-- Create a view for easy stats access
CREATE OR REPLACE VIEW platform_overview AS
SELECT
  (SELECT COUNT(*) FROM profiles) as total_users,
  (SELECT COUNT(*) FROM profiles WHERE status = 'active') as active_users,
  (SELECT COUNT(*) FROM profiles WHERE created_at >= CURRENT_DATE) as new_users_today,
  (SELECT COALESCE(SUM(total_earned_satoshis), 0) FROM profiles) as total_distributed,
  (SELECT COALESCE(SUM(total_withdrawn_satoshis), 0) FROM profiles) as total_withdrawn,
  (SELECT COALESCE(SUM(balance_satoshis), 0) FROM profiles) as total_pending_balance,
  (SELECT COUNT(*) FROM claims) as total_claims,
  (SELECT COUNT(*) FROM claims WHERE created_at >= CURRENT_DATE) as claims_today,
  (SELECT COUNT(*) FROM withdrawals WHERE status = 'completed') as completed_withdrawals,
  (SELECT COUNT(*) FROM withdrawals WHERE status = 'pending') as pending_withdrawals,
  (SELECT COUNT(*) FROM fraud_flags WHERE status = 'pending_review') as pending_fraud_reviews,
  (SELECT COUNT(*) FROM profiles WHERE is_flagged = true) as flagged_users;

-- Grant access to the view
GRANT SELECT ON platform_overview TO authenticated;
GRANT SELECT ON platform_overview TO service_role;
