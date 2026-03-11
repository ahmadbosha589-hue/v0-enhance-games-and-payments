-- =====================================================
-- Performance Indexes and Database Optimizations
-- =====================================================

-- Claims table indexes
CREATE INDEX IF NOT EXISTS idx_claims_user_created ON claims(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_claims_ip_created ON claims(ip_address, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_claims_fingerprint ON claims(device_fingerprint);
CREATE INDEX IF NOT EXISTS idx_claims_flagged ON claims(is_flagged) WHERE is_flagged = true;
CREATE INDEX IF NOT EXISTS idx_claims_fraud_score ON claims(fraud_score DESC) WHERE fraud_score > 50;

-- Transactions table indexes
CREATE INDEX IF NOT EXISTS idx_transactions_user_created ON transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_idempotency ON transactions(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- Withdrawals table indexes
CREATE INDEX IF NOT EXISTS idx_withdrawals_user_created ON withdrawals(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON withdrawals(status);
CREATE INDEX IF NOT EXISTS idx_withdrawals_pending ON withdrawals(status, created_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_withdrawals_flagged ON withdrawals(is_flagged) WHERE is_flagged = true;
CREATE INDEX IF NOT EXISTS idx_withdrawals_idempotency ON withdrawals(idempotency_key);

-- Profiles table indexes
CREATE INDEX IF NOT EXISTS idx_profiles_referral_code ON profiles(referral_code);
CREATE INDEX IF NOT EXISTS idx_profiles_referred_by ON profiles(referred_by);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_status ON profiles(status);
CREATE INDEX IF NOT EXISTS idx_profiles_flagged ON profiles(is_flagged) WHERE is_flagged = true;
CREATE INDEX IF NOT EXISTS idx_profiles_fraud_score ON profiles(fraud_score DESC) WHERE fraud_score > 50;
CREATE INDEX IF NOT EXISTS idx_profiles_earnings ON profiles(total_earned_satoshis DESC);

-- IP addresses indexes
CREATE INDEX IF NOT EXISTS idx_ip_addresses_ip ON ip_addresses(ip_address);
CREATE INDEX IF NOT EXISTS idx_ip_addresses_blocked ON ip_addresses(is_blocked) WHERE is_blocked = true;
CREATE INDEX IF NOT EXISTS idx_ip_addresses_risk ON ip_addresses(risk_score DESC);
CREATE INDEX IF NOT EXISTS idx_ip_addresses_country ON ip_addresses(country_code);

-- Device fingerprints indexes
CREATE INDEX IF NOT EXISTS idx_device_fingerprints_hash ON device_fingerprints(fingerprint_hash);
CREATE INDEX IF NOT EXISTS idx_device_fingerprints_user ON device_fingerprints(user_id);
CREATE INDEX IF NOT EXISTS idx_device_fingerprints_trusted ON device_fingerprints(is_trusted);

-- Fraud flags indexes
CREATE INDEX IF NOT EXISTS idx_fraud_flags_user ON fraud_flags(user_id);
CREATE INDEX IF NOT EXISTS idx_fraud_flags_status ON fraud_flags(status);
CREATE INDEX IF NOT EXISTS idx_fraud_flags_severity ON fraud_flags(severity DESC);
-- Fixed enum value from 'pending' to 'pending_review'
CREATE INDEX IF NOT EXISTS idx_fraud_flags_pending ON fraud_flags(status, severity DESC) WHERE status = 'pending_review';

-- Audit logs indexes
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);

-- Notifications indexes
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_expires ON notifications(expires_at) WHERE expires_at IS NOT NULL;

-- =====================================================
-- Analyze tables for query optimization
-- =====================================================
ANALYZE profiles;
ANALYZE claims;
ANALYZE transactions;
ANALYZE withdrawals;
ANALYZE fraud_flags;
ANALYZE ip_addresses;
ANALYZE device_fingerprints;
ANALYZE audit_logs;
ANALYZE notifications;
