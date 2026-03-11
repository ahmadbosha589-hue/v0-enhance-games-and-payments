-- Script 030: Add signup bonus to new users
-- This script updates the handle_new_user trigger to credit 100 satoshis on signup

-- Define the signup bonus amount
DO $$ 
BEGIN
  -- Update the handle_new_user function to include signup bonus
  CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS TRIGGER AS $func$
  DECLARE
    ref_code TEXT;
    referrer_id UUID;
    signup_bonus_amount BIGINT := 100; -- 100 satoshis signup bonus
  BEGIN
    -- Generate unique referral code
    LOOP
      ref_code := generate_referral_code();
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE referral_code = ref_code);
    END LOOP;
    
    -- Check if referred by someone
    IF NEW.raw_user_meta_data->>'referred_by' IS NOT NULL THEN
      SELECT id INTO referrer_id 
      FROM public.profiles 
      WHERE referral_code = NEW.raw_user_meta_data->>'referred_by';
    END IF;
    
    -- Insert profile WITH signup bonus
    INSERT INTO public.profiles (
      id,
      username,
      display_name,
      referral_code,
      referred_by,
      status,
      balance_satoshis,
      total_earned_satoshis
    ) VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'username', NULL),
      COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
      ref_code,
      referrer_id,
      'active',
      signup_bonus_amount,  -- Credit 100 satoshis
      signup_bonus_amount   -- Track in total earned
    );
    
    -- Create transaction record for signup bonus
    INSERT INTO public.transactions (
      user_id,
      type,
      amount_satoshis,
      balance_before,
      balance_after,
      status,
      description,
      metadata
    ) VALUES (
      NEW.id,
      'signup_bonus',
      signup_bonus_amount,
      0,
      signup_bonus_amount,
      'completed',
      'Welcome bonus for new users',
      jsonb_build_object(
        'bonus_type', 'signup',
        'email', NEW.email,
        'created_at', NOW()
      )
    );
    
    -- Update referrer's count if applicable
    IF referrer_id IS NOT NULL THEN
      UPDATE public.profiles 
      SET referral_count = referral_count + 1 
      WHERE id = referrer_id;
    END IF;
    
    RETURN NEW;
  END;
  $func$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

  RAISE NOTICE 'Signup bonus trigger updated successfully. New users will receive 100 satoshis.';
END $$;
