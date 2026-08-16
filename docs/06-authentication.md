# Authentication Setup

This platform uses Supabase Auth for user authentication.

---

## Supported Authentication Methods

| Method | Status | Configuration Required |
|--------|--------|------------------------|
| Email & Password | Default | None |
| Google OAuth | Optional | Google Cloud Console |
| Magic Link | Optional | Email provider |

---

## Email Authentication

Email/password authentication is enabled by default.

### Features
- User registration with email verification
- Password reset functionality
- Secure session management

### Configuration

1. In Supabase Dashboard, go to **Authentication** → **Providers**
2. Ensure **Email** is enabled
3. Configure email templates (optional):
   - Go to **Authentication** → **Email Templates**
   - Customize confirmation, reset, and invite emails

---

## Google OAuth Setup

### Step 1: Create Google OAuth App

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select existing
3. Navigate to **APIs & Services** → **Credentials**
4. Click **Create Credentials** → **OAuth client ID**
5. Select **Web application**
6. Configure:
   - **Name:** Your faucet name
   - **Authorized JavaScript origins:**
     \`\`\`
     https://your-domain.com
     http://localhost:3000
     \`\`\`
   - **Authorized redirect URIs:**
     \`\`\`
     https://your-domain.com/auth/callback
     https://xxxxx.supabase.co/auth/v1/callback
     http://localhost:3000/auth/callback
     \`\`\`

### Step 2: Enable in Supabase

1. Go to **Authentication** → **Providers** → **Google**
2. Toggle **Enable**
3. Enter:
   - **Client ID:** From Google Console
   - **Client Secret:** From Google Console

### Step 3: Update Environment Variables

\`\`\`env
NEXT_PUBLIC_GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxx
\`\`\`

---

## Authentication Flow

\`\`\`
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Login Page  │────▶│ Supabase Auth│────▶│   Callback   │
└──────────────┘     └──────────────┘     └──────────────┘
                            │                     │
                            ▼                     ▼
                     ┌──────────────┐     ┌──────────────┐
                     │   Session    │────▶│  Dashboard   │
                     │   Created    │     │              │
                     └──────────────┘     └──────────────┘
\`\`\`

---

## Session Management

Sessions are managed automatically by Supabase:

- **Access Token:** Valid for 1 hour (configurable)
- **Refresh Token:** Valid for 1 week (configurable)
- **Auto Refresh:** Tokens refresh automatically

### Checking Authentication Status

\`\`\`typescript
// Client-side
const { data: { user } } = await supabase.auth.getUser()

// Server-side
const supabase = await createClient()
const { data: { user } } = await supabase.auth.getUser()
\`\`\`

---

## Protected Routes

The platform protects routes using middleware:

| Route Pattern | Protection |
|---------------|------------|
| `/dashboard/*` | Requires login |
| `/admin/*` | Requires admin role |
| `/auth/*` | Public |
| `/` | Public |

---

## User Roles

| Role | Access Level |
|------|--------------|
| `user` | Dashboard, offerwalls, withdrawals |
| `admin` | All user access + admin panel |
| `banned` | No access |

Roles are stored in the `users` table and checked server-side.

---

## Security Features

1. **Email Verification** - Optional, configurable in Supabase
2. **Rate Limiting** - Prevents brute force attacks
3. **Secure Cookies** - HTTP-only, secure, same-site
4. **CSRF Protection** - Token-based protection
5. **Session Validation** - Server-side verification

---

## Troubleshooting

### "Invalid login credentials"
- Check email/password are correct
- Verify email is confirmed (if required)
- Check user isn't banned

### Google OAuth not working
- Verify redirect URIs match exactly
- Check Client ID/Secret are correct
- Ensure Google provider is enabled in Supabase

### Session not persisting
- Check cookies are enabled
- Verify domain configuration
- Check for CORS issues

---

## Next Steps

Continue to [Offerwalls](07-offerwalls.md) to configure earning methods.
