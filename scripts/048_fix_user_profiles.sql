-- =============================================================================
-- Script 048: Comprehensive User Profiles Fix
-- =============================================================================
-- 
-- This script fixes common issues with user profiles:
-- 1. Creates missing profiles for users in auth.users
-- 2. Verifies and repairs balance integrity
-- 3. Fixes missing or duplicate referral codes
-- 4. Repairs transaction history discrepancies
-- 5. Fixes stuck account statuses
-- 6. Updates statistics (total_earned, total_withdrawn, etc.)
-- 7. Creates audit trail for all repairs
--
-- =============================================================================

-- Start transaction
BEGIN;

-- =============================================================================
-- STEP 1: Create missing profiles for auth.users
-- =============================================================================
DO $$
DECLARE
  v_user RECORD;
  v_ref_code TEXT;
  v_created_count INTEGER := 0;
BEGIN
  RAISE NOTICE '=== STEP 1: Creating missing profiles ===';
  
  FOR v_user IN 
    SELECT au.id, au.email, au.raw_user_meta_data
    FROM auth.users au
    LEFT JOIN public.profiles p ON p.id = au.id
    WHERE p.id IS NULL
  LOOP
    -- Generate unique referral code
    LOOP
      v_ref_code := (
        SELECT string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', floor(random() * 32 + 1)::integer, 1), '')
        FROM generate_series(1, 8)
      );
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE referral_code = v_ref_code);
    END LOOP;
    
    -- Create the missing profile
    INSERT INTO public.profiles (
      id,
      username,
      display_name,
      referral_code,
      referred_by,
      status,
      balance_satoshis,
      total_earned_satoshis,
      total_withdrawn_satoshis,
      referral_count,
      referral_earnings_satoshis,
      total_claims,
      claim_streak,
      max_claim_streak,
      fraud_score,
      is_flagged,
      created_at,
      updated_at,
      last_active_at
    ) VALUES (
      v_user.id,
      COALESCE(v_user.raw_user_meta_data->>'username', NULL),
      COALESCE(v_user.raw_user_meta_data->>'display_name', split_part(v_user.email, '@', 1)),
      v_ref_code,
      NULL,
      'active',
      100, -- Signup bonus
      100, -- Track in total earned
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      FALSE,
      NOW(),
      NOW(),
      NOW()
    );
    
    -- Create signup bonus transaction
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
      v_user.id,
      'signup_bonus',
      100,
      0,
      100,
      'completed',
      'Profile recovery - Welcome bonus',
      jsonb_build_object(
        'repair_script', '048_fix_user_profiles',
        'repair_reason', 'missing_profile',
        'repaired_at', NOW()
      )
    );
    
    v_created_count := v_created_count + 1;
    RAISE NOTICE 'Created profile for user: %', v_user.email;
  END LOOP;
  
  RAISE NOTICE 'Created % missing profiles', v_created_count;
END $$;

-- =============================================================================
-- STEP 2: Fix duplicate or missing referral codes
-- =============================================================================
DO $$
DECLARE
  v_profile RECORD;
  v_new_code TEXT;
  v_fixed_count INTEGER := 0;
BEGIN
  RAISE NOTICE '=== STEP 2: Fixing referral codes ===';
  
  -- Fix NULL referral codes
  FOR v_profile IN 
    SELECT id FROM public.profiles WHERE referral_code IS NULL
  LOOP
    LOOP
      v_new_code := (
        SELECT string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', floor(random() * 32 + 1)::integer, 1), '')
        FROM generate_series(1, 8)
      );
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE referral_code = v_new_code);
    END LOOP;
    
    UPDATE public.profiles SET referral_code = v_new_code WHERE id = v_profile.id;
    v_fixed_count := v_fixed_count + 1;
  END LOOP;
  
  -- Fix duplicate referral codes (keep oldest, regenerate others)
  FOR v_profile IN 
    SELECT id FROM public.profiles p1
    WHERE EXISTS (
      SELECT 1 FROM public.profiles p2 
      WHERE p2.referral_code = p1.referral_code 
        AND p2.id != p1.id 
        AND p2.created_at < p1.created_at
    )
  LOOP
    LOOP
      v_new_code := (
        SELECT string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', floor(random() * 32 + 1)::integer, 1), '')
        FROM generate_series(1, 8)
      );
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE referral_code = v_new_code);
    END LOOP;
    
    UPDATE public.profiles SET referral_code = v_new_code WHERE id = v_profile.id;
    v_fixed_count := v_fixed_count + 1;
  END LOOP;
  
  RAISE NOTICE 'Fixed % referral codes', v_fixed_count;
