-- Crypto Faucet Platform - Database Schema
-- Script 025: Add missing transaction types to enum

-- Add new transaction types to the enum
ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'daily_bonus';
ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'streak_bonus';
ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'signup_bonus';
ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'achievement';
ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'offerwall';
ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'ptc';

-- Note: After running this migration, existing 'bonus' transactions 
-- that are actually daily/streak/signup bonuses will still show as 'bonus'
-- You may want to update them manually or leave them as-is
