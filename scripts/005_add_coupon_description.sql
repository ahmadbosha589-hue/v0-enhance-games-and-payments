-- Add description column to coupons table
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS description TEXT;

-- Update existing coupons with descriptions
UPDATE public.coupons SET description = 'Welcome bonus for new users' WHERE code = 'WELCOME2024';
UPDATE public.coupons SET description = 'Special bonus reward' WHERE code = 'BONUS100';
UPDATE public.coupons SET description = 'Free satoshis for everyone' WHERE code = 'FREESATS';