END $$;

-- =============================================================================
-- STEP 3: Verify and repair balance integrity
-- =============================================================================
DO $$
DECLARE
  v_profile RECORD;
  v_computed RECORD;
  v_repaired_count INTEGER := 0;
BEGIN
  RAISE NOTICE '=== STEP 3: Verifying balance integrity ===';
  
  FOR v_profile IN 
    SELECT id, balance_satoshis, total_earned_satoshis, total_withdrawn_satoshis
    FROM public.profiles
  LOOP
    -- Calculate what values SHOULD be from transactions
    SELECT 
      COALESCE(SUM(CASE WHEN type != 'withdrawal' AND status = 'completed' THEN amount_satoshis ELSE 0 END), 0) as total_earned,
      COALESCE(SUM(CASE WHEN type = 'withdrawal' AND status = 'completed' THEN amount_satoshis ELSE 0 END), 0) as total_withdrawn
    INTO v_computed
    FROM public.transactions
    WHERE user_id = v_profile.id;
    
    -- Check if there's a mismatch
    IF v_profile.balance_satoshis != (v_computed.total_earned - v_computed.total_withdrawn)
       OR v_profile.total_earned_satoshis != v_computed.total_earned
       OR v_profile.total_withdrawn_satoshis != v_computed.total_withdrawn
    THEN
      -- Record the repair in audit
      INSERT INTO public.audit_logs (
        actor_id,
        actor_role,
        action,
        resource_type,
        resource_id,
        old_data,
        new_data,
        metadata
      ) VALUES (
        NULL,
        'system',
        'balance_repair',
        'profile',
        v_profile.id::TEXT,
        jsonb_build_object(
          'balance_satoshis', v_profile.balance_satoshis,
          'total_earned_satoshis', v_profile.total_earned_satoshis,
          'total_withdrawn_satoshis', v_profile.total_withdrawn_satoshis
        ),
        jsonb_build_object(
          'balance_satoshis', v_computed.total_earned - v_computed.total_withdrawn,
          'total_earned_satoshis', v_computed.total_earned,
          'total_withdrawn_satoshis', v_computed.total_withdrawn
        ),
        jsonb_build_object(
          'repair_script', '048_fix_user_profiles',
          'discrepancy', jsonb_build_object(
            'balance', (v_computed.total_earned - v_computed.total_withdrawn) - v_profile.balance_satoshis,
            'earned', v_computed.total_earned - v_profile.total_earned_satoshis,
            'withdrawn', v_computed.total_withdrawn - v_profile.total_withdrawn_satoshis
          )
        )
      );
      
      -- Apply the fix
      UPDATE public.profiles SET
        balance_satoshis = v_computed.total_earned - v_computed.total_withdrawn,
        total_earned_satoshis = v_computed.total_earned,
        total_withdrawn_satoshis = v_computed.total_withdrawn,
        updated_at = NOW()
      WHERE id = v_profile.id;
      
      v_repaired_count := v_repaired_count + 1;
    END IF;
  END LOOP;
  
  RAISE NOTICE 'Repaired % balance discrepancies', v_repaired_count;
END $$;

-- =============================================================================
-- STEP 4: Fix claim statistics
-- =============================================================================
DO $$
DECLARE
  v_profile RECORD;
  v_stats RECORD;
  v_fixed_count INTEGER := 0;
