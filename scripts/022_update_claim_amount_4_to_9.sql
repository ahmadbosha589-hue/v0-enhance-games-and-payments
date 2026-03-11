-- =====================================================
-- Script 022: Update claim amount to 4-9 satoshis
-- =====================================================

-- Update base claim to 4 satoshis and max to 9 satoshis
UPDATE public.system_settings SET value = '4' WHERE key = 'base_claim_amount_satoshis';
UPDATE public.system_settings SET value = '9' WHERE key = 'max_claim_amount_satoshis';

-- Insert if not exists
INSERT INTO public.system_settings (key, value, description) VALUES
  ('base_claim_amount_satoshis', '4', 'Base claim amount per faucet claim (minimum)'),
  ('max_claim_amount_satoshis', '9', 'Maximum claim amount per faucet claim')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description;

-- Also update the claim function to use random between 4-9
CREATE OR REPLACE FUNCTION get_claim_amount(
  p_user_id UUID,
  p_streak INTEGER DEFAULT 0
) RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_base_amount BIGINT;
  v_max_amount BIGINT;
  v_final_amount BIGINT;
BEGIN
  -- Get settings
  SELECT (value::TEXT)::BIGINT INTO v_base_amount 
  FROM public.system_settings WHERE key = 'base_claim_amount_satoshis';
  v_base_amount := COALESCE(v_base_amount, 4);
  
  SELECT (value::TEXT)::BIGINT INTO v_max_amount 
  FROM public.system_settings WHERE key = 'max_claim_amount_satoshis';
  v_max_amount := COALESCE(v_max_amount, 9);
  
  -- Random amount between base and max
  v_final_amount := v_base_amount + floor(random() * (v_max_amount - v_base_amount + 1))::BIGINT;
  
  RETURN v_final_amount;
END;
$$;
