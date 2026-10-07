// Database types for the Crypto Faucet Platform

export type UserRole = "user" | "moderator" | "admin" | "superadmin"
export type AccountStatus = "active" | "suspended" | "banned" | "pending_verification"
export type TransactionType = "claim" | "referral_bonus" | "withdrawal" | "adjustment" | "bonus"
export type TransactionStatus = "pending" | "completed" | "failed" | "cancelled"
export type WithdrawalStatus = "pending" | "processing" | "completed" | "failed" | "cancelled" | "flagged"
export type FraudFlagStatus = "pending_review" | "confirmed_fraud" | "false_positive" | "under_investigation"
export type NotificationType =
  | "claim_success"
  | "withdrawal_completed"
  | "withdrawal_failed"
  | "referral_signup"
  | "referral_bonus"
  | "account_warning"
  | "system_announcement"
  | "security_alert"

export interface Profile {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
  role: UserRole
  status: AccountStatus
  balance_satoshis: number
  total_earned_satoshis: number
  total_withdrawn_satoshis: number
  referral_code: string
  referred_by: string | null
  referral_count: number
  referral_earnings_satoshis: number
  last_claim_at: string | null
  total_claims: number
  claim_streak: number
  max_claim_streak: number
  two_factor_enabled: boolean
  fraud_score: number
  is_flagged: boolean
  faucetpay_email: string | null
  faucetpay_verified: boolean
  created_at: string
  updated_at: string
  last_active_at: string
  banned_at: string | null
  banned_reason: string | null
  last_daily_bonus_at: string | null
  total_daily_bonuses: number
}

export interface Claim {
  id: string
  user_id: string
  amount_satoshis: number
  base_amount_satoshis: number
  streak_bonus_satoshis: number
  referral_bonus_satoshis: number
  streak_day: number
  ip_address: string
  user_agent: string | null
  device_fingerprint: string | null
  fraud_score: number
  is_flagged: boolean
  flag_reason: string | null
  created_at: string
}

export interface Transaction {
  id: string
  user_id: string
  type: TransactionType
  status: TransactionStatus
  amount_satoshis: number
  balance_before: number
  balance_after: number
  claim_id: string | null
  withdrawal_id: string | null
  referral_id: string | null
  description: string | null
  metadata: Record<string, unknown>
  idempotency_key: string | null
  created_at: string
  completed_at: string | null
}

export interface Withdrawal {
  id: string
  user_id: string
  amount_satoshis: number
  fee_satoshis: number
  net_amount_satoshis: number
  status: WithdrawalStatus
  payment_method: string
  payment_address: string
  payment_currency: string
  faucetpay_payout_id: string | null
  tx_hash?: string | null
  faucetpay_response: Record<string, unknown> | null
  processed_at: string | null
  processed_by: string | null
  fraud_score: number
  is_flagged: boolean
  flag_reason: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  review_notes: string | null
  action_taken: string | null
  created_at: string
  updated_at: string
}

export interface FraudFlag {
  id: string
  user_id: string
  status: FraudFlagStatus
  fraud_type: string
  severity: number
  evidence: Record<string, unknown>
  ip_addresses: string[]
  device_fingerprints: string[]
  related_user_ids: string[]
  related_claim_ids: string[]
  related_withdrawal_ids: string[]
  resolved_by: string | null
  resolved_at: string | null
  resolution_notes: string | null
  action_taken: string | null
  created_at: string
  updated_at: string
}

export interface Notification {
  id: string
  user_id: string
  type: NotificationType
  title: string
  message: string
  data: Record<string, unknown>
  action_url: string | null
  is_read: boolean
  read_at: string | null
  created_at: string
  expires_at: string | null
}

export interface SystemSetting {
  key: string
  value: unknown
  description: string | null
  updated_by: string | null
  updated_at: string
}

export interface UserStats {
  total_balance: number
  total_earned: number
  total_withdrawn: number
  total_claims: number
  current_streak: number
  max_streak: number
  referral_count: number
  referral_earnings: number
  rank_position: number
}

export interface LeaderboardEntry {
  rank: number
  user_id: string
  username: string | null
  display_name: string | null
  total_earned: number
  total_claims: number
  max_streak: number
}

export interface ClaimEligibility {
  can_claim: boolean
  seconds_until_claim: number
  reason: string
}

export interface ClaimAmount {
  base_amount: number
  streak_bonus: number
  total_amount: number
  current_streak: number
}

export interface AuditLog {
  id: string
  actor_id: string | null
  actor_role: string | null
  actor_ip: string | null
  action: string
  resource_type: string | null
  resource_id: string | null
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
  metadata: Record<string, unknown> | null
  created_at: string
}
