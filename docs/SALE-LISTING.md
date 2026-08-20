# Faucero Crypto Faucet Platform — Exclusive Source-Code Asset Sale

**Listing date:** 2026-08-20  
**Asking price:** **$7,500 USD OBO**  
**Realistic negotiation range:** **$4,000–$6,000 USD**  
**Quick-sale range:** **$2,500–$3,500 USD**, depending on included domain, handover, and payment terms.

## Short listing

Faucero is a substantial pre-revenue cryptocurrency faucet and earning-platform codebase built with Next.js, React, TypeScript, Supabase/PostgreSQL, and a production-oriented security architecture.

The buyer receives an exclusive one-time transfer of the seller-owned source-code asset and technical documentation, subject to a signed bill of sale and the project license documents. The system includes faucet claims, referrals, games, offerwalls, PTC, tournaments, advertiser campaigns, admin tools, authentication, 2FA, fraud controls, database migrations, and real payment integrations that become active after the buyer configures their own provider accounts.

This is being sold honestly as a **pre-revenue software asset**, not as a profitable operating business or guaranteed-income website.

## What is included

- Complete Next.js application source code.
- React and TypeScript frontend.
- Supabase/PostgreSQL schema and migration runner.
- Checksum-tracked database migrations through `083_wallet_payment_tx_unique.sql`.
- Public pages, dashboard, admin panel, authentication, and user settings.
- Faucet claims, streaks, referrals, bonuses, achievements, games, tournaments, PTC, shortlinks, and offerwall infrastructure.
- Advertiser campaign creation, HTTPS creative validation, moderation, first-party delivery, click tracking, daily statistics, atomic balance reservation, and refunds.
- Google seller declaration in `public/ads.txt` using the supplied publisher line.
- Consent-aware analytics and advertising components.
- c.cx.ua integration with domain-aware banner behavior and consent gating.
- CCPayment v2 integration:
  - HMAC-SHA-256 request signing.
  - Hosted invoice creation.
  - Merchant/order reconciliation.
  - Risk and underpayment rejection.
  - Idempotent `ApiDeposit` and `ApiWithdrawal` webhook handling.
  - Booster, deposit, swap, and withdrawal paths.
- CWallet payment option routed through the verified CCPayment hosted-checkout flow.
- Optional EVM ERC-20 wallet payments:
  - Injected wallet support such as MetaMask.
  - WalletConnect/Reown QR support.
  - Configurable chain, RPC, token contract, treasury address, token rate, and confirmations.
  - Server-side receipt, transfer-log, destination, amount, and confirmation verification.
  - Transaction-hash reuse prevention.
- Atomic booster purchase and activation RPCs.
- Booster bonuses applied inside the claim transaction.
- Session refresh and sign-out hardening.
- Admin authorization and service-role fail-closed behavior.
- 2FA, JWT verification, rate limiting hooks, fraud checks, CSRF/origin protections, and security logging.
- Buyer-facing README, deployment instructions, environment-variable documentation, database documentation, valuation notes, licensing drafts, and manual verification checklist.

## Current verification evidence

The current repository state has been exercised locally with:

- **147 automated tests passing**.
- **0 TypeScript errors**.
- **0 ESLint errors**.
- **196 production routes generated successfully**.
- Live Supabase migration application and idempotency verification through migration `083`.
- Live rollback tests for booster purchase, booster activation, booster bonus accounting, advertiser flows, and transaction protections.
- Regression tests for authentication refresh races, sign-out, analytics, CCPayment v2, wallet payment primitives, and booster purchase behavior.

## Technical stack

- Next.js 16.
- React 19.
- TypeScript.
- Tailwind CSS and Radix UI components.
- Supabase Auth and PostgreSQL.
- Node.js and npm.
- CCPayment v2 API.
- WalletConnect/Reown Ethereum provider.
- EVM JSON-RPC receipt verification.
- Upstash/Redis-compatible rate limiting.
- Vitest test suite.

## Honest operating status

The project is **not currently a profitable business**.

Known operating facts:

- No demonstrated recurring operating revenue in the reviewed data snapshot.
- No basis for promising guaranteed revenue, advertiser income, user growth, or payouts.
- The public Vercel demo does not contain the buyer's private provider credentials.
- CCPayment and CWallet-via-CCPayment require the buyer's own CCPayment account, credentials, webhook-domain configuration, and small-value test transaction.
- EVM wallet payments require the buyer's own WalletConnect/Reown project ID, RPC endpoint, token contract, treasury wallet, token rate, chain, and confirmation policy.
- FaucetPay requires the buyer's own FaucetPay account and API key.
- Redis/Upstash must be configured for durable production rate limiting.
- AdSense approval, exact publisher tag verification, CMP/TCF configuration, and production advertising compliance remain deployment-specific.
- Rewarded-ad payout flows remain disabled until a verified provider and server-side watch-session proof are configured.
- Authenticated browser, mobile, load, abuse, and final production rollout testing remain the buyer's responsibility.

