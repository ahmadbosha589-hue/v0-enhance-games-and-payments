-- =====================================================
-- Seed System Settings
-- =====================================================

INSERT INTO system_settings (key, value, description) VALUES
  ('claim_cooldown_seconds', '300', 'Time between claims in seconds'),
  ('claim_base_min', '50', 'Minimum base claim amount in satoshis'),
  ('claim_base_max', '200', 'Maximum base claim amount in satoshis'),
  ('claim_streak_bonus_percent', '5', 'Bonus percentage per streak day'),
  ('claim_max_streak', '30', 'Maximum streak days'),
  ('withdrawal_min', '5000', 'Minimum withdrawal in satoshis'),
  ('withdrawal_max_daily', '1000000', 'Maximum daily withdrawal in satoshis'),
  ('withdrawal_fee_percent', '2', 'Withdrawal fee percentage'),
  ('referral_commission_percent', '10', 'Referral commission percentage'),
  ('fraud_score_threshold', '70', 'Fraud score threshold for flagging'),
  ('fraud_auto_ban_threshold', '95', 'Fraud score for automatic ban'),
  ('max_accounts_per_ip', '3', 'Maximum accounts per IP address'),
  ('max_claims_per_ip_hour', '20', 'Maximum claims per IP per hour'),
  ('vpn_detection_enabled', 'true', 'Enable VPN/proxy detection'),
  ('captcha_enabled', 'true', 'Enable CAPTCHA for claims'),
  ('maintenance_mode', 'false', 'Enable maintenance mode'),
  ('registration_enabled', 'true', 'Enable new user registration')
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = NOW();
