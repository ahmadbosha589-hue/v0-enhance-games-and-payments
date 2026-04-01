-- Create boosters/packages system tables
-- Run this migration to add boosters functionality

-- Booster tiers table - stores available booster packages
CREATE TABLE IF NOT EXISTS booster_tiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) NOT NULL UNIQUE,
    slug VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    price_usd DECIMAL(10, 2) NOT NULL,
    price_satoshis INTEGER NOT NULL,
    faucet_bonus_percentage INTEGER NOT NULL DEFAULT 0,
    offerwall_bonus_percentage INTEGER NOT NULL DEFAULT 0,
    duration_days INTEGER NOT NULL DEFAULT 7,
    badge_color VARCHAR(20) DEFAULT '#22c55e',
    badge_icon VARCHAR(50) DEFAULT 'zap',
    priority INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    features JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User boosters table - tracks active boosters for users
CREATE TABLE IF NOT EXISTS user_boosters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    booster_tier_id UUID NOT NULL REFERENCES booster_tiers(id) ON DELETE CASCADE,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    is_active BOOLEAN DEFAULT true,
    payment_method VARCHAR(50),
    payment_reference VARCHAR(255),
    amount_paid_usd DECIMAL(10, 2),
    amount_paid_satoshis INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Booster purchase history
CREATE TABLE IF NOT EXISTS booster_purchases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    booster_tier_id UUID NOT NULL REFERENCES booster_tiers(id) ON DELETE CASCADE,
    payment_method VARCHAR(50) NOT NULL,
    payment_status VARCHAR(50) DEFAULT 'pending',
    payment_reference VARCHAR(255),
    amount_usd DECIMAL(10, 2) NOT NULL,
    amount_satoshis INTEGER,
    transaction_hash VARCHAR(255),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_user_boosters_user_id ON user_boosters(user_id);
