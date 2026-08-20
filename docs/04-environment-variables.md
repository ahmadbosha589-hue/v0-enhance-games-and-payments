# Environment Variables

Create a `.env.local` file in the root directory with the following variables:

---

## Core Configuration

\`\`\`env
# Application URL (no trailing slash)
NEXT_PUBLIC_APP_URL=https://your-domain.com
\`\`\`

---

## Supabase Configuration

\`\`\`env
# Supabase Project URL
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co

# Supabase Anonymous Key (safe for client-side)
NEXT_PUBLIC_SUPABASE_ANON_KEY=[REDACTED_PUBLISHABLE_KEY]

# Supabase Service Role Key (server-side only, keep secret!)
SUPABASE_SERVICE_ROLE_KEY=[REDACTED_SERVICE_ROLE_KEY]

# Migration-compatible Postgres URL (server-side only)
DATABASE_URL=[REDACTED_DATABASE_URL]

# Dedicated signing secret for Shortlink/PTC server watch sessions.
# Keep it stable across deployments; if omitted, the server-role key is used.
REWARD_SESSION_SECRET=[REDACTED_REWARD_SESSION_SECRET]

# Supabase JWT secret, if required by the deployed auth verification path
SUPABASE_JWT_SECRET=[REDACTED_JWT_SECRET]
\`\`\`

**Where to find these:**
1. Go to your Supabase project
2. Navigate to Settings → API
3. Copy the relevant keys

---

## Authentication

\`\`\`env
# Google OAuth (optional)
NEXT_PUBLIC_GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxx
\`\`\`

**Setup Google OAuth:**
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select existing
3. Enable Google+ API
4. Create OAuth 2.0 credentials
5. Add authorized redirect URIs:
   - `https://your-domain.com/auth/callback`
   - `https://xxxxx.supabase.co/auth/v1/callback`

---

## Direct Wallet / WalletConnect ERC-20 Payments

The booster wallet option is configuration-gated and verifies the transaction on
chain before activation. Configure all of these values in the buyer's deployment:

```env
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your-reown-project-id
WALLET_PAYMENT_CHAIN_ID=1
WALLET_PAYMENT_CHAIN_NAME=Ethereum Mainnet
WALLET_PAYMENT_RPC_URL=https://your-rpc-provider.example
WALLET_PAYMENT_TOKEN_ADDRESS=0xYourUsdtContract
WALLET_PAYMENT_DESTINATION_ADDRESS=0xYourTreasuryWallet
WALLET_PAYMENT_TOKEN_SYMBOL=USDT
WALLET_PAYMENT_TOKEN_DECIMALS=6
WALLET_PAYMENT_USD_RATE=1
WALLET_PAYMENT_CONFIRMATIONS=3
```

The server verifies the configured chain, ERC-20 contract, destination address,
transfer amount, successful receipt, and confirmation count before calling the
idempotent booster activation RPC. `WALLET_PAYMENT_RPC_URL`, token contract,
and destination must be for the same network; never use a wallet private key in
the application or environment.

---

## CCPayment v2 Integration

```env
# CCPayment Dashboard → Developer
CCPAYMENT_APP_ID=your-ccpayment-app-id
CCPAYMENT_APP_SECRET=your-ccpayment-app-secret

# Optional when using a non-USD pricing currency. USD defaults to the
# documented CCPayment fiat ID 1033 unless overridden.
CCPAYMENT_USD_FIAT_ID=1033
```

Configure the CCPayment webhook URL as:

```text
https://your-domain.com/api/ccpayment/webhook
```

If using a per-order `notifyUrl`, add the production domain to CCPayment's
**notifyUrl Domain Whitelist**. The webhook handler verifies the HMAC-SHA-256
signature, accepts the exact `ApiDeposit`/`ApiWithdrawal` v2 payload shape,
returns the exact plain-text `Success` acknowledgement, and reconciles the
order through CCPayment before any booster, deposit, or withdrawal state is
changed. Risk-flagged, processing, underpaid, and expired payments are not
automatically fulfilled.

The booster UI's **CWallet via CCPayment** option intentionally uses the same
verified CCPayment hosted invoice and `ApiDeposit` webhook path. No separate
unverified `cwallet.com/checkout` URL or standalone callback is used; a Cwallet
user can pay the CCPayment invoice from their Cwallet wallet.

---

## FaucetPay Integration

```env
# FaucetPay API Key
FAUCETPAY_API_KEY=your-faucetpay-api-key
\`\`\`

**Get your API key:**
1. Login to [FaucetPay](https://faucetpay.io)
2. Go to Account → API
3. Generate or copy your API key

---

## Offerwall Secret Keys

\`\`\`env
# Torox
TOROX_SECRET_KEY=your-torox-secret

# CPX Research
CPX_APP_ID=your-cpx-app-id
CPX_SECRET_KEY=your-cpx-secret

# Lootably
LOOTABLY_SECRET_KEY=your-lootably-secret

# AdGate Media
ADGATE_SECRET_KEY=your-adgate-secret

# Ayet Studios
AYET_SECRET_KEY=your-ayet-secret

# Monlix
MONLIX_APP_ID=your-monlix-app-id
MONLIX_SECRET_KEY=your-monlix-secret

# Hideout.TV
HIDEOUT_SECRET_KEY=your-hideout-secret

# BitLabs
BITLABS_SECRET_KEY=your-bitlabs-secret

# Timewall
TIMEWALL_SECRET_KEY=your-timewall-secret
\`\`\`

**Note:** Only configure the offerwalls you plan to use.

---

## Security Keys

\`\`\`env
# CSRF Protection Secret (generate a random string)
CSRF_SECRET=generate-a-random-32-character-string

# Cron Job Secret (for scheduled tasks)
CRON_SECRET=generate-another-random-string

# Cloudflare Turnstile (optional, for CAPTCHA)
NEXT_PUBLIC_TURNSTILE_SITE_KEY=0x4xxxxx
TURNSTILE_SECRET_KEY=0x4xxxxx
\`\`\`

**Generate random secrets:**
\`\`\`bash
# Using OpenSSL
openssl rand -hex 32

# Using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
\`\`\`

---

## Optional Configuration

\`\`\`env
# Analytics (optional)
NEXT_PUBLIC_GA_ID=G-XXXXXXXXXX

# Email Provider (optional)
RESEND_API_KEY=re_xxxxx
\`\`\`

---

## Environment Variable Checklist

| Variable | Required | Where Used |
|----------|----------|------------|
| `NEXT_PUBLIC_APP_URL` | Yes | Everywhere |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Auth, Database |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Client-side |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server-side |
| `CCPAYMENT_APP_ID` | When CCPayment is enabled | CCPayment v2 API |
| `CCPAYMENT_APP_SECRET` | When CCPayment is enabled | Server-side CCPayment signing |
| `CCPAYMENT_USD_FIAT_ID` | Optional for USD; required for other fiat | CCPayment invoice pricing |
| `FAUCETPAY_API_KEY` | Yes | Withdrawals |
| `CSRF_SECRET` | Yes | Security |
| Offerwall keys | Per provider | Postbacks |

---

## Security Notes

1. **Never commit `.env.local` to git**
2. **Keep service role key secret** - Only use server-side
3. **Rotate keys periodically** - Especially if compromised
4. **Use different keys for dev/prod** - Isolate environments

---

## Next Steps

Continue to [Database Setup](05-database-supabase.md) to configure Supabase.