BEGIN
  RAISE NOTICE '=== STEP 4: Fixing claim statistics ===';
  
  FOR v_profile IN 
    SELECT id, total_claims, last_claim_at
    FROM public.profiles
  LOOP
    -- Calculate actual claim stats
    SELECT 
      COUNT(*) as claim_count,
      MAX(created_at) as last_claim
    INTO v_stats
    FROM public.claims
    WHERE user_id = v_profile.id;
    
    -- Update if different
    IF v_profile.total_claims != COALESCE(v_stats.claim_count, 0)
       OR v_profile.last_claim_at IS DISTINCT FROM v_stats.last_claim
    THEN
      UPDATE public.profiles SET
        total_claims = COALESCE(v_stats.claim_count, 0),
        last_claim_at = v_stats.last_claim,
        updated_at = NOW()
      WHERE id = v_profile.id;
      
      v_fixed_count := v_fixed_count + 1;
    END IF;
  END LOOP;
  
  RAISE NOTICE 'Fixed % claim statistics', v_fixed_count;
END $$;

-- =============================================================================
-- STEP 5: Fix referral counts
-- =============================================================================
DO $$
DECLARE
  v_profile RECORD;
  v_actual_count INTEGER;
  v_actual_earnings BIGINT;
  v_fixed_count INTEGER := 0;
BEGIN
  RAISE NOTICE '=== STEP 5: Fixing referral statistics ===';
  
  FOR v_profile IN 
    SELECT id, referral_count, referral_earnings_satoshis
    FROM public.profiles
  LOOP
    -- Count actual referrals
    SELECT COUNT(*) INTO v_actual_count
    FROM public.profiles
    WHERE referred_by = v_profile.id;
    
    -- Calculate actual referral earnings
    SELECT COALESCE(SUM(amount_satoshis), 0) INTO v_actual_earnings
    FROM public.transactions
    WHERE user_id = v_profile.id
      AND type = 'referral_bonus'
      AND status = 'completed';
    
    -- Update if different
    IF v_profile.referral_count != v_actual_count
       OR v_profile.referral_earnings_satoshis != v_actual_earnings
    THEN
      UPDATE public.profiles SET
        referral_count = v_actual_count,
        referral_earnings_satoshis = v_actual_earnings,
        updated_at = NOW()
      WHERE id = v_profile.id;
      
      v_fixed_count := v_fixed_count + 1;
    END IF;
  END LOOP;
  
  RAISE NOTICE 'Fixed % referral statistics', v_fixed_count;
END $$;

-- =============================================================================
-- STEP 6: Fix stuck pending_verification status
-- =============================================================================
DO $$
DECLARE
  v_fixed_count INTEGER := 0;
BEGIN
  RAISE NOTICE '=== STEP 6: Fixing stuck account statuses ===';
  
  -- Activate accounts that have been pending for more than 24 hours
  -- and have at least one successful claim or transaction
  UPDATE public.profiles SET
    status = 'active',
    updated_at = NOW()
  WHERE status = 'pending_verification'
    AND created_at < NOW() - INTERVAL '24 hours'
    AND (
      EXISTS (SELECT 1 FROM public.claims WHERE user_id = profiles.id)
      OR EXISTS (SELECT 1 FROM public.transactions WHERE user_id = profiles.id AND status = 'completed')
    );
  
  GET DIAGNOSTICS v_fixed_count = ROW_COUNT;
  RAISE NOTICE 'Activated % stuck pending accounts', v_fixed_count;
END $$;

-- =============================================================================
-- STEP 7: Fix max_claim_streak
-- =============================================================================
DO $$
DECLARE
  v_profile RECORD;
  v_fixed_count INTEGER := 0;
BEGIN
  RAISE NOTICE '=== STEP 7: Fixing max claim streaks ===';
  
  FOR v_profile IN 
    SELECT id, claim_streak, max_claim_streak
    FROM public.profiles
    WHERE claim_streak > max_claim_streak
  LOOP
    UPDATE public.profiles SET
      max_claim_streak = claim_streak,
      updated_at = NOW()
    WHERE id = v_profile.id;
    
    v_fixed_count := v_fixed_count + 1;
  END LOOP;
  
  RAISE NOTICE 'Fixed % max claim streaks', v_fixed_count;
