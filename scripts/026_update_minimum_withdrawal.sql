-- Update minimum withdrawal amount
-- Change the value '10000' to your desired amount in satoshis

UPDATE public.system_settings 
SET value = '10000', 
    updated_at = NOW()
WHERE key = 'minimum_withdrawal_satoshis';

-- If the row doesn't exist, insert it
INSERT INTO public.system_settings (key, value, description)
VALUES ('minimum_withdrawal_satoshis', '10000', 'Minimum withdrawal amount in satoshis')
ON CONFLICT (key) DO UPDATE 
SET value = EXCLUDED.value,
    updated_at = NOW();

-- Verify the update
SELECT * FROM public.system_settings WHERE key = 'minimum_withdrawal_satoshis';
