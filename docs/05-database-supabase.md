# Database Setup (Supabase)

## Step 1: Create Supabase Project

1. Go to [Supabase](https://supabase.com) and sign in
2. Click "New Project"
3. Fill in the details:
   - **Name:** Your faucet name
   - **Database Password:** Generate a strong password (save it!)
   - **Region:** Choose closest to your users
4. Wait for project to be created (1-2 minutes)

---

## Step 2: Get API Credentials

1. Go to **Settings** → **API**
2. Copy these values to your local secret store or `.env.local`:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public/publishable key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service role/secret key** → `SUPABASE_SERVICE_ROLE_KEY`
3. From **Connect**, obtain a migration-compatible PostgreSQL URL and configure one of:
   - `DATABASE_URL`
   - `POSTGRES_URL_NON_POOLING`
   - `POSTGRES_URL`

Never commit these values or paste them into chat.

---

## Step 3: Run Database Migrations

Run the reviewed migration set from the repository root. The runner loads the
local environment without printing secrets and uses the Node `pg` client.

```bash
node scripts/migrate.mjs --dry-run
node scripts/migrate.mjs --apply
```

The current hardening/delivery migrations are listed in
`scripts/migrations/README.md` and include `071` through `083`. Do not manually
run historical SQL files against a database that already has the application
schema without reviewing dependencies and checksums first.

---

## Step 4: Verify Tables

After running migrations, verify these tables exist:

| Table | Purpose |
|-------|---------|
| `profiles` | User balances, roles, activity, and account state |
| `transactions` | User financial transactions |
| `offerwall_conversions` | Provider conversion records |
| `withdrawals` | Withdrawal requests and review state |
| `claims` | Faucet claim tracking |
| `audit_logs` | Security audit trail |
| `system_settings` | Platform configuration |
| `ad_network_configs` | Ad provider configuration |
| `ad_campaigns` | Advertiser campaigns and budgets |
| `ad_delivery_impressions` | First-party campaign impressions |
| `ad_delivery_clicks` | First-party campaign clicks |
| `ad_campaign_daily` | Daily advertiser rollups |
| `postback_receipts` | Provider-scoped replay ledger |

---

## Step 5: Enable Row Level Security (RLS)

RLS is critical for security. The migration scripts enable it automatically, but verify:

1. Go to **Authentication** → **Policies**
2. Each table should have RLS enabled
3. Policies should be defined for each table

---

## Step 6: Configure Authentication

1. Go to **Authentication** → **Providers**
2. **Email:** Should be enabled by default
3. **Google:** (Optional)
   - Enable Google provider
   - Add Client ID and Secret
   - Configure redirect URLs

### Redirect URLs

Add these URLs in Supabase Auth settings:

\`\`\`
https://your-domain.com/auth/callback
https://your-domain.com/auth/confirm
\`\`\`

For local development:
\`\`\`
http://localhost:3000/auth/callback
http://localhost:3000/auth/confirm
\`\`\`

---

## Database Schema Overview

\`\`\`
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   users     │────▶│ transactions │◀────│   offers    │
└─────────────┘     └──────────────┘     └─────────────┘
       │                   │
       │                   ▼
       │            ┌──────────────┐
       └───────────▶│ withdrawals  │
                    └──────────────┘
\`\`\`

---

## Backup Recommendations

1. Enable **Point-in-Time Recovery** in Supabase (paid plans)
2. Export database regularly via pg_dump
3. Keep migration scripts versioned in git

---

## Common Issues

### "Permission denied" errors
- Check RLS policies
- Verify user has correct role
- Check service role key is correct

### Tables not created
- Run migrations in correct order
- Check for SQL syntax errors
- Verify you're in correct project

---

## Next Steps

Continue to [Authentication](06-authentication.md) to configure user login.
