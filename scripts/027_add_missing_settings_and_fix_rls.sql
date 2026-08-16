-- Add missing system settings keys
INSERT INTO public.system_settings (key, value, description) VALUES
  ('maximum_withdrawal_satoshis', '"50000"', 'Maximum withdrawal amount per transaction'),
  ('manual_review_threshold', '"60"', 'Fraud score threshold for manual review'),
  ('auto_ban_threshold', '"95"', 'Fraud score threshold for automatic ban'),
  ('max_accounts_per_ip', '"3"', 'Maximum accounts allowed from same IP'),
  ('max_accounts_per_device', '"2"', 'Maximum accounts allowed from same device')
ON CONFLICT (key) DO NOTHING;

-- Update RLS policy to allow both admin and superadmin to modify settings
DROP POLICY IF EXISTS "system_settings_admin_all" ON public.system_settings;

CREATE POLICY "system_settings_admin_all" ON public.system_settings
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'superadmin')
    )
  );

-- Grant necessary permissions
GRANT ALL ON public.system_settings TO authenticated;
