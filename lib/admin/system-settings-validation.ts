/**
 * Server-side bounds for economy-critical system settings.
 *
 * Mirrors the FieldConfig min/max in components/admin/system-settings-form.tsx.
 * The form's HTML min/max attributes are client-side only — the settings route
 * validates every key against these ranges before persisting, and rejects
 * unknown keys outright (no arbitrary-key upserts).
 */

export const SYSTEM_SETTING_RANGES: Record<string, { min: number; max: number }> = {
  base_claim_amount_satoshis: { min: 1, max: 10000 },
  max_claim_amount_satoshis: { min: 1, max: 100000 },
  claim_cooldown_seconds: { min: 60, max: 86400 },
  streak_bonus_percentage: { min: 0, max: 50 },
  max_streak_bonus_percentage: { min: 0, max: 500 },
  minimum_withdrawal_satoshis: { min: 1000, max: 1000000 },
  maximum_withdrawal_satoshis: { min: 1000, max: 10000000 },
  daily_withdrawal_limit_satoshis: { min: 10000, max: 10000000 },
  withdrawal_fee_percentage: { min: 0, max: 20 },
  manual_review_threshold: { min: 0, max: 100 },
  auto_ban_threshold: { min: 0, max: 100 },
  max_accounts_per_ip: { min: 1, max: 100 },
  max_accounts_per_device: { min: 1, max: 100 },
}

export interface SettingValidationResult {
  valid: Record<string, number>
  errors: { key: string; error: string }[]
}

export function validateSystemSettingUpdates(updates: Record<string, unknown>): SettingValidationResult {
  const valid: Record<string, number> = {}
  const errors: { key: string; error: string }[] = []

  for (const [key, raw] of Object.entries(updates)) {
    const range = SYSTEM_SETTING_RANGES[key]
    if (!range) {
      errors.push({ key, error: "Unknown setting key" })
      continue
    }
    // Empty inputs arrive as "" from the form; treat as invalid rather than
    // silently coercing to 0.
    const value = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw) : NaN

    if (!Number.isFinite(value) || !Number.isInteger(value)) {
      errors.push({ key, error: "Must be an integer" })
      continue
    }
    if (value < range.min || value > range.max) {
      errors.push({ key, error: `Must be between ${range.min} and ${range.max}` })
      continue
    }
    valid[key] = value
  }

  return { valid, errors }
}