## Buyer configuration requirements

The buyer must create and own their own:

- Supabase project and database.
- Supabase Auth configuration and OAuth credentials.
- Vercel or other deployment account.
- CCPayment account, App ID, App Secret, and webhook configuration.
- FaucetPay account and API key.
- Redis/Upstash account and credentials.
- WalletConnect/Reown project ID.
- EVM RPC provider account.
- Treasury wallet and supported ERC-20 token configuration.
- AdSense, c.cx.ua, offerwall, CMP, or other advertising accounts.

No private keys, service-role keys, API tokens, passwords, database URLs, user exports, or provider accounts are included.

## Buyer profile

This asset is suited to a buyer who:

- Wants a head start on a crypto faucet or rewards platform.
- Can configure and operate Supabase, Vercel, Redis, payment providers, and ad providers.
- Has a user-acquisition or marketing channel.
- Understands crypto-payment, fraud, AML, payout, privacy, and advertising obligations.
- Wants to customize the brand, rewards economics, supported assets, and monetization strategy.

## Why the price is not based on revenue multiples

There is no verified recurring revenue stream to multiply. The valuation is based on replacement effort, code breadth, security work, documentation, database architecture, payment integration effort, and the opportunity for a buyer with distribution—not on projected revenue or unsupported traffic assumptions.

### Valuation guide

| Sale condition | Indicative value |
|---|---:|
| As-is pre-revenue operating website | $1,000–$5,000 |
| Exclusive source-code/IP package with documentation | $5,000–$12,000 |
| Exclusive package plus domain, deployment handover, and buyer support | $6,000–$15,000 |
| Recommended list price for the current package | $7,500 OBO |
| Practical expected close | $4,000–$6,000 |

The final price depends on whether the domain, brand assets, deployment handover, and support period are included.

## Transfer terms

- One-time exclusive transfer of the seller-owned custom source-code asset.
- Buyer may modify, deploy, commercialize, sublicense, assign, and resell the acquired seller-owned asset after payment and signed transfer documents.
- Third-party dependencies remain subject to their own licenses.
- Provider accounts, credentials, secrets, domains, trademarks, user data, and personal data are excluded unless separately listed in writing.
- The repository was previously public; historical copies may exist and cannot be guaranteed erased.
- The agreement and licensing documents are drafts and should be reviewed by a qualified lawyer.
- Exact included assets, support period, price, payment schedule, and jurisdiction must be written into a signed bill of sale.

## Buyer handover

Proposed handover package:

1. Private repository access or source archive delivery after the agreed payment milestone.
2. Environment-variable and provider setup checklist.
3. Supabase migration instructions.
4. Deployment walkthrough.
5. Explanation of CCPayment/CWallet-via-CCPayment and EVM wallet configuration.
6. Review of the verification commands and known deployment gates.

Any support duration or live implementation assistance should be stated explicitly in the bill of sale.

## Suggested buyer questions and answers

### Is this profitable?

No. It is a pre-revenue software asset. No guaranteed revenue, active advertiser revenue, or profitable operation is claimed.

### Are payments already live?

The code paths are implemented and tested, but provider enablement requires the buyer's own accounts, credentials, webhook setup, and controlled test transactions.

### Does CWallet work?

CWallet booster payments use the verified CCPayment hosted checkout path. A Cwallet user can pay from their Cwallet wallet through that checkout. It is enabled automatically when CCPayment credentials are configured.

### Does WalletConnect work?

The source includes the EVM ERC-20 WalletConnect/injected-wallet flow and server-side verification. It becomes available after the buyer configures a Reown project ID, chain, RPC, token contract, treasury address, token rate, and confirmation count.

### Are users or revenue included?

No user database export, private user data, provider accounts, or guaranteed revenue is included.

### Is the price negotiable?

Yes. The listing price is $7,500 OBO. A realistic close depends on the included domain, handover, support, and buyer payment terms.

## Contact / transaction note

Use a written bill of sale. Before payment, identify the exact repository, commit, domain, brand assets, archive, support period, and included/excluded rights. Do not exchange or request secrets through a public listing.
