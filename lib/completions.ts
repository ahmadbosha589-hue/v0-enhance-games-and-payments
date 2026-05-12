// ============================================================================
// Offerwall Completions — unified data layer
// ----------------------------------------------------------------------------
// Single source of truth for "what has the user (and platform) completed on
// any offerwall?". Reads from BOTH tables and reconciles them:
//
//   * `offerwall_conversions` — primary, written first by the postback
//     handler the moment we verify the signature. Holds offer_id, offer_name,
//     payout_satoshis, status, provider_id, processed_at.
//
//   * `transactions` (type='offerwall') — secondary, written AFTER the
//     balance update succeeds. Holds the canonical balance_after & description.
//
// The postback flow is: insert conversion → update balance → insert
// transaction → insert notification. If anything after step 1 fails the
// conversion still exists but the transaction may not, which is why the old
// `/api/transactions` based stats showed completions as 0 even after a
// successful crediting. Reading conversions as the primary list and joining
// in `transactions` for richer metadata fixes that class of bug for good.
// ============================================================================

import { createAdminClient } from "@/lib/supabase/server"

// ── Public types ────────────────────────────────────────────────────────────

export interface Completion {
  /** stable id — conversion id when available, else transaction id */
  id: string
  source: "conversion" | "transaction"
  user_id: string
  /** canonical provider slug (e.g. "ccxua", "cpx-research") */
  provider: string | null
  provider_name: string | null
  provider_id: string | null
  offer_id: string | null
  offer_name: string | null
  amount_satoshis: number
  /** alias used by older UI code that expected /api/transactions shape */
  amount: number
  description: string
  status: string
  transaction_id: string | null
  /** prefer processed_at when available, fall back to created_at */
  created_at: string
  metadata: Record<string, unknown>
}

export interface CompletionStats {
  total_completions: number
  total_earned_satoshis: number
  approved_completions: number
  pending_completions: number
  rejected_completions: number
  last_completion_at: string | null
}

export interface ProviderCompletionStats {
  provider_slug: string
  total_paid: number
  completion_count: number
  user_earnings: number
  user_completions: number
}

interface ListOptions {
  /** when set, only completions for this user (used by user-facing views) */
  userId?: string
  /** when set, only completions for this provider slug (e.g. "ccxua") */
  providerSlug?: string
  /** when set, only completions for this provider id (uuid) */
  providerId?: string
  /** statuses to include (defaults to approved + completed) */
  statuses?: string[]
  /** page size, capped at 100 */
  limit?: number
  /** offset for pagination */
  offset?: number
}

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 100
const APPROVED_STATUSES = ["approved", "completed"]

// ── Internal: shape rows from both tables into a single Completion ──────────

type JoinedProvider = { slug: string | null; name: string | null }

interface ConversionRow {
  id: string
  user_id: string
  provider_id: string | null
  offer_id: string | null
  offer_name: string | null
  payout_satoshis: number | string | null
  /** legacy column from the older schema variant — see scripts/000_...sql */
  amount_satoshis?: number | string | null
  status: string | null
  transaction_id: string | null
  processed_at: string | null
  created_at: string
  metadata: Record<string, unknown> | null
  // Joined provider — PostgREST returns this as a single object when the FK
  // points at a one-to-one parent, but some Supabase client versions
  // collapse it into a single-element array. Accept both.
  offerwall_providers?: JoinedProvider | JoinedProvider[] | null
}

function pickJoinedProvider(joined: ConversionRow["offerwall_providers"]): JoinedProvider | null {
  if (!joined) return null
  if (Array.isArray(joined)) return joined[0] ?? null
  return joined
}

