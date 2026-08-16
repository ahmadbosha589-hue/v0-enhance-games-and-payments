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
2. Copy these values to your `.env.local`:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** → `SUPABASE_SERVICE_ROLE_KEY`

---

## Step 3: Run Database Migrations

The `/scripts` folder contains SQL migration files. Run them in order:

### Option A: Using Supabase Dashboard

1. Go to **SQL Editor** in your Supabase dashboard
2. Open each script file in the `/scripts` folder
3. Run them in numerical order:
   - `001_create_users_table.sql`
   - `002_create_transactions_table.sql`
   - `003_...` etc.

### Option B: Using v0 (if deployed there)

The scripts can be run directly from the v0 interface.

---

## Step 4: Verify Tables

After running migrations, verify these tables exist:

| Table | Purpose |
|-------|---------|
| `users` | User accounts and profiles |
| `transactions` | All financial transactions |
| `offers` | Completed offerwall offers |
| `withdrawals` | Withdrawal requests |
| `referrals` | Referral relationships |
| `daily_claims` | Faucet claim tracking |
| `audit_logs` | Security audit trail |
| `system_settings` | Platform configuration |
| `ad_settings` | Ad network configuration |
| `fraud_flags` | Fraud detection data |

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
