-- Crypto Faucet Platform - Database Schema
-- Script 008: Create IP addresses tracking table

CREATE TABLE IF NOT EXISTS public.ip_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- IP info
  ip_address INET NOT NULL UNIQUE,
  
  -- Geolocation (from IP lookup)
  country_code TEXT,
  country_name TEXT,
  region TEXT,
  city TEXT,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  isp TEXT,
  organization TEXT,
  
  -- Risk assessment
  is_vpn BOOLEAN DEFAULT FALSE,
  is_proxy BOOLEAN DEFAULT FALSE,
  is_tor BOOLEAN DEFAULT FALSE,
  is_datacenter BOOLEAN DEFAULT FALSE,
  risk_score INTEGER DEFAULT 0 NOT NULL CHECK (risk_score >= 0 AND risk_score <= 100),
  is_blocked BOOLEAN DEFAULT FALSE NOT NULL,
  block_reason TEXT,
  
  -- Usage stats
  total_users INTEGER DEFAULT 0 NOT NULL,
  total_claims INTEGER DEFAULT 0 NOT NULL,
  flagged_claims INTEGER DEFAULT 0 NOT NULL,
  
  -- Timestamps
  first_seen_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  last_seen_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  blocked_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_ip_addresses_ip ON public.ip_addresses(ip_address);
CREATE INDEX idx_ip_addresses_risk_score ON public.ip_addresses(risk_score DESC);
CREATE INDEX idx_ip_addresses_is_blocked ON public.ip_addresses(is_blocked) WHERE is_blocked = TRUE;
CREATE INDEX idx_ip_addresses_country ON public.ip_addresses(country_code);

-- Enable RLS
ALTER TABLE public.ip_addresses ENABLE ROW LEVEL SECURITY;

-- Fixed RLS policies to use correct Supabase auth functions
-- Only admins can view IP addresses
CREATE POLICY "ip_addresses_admin_select" ON public.ip_addresses
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'superadmin', 'moderator')
    )
  );

-- Removed service_role policy - service role bypasses RLS automatically
-- Admins can insert/update IP addresses
CREATE POLICY "ip_addresses_admin_insert" ON public.ip_addresses
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'superadmin')
    )
  );

CREATE POLICY "ip_addresses_admin_update" ON public.ip_addresses
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'superadmin')
    )
  );