interface TransactionRow {
  id: string
  user_id: string
  type: string
  status: string
  amount_satoshis: number | string | null
  description: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

function toNum(v: unknown): number {
  if (v == null) return 0
  const n = typeof v === "number" ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

function normalizeConversion(row: ConversionRow): Completion {
  const joined = pickJoinedProvider(row.offerwall_providers)
  const provider = joined?.slug ?? null
  const providerName = joined?.name ?? null
  // Support both schema variants — payout_satoshis (preferred) and the
  // legacy amount_satoshis column from /scripts/000_*_FIXED.sql.
  const sats = toNum(row.payout_satoshis ?? row.amount_satoshis ?? 0)
  const description = row.offer_name
    ? `${row.offer_name}${provider ? ` (${provider})` : ""}`
    : provider
      ? `Offerwall reward (${provider})`
      : "Offerwall reward"
  return {
    id: row.id,
    source: "conversion",
    user_id: row.user_id,
    provider,
    provider_name: providerName,
    provider_id: row.provider_id,
    offer_id: row.offer_id,
    offer_name: row.offer_name,
    amount_satoshis: sats,
    amount: sats,
    description,
    status: row.status ?? "approved",
    transaction_id: row.transaction_id,
    created_at: row.processed_at || row.created_at,
    metadata: row.metadata ?? {},
  }
}

function normalizeTransaction(row: TransactionRow): Completion {
  const meta = (row.metadata ?? {}) as Record<string, unknown>
  const provider =
    typeof meta.provider === "string"
      ? meta.provider
      : typeof meta.providerSlug === "string"
        ? meta.providerSlug
        : null
  const offerId =
    typeof meta.offer_id === "string"
      ? meta.offer_id
      : typeof meta.offerId === "string"
        ? meta.offerId
        : null
  const transactionId =
    typeof meta.transaction_id === "string"
      ? meta.transaction_id
      : typeof meta.transactionId === "string"
        ? meta.transactionId
        : null
  const sats = toNum(row.amount_satoshis)
  return {
    id: row.id,
    source: "transaction",
    user_id: row.user_id,
    provider,
    provider_name: null,
    provider_id: null,
    offer_id: offerId,
    offer_name: null,
    amount_satoshis: sats,
    amount: sats,
    description: row.description || (provider ? `Offerwall reward (${provider})` : "Offerwall reward"),
    status: row.status,
    transaction_id: transactionId,
    created_at: row.created_at,
    metadata: meta,
  }
}

/**
 * Public normalizer — useful when callers want to massage rows they fetched
 * themselves (e.g. through a database trigger or admin export).
 */
export function normalizeCompletion(row: ConversionRow | TransactionRow): Completion {
  if ("payout_satoshis" in row || "provider_id" in row || "offerwall_providers" in row) {
    return normalizeConversion(row as ConversionRow)
  }
  return normalizeTransaction(row as TransactionRow)
}

// ── Provider slug → id cache (per-request) ──────────────────────────────────

async function resolveProviderId(slug: string): Promise<string | null> {
  const supabase = createAdminClient()
  if (!supabase) return null
  const { data } = await supabase
    .from("offerwall_providers")
    .select("id")
    .eq("slug", slug)
    .maybeSingle()
  return data?.id ?? null
}

// ── Core list helper ────────────────────────────────────────────────────────

/**
 * Fetch a deduplicated list of completions from both tables. Conversions are
 * preferred when a row appears in both — they carry richer offer/provider
 * metadata and reflect the moment crediting started, not when the balance
 * update finished. Returns rows sorted by `created_at` desc.
 */
export async function listCompletions(options: ListOptions = {}): Promise<{
  completions: Completion[]
  total: number
}> {
  const supabase = createAdminClient()
  if (!supabase) return { completions: [], total: 0 }

  const limit = Math.min(Math.max(options.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT)
  const offset = Math.max(options.offset ?? 0, 0)
  const statuses = options.statuses && options.statuses.length > 0 ? options.statuses : APPROVED_STATUSES

  // ── 1. offerwall_conversions (primary) ───────────────────────────────────
  let convQuery = supabase
    .from("offerwall_conversions")
    .select(
      "id, user_id, provider_id, offer_id, offer_name, payout_satoshis, status, transaction_id, processed_at, created_at, metadata, offerwall_providers:provider_id ( slug, name )",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })

  if (options.userId) convQuery = convQuery.eq("user_id", options.userId)
  if (statuses.length === 1) convQuery = convQuery.eq("status", statuses[0])
  else if (statuses.length > 1) convQuery = convQuery.in("status", statuses)

  if (options.providerId) {
    convQuery = convQuery.eq("provider_id", options.providerId)
  } else if (options.providerSlug) {
    const pid = await resolveProviderId(options.providerSlug)
    if (pid) convQuery = convQuery.eq("provider_id", pid)
    else convQuery = convQuery.eq("provider_id", "00000000-0000-0000-0000-000000000000") // force-empty
  }

  // Over-fetch slightly so we have headroom when deduplicating against
  // transactions; we re-slice to `limit` at the end.
  const overscan = Math.min(limit * 2 + offset, MAX_LIMIT * 2)
  convQuery = convQuery.range(0, overscan - 1)

  const { data: convRows, count: convCount } = await convQuery
  const conversions = (convRows ?? []).map((r) => normalizeConversion(r as unknown as ConversionRow))

  // ── 2. transactions (secondary — fill gaps) ──────────────────────────────
  // A transaction row counts only when its postback never wrote a conversion
  // (e.g. legacy data, manual credit, or a provider that wrote straight to
  // transactions). We key on metadata.transaction_id so a re-crediting of
  // the same offer never double-counts.
  let txQuery = supabase
    .from("transactions")
    .select("id, user_id, type, status, amount_satoshis, description, metadata, created_at", { count: "exact" })
    .eq("type", "offerwall")
    .order("created_at", { ascending: false })

  if (options.userId) txQuery = txQuery.eq("user_id", options.userId)
  // transactions uses "completed" historically; map any APPROVED_STATUSES into "completed".
  const wantsApproved = statuses.some((s) => APPROVED_STATUSES.includes(s))
  if (wantsApproved) txQuery = txQuery.eq("status", "completed")
  else if (statuses.length === 1) txQuery = txQuery.eq("status", statuses[0])
  else if (statuses.length > 1) txQuery = txQuery.in("status", statuses)

  if (options.providerSlug) {
    // metadata->>provider holds canonical slug (postback always writes it);
    // fall back to description ILIKE for legacy rows.
    txQuery = txQuery.or(
      `metadata->>provider.eq.${options.providerSlug},description.ilike.%${options.providerSlug}%`,
    )
  }

  txQuery = txQuery.range(0, overscan - 1)
  const { data: txRows, count: txCount } = await txQuery
  const transactions = (txRows ?? []).map((r) => normalizeTransaction(r as unknown as TransactionRow))

  // ── 3. Merge & dedupe ────────────────────────────────────────────────────
  const seenTxIds = new Set<string>()
  for (const c of conversions) {
    if (c.transaction_id) seenTxIds.add(c.transaction_id)
  }
  const uniqueTx = transactions.filter((t) => {
    const txId =
      (t.transaction_id ?? (t.metadata as { transaction_id?: string })?.transaction_id) || null
    return !txId || !seenTxIds.has(txId)
  })

  const merged = [...conversions, ...uniqueTx].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )

  const paged = merged.slice(offset, offset + limit)
  const total = (convCount ?? conversions.length) + uniqueTx.length

  return { completions: paged, total }
}

// ── User-centric helpers ────────────────────────────────────────────────────

export async function getRecentCompletions(userId: string, limit = 5): Promise<Completion[]> {
  const { completions } = await listCompletions({ userId, limit })
  return completions
}

export async function getUserCompletions(
  userId: string,
  options: Omit<ListOptions, "userId"> = {},
): Promise<{ completions: Completion[]; total: number }> {
  return listCompletions({ ...options, userId })
}

export async function getUserCompletionStats(userId: string): Promise<CompletionStats> {
  const supabase = createAdminClient()
  if (!supabase) {
    return {
      total_completions: 0,
      total_earned_satoshis: 0,
      approved_completions: 0,
      pending_completions: 0,
      rejected_completions: 0,
      last_completion_at: null,
    }
  }

  const [{ data: convRows }, { data: txRows }] = await Promise.all([
    supabase
      .from("offerwall_conversions")
      .select("payout_satoshis, status, processed_at, created_at, transaction_id")
      .eq("user_id", userId),
    supabase
      .from("transactions")
      .select("amount_satoshis, status, created_at, metadata")
      .eq("user_id", userId)
      .eq("type", "offerwall"),
  ])

  const seen = new Set<string>()
  let totalEarned = 0
  let totalCount = 0
  let approved = 0
  let pending = 0
  let rejected = 0
  let last: string | null = null

  for (const r of convRows ?? []) {
    if (r.transaction_id) seen.add(r.transaction_id)
    const sats = toNum(r.payout_satoshis)
    const status = (r.status || "").toLowerCase()
    const isApproved = APPROVED_STATUSES.includes(status)
    if (isApproved) {
      approved++
      totalEarned += sats
      totalCount++
    } else if (status === "pending") {
      pending++
    } else if (status === "rejected" || status === "reversed" || status === "chargeback") {
      rejected++
    }
    const stamp = r.processed_at || r.created_at
    if (stamp && (!last || stamp > last)) last = stamp
  }

  for (const r of txRows ?? []) {
    const meta = (r.metadata ?? {}) as { transaction_id?: string }
    if (meta.transaction_id && seen.has(meta.transaction_id)) continue
    const status = (r.status || "").toLowerCase()
    const sats = toNum(r.amount_satoshis)
    if (status === "completed") {
      approved++
      totalEarned += sats
      totalCount++
    } else if (status === "pending") {
      pending++
    } else if (status === "rejected" || status === "failed" || status === "reversed") {
      rejected++
    }
    if (r.created_at && (!last || r.created_at > last)) last = r.created_at
  }

  return {
    total_completions: totalCount,
    total_earned_satoshis: totalEarned,
    approved_completions: approved,
    pending_completions: pending,
    rejected_completions: rejected,
    last_completion_at: last,
  }
}

// ── Provider-centric helpers ────────────────────────────────────────────────

/**
 * Per-provider aggregate stats. `userId` is optional — when omitted the
 * `user_*` fields stay at 0. Used by /api/offerwalls to render the per-card
 * counters and global "active offerwalls" rollup.
 */
export async function getProviderCompletionStats(
  providerSlug: string,
  userId?: string,
): Promise<ProviderCompletionStats> {
  const supabase = createAdminClient()
  if (!supabase) {
    return {
      provider_slug: providerSlug,
      total_paid: 0,
      completion_count: 0,
      user_earnings: 0,
      user_completions: 0,
    }
  }

  const providerId = await resolveProviderId(providerSlug)

  // ── Platform totals from offerwall_conversions ───────────────────────────
  let totalPaid = 0
  let completionCount = 0
  let userEarnings = 0
  let userCompletions = 0
  const seenTxIds = new Set<string>()

  if (providerId) {
    const { data: allConv } = await supabase
      .from("offerwall_conversions")
      .select("payout_satoshis, user_id, transaction_id")
      .eq("provider_id", providerId)
      .in("status", APPROVED_STATUSES)

    for (const r of allConv ?? []) {
      const sats = toNum(r.payout_satoshis)
      totalPaid += sats
      completionCount++
      if (r.transaction_id) seenTxIds.add(r.transaction_id)
      if (userId && r.user_id === userId) {
        userEarnings += sats
        userCompletions++
      }
    }
  }

  // ── Backfill from transactions for rows the postback never wrote a
  //    conversion for (legacy data, manual credits, etc.) ──────────────────
  const orFilter = `metadata->>provider.eq.${providerSlug},description.ilike.%${providerSlug}%`
  const { data: txRows } = await supabase
    .from("transactions")
    .select("amount_satoshis, user_id, metadata")
    .eq("type", "offerwall")
    .eq("status", "completed")
    .or(orFilter)

  for (const r of txRows ?? []) {
    const meta = (r.metadata ?? {}) as { transaction_id?: string }
    if (meta.transaction_id && seenTxIds.has(meta.transaction_id)) continue
    const sats = toNum(r.amount_satoshis)
    totalPaid += sats
    completionCount++
    if (userId && r.user_id === userId) {
      userEarnings += sats
      userCompletions++
    }
  }

  return {
    provider_slug: providerSlug,
    total_paid: totalPaid,
    completion_count: completionCount,
    user_earnings: userEarnings,
    user_completions: userCompletions,
  }
}

// ── Platform-wide helpers ───────────────────────────────────────────────────

export interface PlatformCompletionStats {
  total_paid_all_offerwalls: number
  total_completions: number
  unique_earners: number
}

export async function getPlatformCompletionStats(): Promise<PlatformCompletionStats> {
  const supabase = createAdminClient()
  if (!supabase) {
    return { total_paid_all_offerwalls: 0, total_completions: 0, unique_earners: 0 }
  }

  const [{ data: convRows }, { data: txRows }] = await Promise.all([
    supabase
      .from("offerwall_conversions")
      .select("payout_satoshis, user_id, transaction_id")
      .in("status", APPROVED_STATUSES),
    supabase
      .from("transactions")
      .select("amount_satoshis, user_id, metadata")
      .eq("type", "offerwall")
      .eq("status", "completed"),
  ])

  const seenTxIds = new Set<string>()
  const earners = new Set<string>()
  let total = 0
  let count = 0

  for (const r of convRows ?? []) {
    const sats = toNum(r.payout_satoshis)
    total += sats
    count++
    earners.add(r.user_id)
    if (r.transaction_id) seenTxIds.add(r.transaction_id)
  }
  for (const r of txRows ?? []) {
    const meta = (r.metadata ?? {}) as { transaction_id?: string }
    if (meta.transaction_id && seenTxIds.has(meta.transaction_id)) continue
    const sats = toNum(r.amount_satoshis)
    total += sats
    count++
    earners.add(r.user_id)
  }

  return {
    total_paid_all_offerwalls: total,
    total_completions: count,
    unique_earners: earners.size,
  }
}