CREATE INDEX IF NOT EXISTS idx_user_boosters_active ON user_boosters(user_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_user_boosters_expires ON user_boosters(expires_at);
CREATE INDEX IF NOT EXISTS idx_booster_purchases_user ON booster_purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_booster_purchases_status ON booster_purchases(payment_status);

-- Insert default booster tiers
INSERT INTO booster_tiers (name, slug, description, price_usd, price_satoshis, faucet_bonus_percentage, offerwall_bonus_percentage, duration_days, badge_color, badge_icon, priority, features) VALUES
(
    'Basic',
    'basic',
    'Perfect for getting started. Boost your earnings with a solid bonus on all activities.',
    5.00,
    5000,
    100,
    10,
    7,
    '#22c55e',
    'zap',
    1,
    '["100% faucet claim bonus", "10% offerwall bonus", "7 days duration", "Basic badge"]'::jsonb
),
(
    'Pro',
    'pro',
    'Step up your game with enhanced bonuses and longer duration.',
    10.00,
    10000,
    200,
    20,
    15,
    '#3b82f6',
    'flame',
    2,
    '["200% faucet claim bonus", "20% offerwall bonus", "15 days duration", "Pro badge", "Priority support"]'::jsonb
),
(
    'Elite',
    'elite',
    'For serious earners. Maximum bonuses to supercharge your income.',
    20.00,
    20000,
    300,
    35,
    30,
    '#a855f7',
    'crown',
    3,
    '["300% faucet claim bonus", "35% offerwall bonus", "30 days duration", "Elite badge", "Priority support", "Early access to features"]'::jsonb
),
(
    'Legend',
    'legend',
    'The ultimate package. Legendary bonuses for legendary earners.',
    50.00,
    50000,
    500,
    50,
    30,
    '#f59e0b',
    'star',
    4,
    '["500% faucet claim bonus", "50% offerwall bonus", "30 days duration", "Legend badge", "VIP support", "Early access to features", "Exclusive tournaments"]'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
    price_usd = EXCLUDED.price_usd,
    price_satoshis = EXCLUDED.price_satoshis,
    faucet_bonus_percentage = EXCLUDED.faucet_bonus_percentage,
    offerwall_bonus_percentage = EXCLUDED.offerwall_bonus_percentage,
    duration_days = EXCLUDED.duration_days,
    features = EXCLUDED.features,
    updated_at = NOW();

-- Function to get user's active booster
CREATE OR REPLACE FUNCTION get_user_active_booster(p_user_id UUID)
RETURNS TABLE (
    booster_id UUID,
    tier_name VARCHAR(50),
    tier_slug VARCHAR(50),
    faucet_bonus INTEGER,
    offerwall_bonus INTEGER,
    expires_at TIMESTAMPTZ,
    hours_remaining INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ub.id,
        bt.name,
        bt.slug,
        bt.faucet_bonus_percentage,
        bt.offerwall_bonus_percentage,
        ub.expires_at,
        GREATEST(0, EXTRACT(EPOCH FROM (ub.expires_at - NOW())) / 3600)::INTEGER
    FROM user_boosters ub
    JOIN booster_tiers bt ON ub.booster_tier_id = bt.id
    WHERE ub.user_id = p_user_id
      AND ub.is_active = true
      AND ub.expires_at > NOW()
    ORDER BY bt.priority DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Function to apply booster to claim amount
CREATE OR REPLACE FUNCTION apply_booster_to_claim(p_user_id UUID, p_base_amount INTEGER)
RETURNS TABLE (
    final_amount INTEGER,
    bonus_amount INTEGER,
    booster_name VARCHAR(50),
    bonus_percentage INTEGER
) AS $$
DECLARE
    v_booster RECORD;
BEGIN
    SELECT * INTO v_booster FROM get_user_active_booster(p_user_id);
    
    IF v_booster.booster_id IS NOT NULL THEN
        RETURN QUERY SELECT 
            p_base_amount + (p_base_amount * v_booster.faucet_bonus / 100)::INTEGER,
            (p_base_amount * v_booster.faucet_bonus / 100)::INTEGER,
            v_booster.tier_name,
            v_booster.faucet_bonus;
    ELSE
        RETURN QUERY SELECT 
            p_base_amount,
            0::INTEGER,
            NULL::VARCHAR(50),
            0::INTEGER;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Trigger to deactivate expired boosters
CREATE OR REPLACE FUNCTION deactivate_expired_boosters()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE user_boosters
    SET is_active = false, updated_at = NOW()
    WHERE expires_at < NOW() AND is_active = true;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create trigger if not exists (drop first to avoid conflicts)
DROP TRIGGER IF EXISTS trigger_deactivate_expired_boosters ON user_boosters;
CREATE TRIGGER trigger_deactivate_expired_boosters
    AFTER INSERT OR UPDATE ON user_boosters
    FOR EACH STATEMENT
    EXECUTE FUNCTION deactivate_expired_boosters();

-- Add RLS policies
ALTER TABLE booster_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_boosters ENABLE ROW LEVEL SECURITY;
ALTER TABLE booster_purchases ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read booster tiers
CREATE POLICY IF NOT EXISTS "Anyone can read booster tiers" ON booster_tiers
    FOR SELECT USING (true);

-- Users can only see their own boosters
DROP POLICY IF EXISTS "Users can view own boosters" ON user_boosters;
CREATE POLICY "Users can view own boosters" ON user_boosters
    FOR SELECT USING (auth.uid() = user_id);

-- Users can only see their own purchases
DROP POLICY IF EXISTS "Users can view own purchases" ON booster_purchases;
CREATE POLICY "Users can view own purchases" ON booster_purchases
    FOR SELECT USING (auth.uid() = user_id);

-- Service role can do everything
DROP POLICY IF EXISTS "Service role full access boosters" ON user_boosters;
CREATE POLICY "Service role full access boosters" ON user_boosters
    FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access purchases" ON booster_purchases;
CREATE POLICY "Service role full access purchases" ON booster_purchases
    FOR ALL USING (true) WITH CHECK (true);
