-- Refresh Supabase schema cache
-- Run this after creating tables to make them visible to the PostgREST API

-- Notify PostgREST to reload its schema cache
NOTIFY pgrst, 'reload schema';

-- Grant permissions explicitly to ensure tables are accessible
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO anon;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Ensure RLS is properly configured on all tables
ALTER TABLE IF EXISTS public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.withdrawals ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.tournament_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.fraud_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.device_fingerprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.ip_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.ad_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.adblock_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.shortlinks ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.shortlink_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.coupon_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.offerwall_conversions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.game_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.game_cooldowns ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.manual_faucet_claims ENABLE ROW LEVEL SECURITY;

-- Done
SELECT 'Schema cache refresh completed' as status;
