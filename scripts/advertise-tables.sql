-- Advertising Tables

-- Ad Campaigns
CREATE TABLE IF NOT EXISTS ad_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  network TEXT NOT NULL,
  network_name TEXT NOT NULL,
  budget DECIMAL(12, 2) NOT NULL,
  daily_budget DECIMAL(12, 2) NOT NULL,
  spent DECIMAL(12, 2) DEFAULT 0,
  target_url TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  target_countries TEXT[],
  start_date TIMESTAMPTZ DEFAULT NOW(),
  end_date TIMESTAMPTZ,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'paused', 'stopped', 'completed')),
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  cpm DECIMAL(6, 2),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ad Transactions
CREATE TABLE IF NOT EXISTS ad_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES ad_campaigns(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('deposit', 'campaign_created', 'campaign_refund', 'impression', 'click', 'adjustment')),
  amount DECIMAL(12, 2) NOT NULL,
  balance_before DECIMAL(12, 2),
  balance_after DECIMAL(12, 2),
  description TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_user ON ad_campaigns(user_id);
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_status ON ad_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_network ON ad_campaigns(network);
CREATE INDEX IF NOT EXISTS idx_ad_transactions_user ON ad_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_ad_transactions_campaign ON ad_transactions(campaign_id);
CREATE INDEX IF NOT EXISTS idx_ad_transactions_type ON ad_transactions(type);

-- RLS Policies
ALTER TABLE ad_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_transactions ENABLE ROW LEVEL SECURITY;

-- Users can view and update their own campaigns
CREATE POLICY "Users can view own campaigns" ON ad_campaigns FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own campaigns" ON ad_campaigns FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own campaigns" ON ad_campaigns FOR UPDATE USING (auth.uid() = user_id);

-- Users can view their own transactions
CREATE POLICY "Users can view own ad transactions" ON ad_transactions FOR SELECT USING (auth.uid() = user_id);

-- Updated at trigger
CREATE TRIGGER update_ad_campaigns_updated_at BEFORE UPDATE ON ad_campaigns FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
