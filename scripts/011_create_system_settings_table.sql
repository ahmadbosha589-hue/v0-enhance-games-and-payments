-- Crypto Faucet Platform - Database Schema
-- Script 011: Create system settings table

CREATE TABLE IF NOT EXISTS public.system_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Enable RLS
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Everyone can read settings
CREATE POLICY "system_settings_select_all" ON public.system_settings
  FOR SELECT USING (true);

-- Only superadmins can modify settings
CREATE POLICY "system_settings_admin_all" ON public.system_settings
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() 
      AND role = 'superadmin'
    )
  );

-- Insert default settings
INSERT INTO public.system_settings (key, value, description) VALUES
  ('claim_cooldown_seconds', '300', 'Cooldown between claims in seconds'),
  ('base_claim_amount_satoshis', '50', 'Base claim amount in satoshis'),
  ('max_claim_amount_satoshis', '500', 'Maximum claim amount with bonuses'),
  ('streak_bonus_percentage', '10', 'Bonus percentage per streak day'),
  ('max_streak_bonus_percentage', '100', 'Maximum streak bonus percentage'),
  ('referral_bonus_percentage', '10', 'Referral bonus percentage of claim'),
  ('referral_commission_tiers', '[{"tier": 1, "percentage": 10}, {"tier": 2, "percentage": 5}, {"tier": 3, "percentage": 2}]', 'Multi-tier referral commission structure'),
  ('minimum_withdrawal_satoshis', '10000', 'Minimum withdrawal amount'),
  ('daily_withdrawal_limit_satoshis', '100000', 'Daily withdrawal limit per user'),
  ('withdrawal_fee_percentage', '0', 'Withdrawal fee percentage'),
  ('fraud_score_threshold', '70', 'Fraud score threshold for automatic flagging'),
  ('max_claims_per_ip_per_day', '10', 'Maximum claims per IP address per day'),
  ('faucetpay_enabled', 'true', 'Enable FaucetPay withdrawals'),
  ('maintenance_mode', 'false', 'Enable maintenance mode'),
  ('registration_enabled', 'true', 'Enable new user registration')
ON CONFLICT (key) DO NOTHING;