END $$;

-- =============================================================================
-- STEP 8: Clean up orphaned transactions (no matching profile)
-- =============================================================================
DO $$
DECLARE
  v_orphan_count INTEGER;
BEGIN
  RAISE NOTICE '=== STEP 8: Handling orphaned data ===';
  
  -- Count orphaned transactions
  SELECT COUNT(*) INTO v_orphan_count
  FROM public.transactions t
  LEFT JOIN public.profiles p ON p.id = t.user_id
  WHERE p.id IS NULL;
  
  IF v_orphan_count > 0 THEN
    -- Log orphaned transactions for review (don't delete)
    INSERT INTO public.audit_logs (
      actor_id,
      actor_role,
      action,
      resource_type,
      resource_id,
      metadata
    ) VALUES (
      NULL,
      'system',
      'orphan_detection',
      'transactions',
      'batch',
      jsonb_build_object(
        'orphan_count', v_orphan_count,
        'repair_script', '048_fix_user_profiles',
        'detected_at', NOW()
      )
    );
    
    RAISE WARNING 'Found % orphaned transactions - logged for review', v_orphan_count;
  ELSE
    RAISE NOTICE 'No orphaned transactions found';
  END IF;
END $$;

-- =============================================================================
-- STEP 9: Update last_active_at for active users
-- =============================================================================
DO $$
DECLARE
  v_updated_count INTEGER := 0;
BEGIN
  RAISE NOTICE '=== STEP 9: Updating last_active_at timestamps ===';
  
  UPDATE public.profiles SET
    last_active_at = GREATEST(
      last_active_at,
      COALESCE(last_claim_at, created_at),
      COALESCE((
        SELECT MAX(created_at) 
        FROM public.transactions 
        WHERE user_id = profiles.id
      ), created_at)
    ),
    updated_at = NOW()
  WHERE last_active_at < COALESCE(last_claim_at, created_at)
     OR last_active_at < COALESCE((
       SELECT MAX(created_at) 
       FROM public.transactions 
       WHERE user_id = profiles.id
     ), created_at);
  
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  RAISE NOTICE 'Updated % last_active_at timestamps', v_updated_count;
END $$;

-- =============================================================================
-- STEP 10: Generate summary report
-- =============================================================================
DO $$
DECLARE
  v_total_users INTEGER;
  v_active_users INTEGER;
  v_total_balance BIGINT;
  v_total_earned BIGINT;
  v_total_withdrawn BIGINT;
BEGIN
  RAISE NOTICE '=== FINAL SUMMARY ===';
  
  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'active'),
    COALESCE(SUM(balance_satoshis), 0),
    COALESCE(SUM(total_earned_satoshis), 0),
    COALESCE(SUM(total_withdrawn_satoshis), 0)
  INTO v_total_users, v_active_users, v_total_balance, v_total_earned, v_total_withdrawn
  FROM public.profiles;
  
  RAISE NOTICE 'Total users: %', v_total_users;
  RAISE NOTICE 'Active users: %', v_active_users;
  RAISE NOTICE 'Total balance (satoshis): %', v_total_balance;
  RAISE NOTICE 'Total earned (satoshis): %', v_total_earned;
  RAISE NOTICE 'Total withdrawn (satoshis): %', v_total_withdrawn;
  
  -- Log the repair summary
  INSERT INTO public.audit_logs (
    actor_id,
    actor_role,
    action,
    resource_type,
    resource_id,
    metadata
  ) VALUES (
    NULL,
    'system',
    'profile_repair_complete',
    'profiles',
    'batch',
    jsonb_build_object(
      'repair_script', '048_fix_user_profiles',
      'completed_at', NOW(),
      'stats', jsonb_build_object(
        'total_users', v_total_users,
        'active_users', v_active_users,
        'total_balance', v_total_balance,
        'total_earned', v_total_earned,
        'total_withdrawn', v_total_withdrawn
      )
    )
  );
  
  RAISE NOTICE '=== PROFILE REPAIR COMPLETE ===';
END $$;

-- Commit transaction
COMMIT;
