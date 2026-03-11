-- Crypto Faucet Platform - Database Schema
-- Script 001: Create custom types and enums

-- User roles for RBAC
CREATE TYPE user_role AS ENUM ('user', 'moderator', 'admin', 'superadmin');

-- Account status
CREATE TYPE account_status AS ENUM ('active', 'suspended', 'banned', 'pending_verification');

-- Transaction types
CREATE TYPE transaction_type AS ENUM ('claim', 'referral_bonus', 'withdrawal', 'adjustment', 'bonus');

-- Transaction status
CREATE TYPE transaction_status AS ENUM ('pending', 'completed', 'failed', 'cancelled');

-- Withdrawal status
CREATE TYPE withdrawal_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'cancelled', 'flagged');

-- Fraud flag status
CREATE TYPE fraud_flag_status AS ENUM ('pending_review', 'confirmed_fraud', 'false_positive', 'under_investigation');

-- Audit action types
CREATE TYPE audit_action AS ENUM (
  'user_created', 'user_updated', 'user_banned', 'user_unbanned',
  'claim_created', 'claim_flagged',
  'withdrawal_requested', 'withdrawal_approved', 'withdrawal_rejected', 'withdrawal_completed',
  'referral_created', 'referral_bonus_paid',
  'fraud_flag_created', 'fraud_flag_resolved',
  'admin_action', 'system_action'
);

-- Notification types
CREATE TYPE notification_type AS ENUM (
  'claim_success', 'withdrawal_completed', 'withdrawal_failed',
  'referral_signup', 'referral_bonus', 'account_warning',
  'system_announcement', 'security_alert'
);
