# Deployment on Vercel

This guide covers deploying your faucet platform to Vercel.

---

## Prerequisites

Before deploying:

- [ ] GitHub account
- [ ] Vercel account
- [ ] Supabase project configured
- [ ] Environment variables ready
- [ ] Domain name (optional)

---

## Step 1: Push to GitHub

If not already in a repository:

\`\`\`bash
# Initialize git
git init

# Add all files
git add .

# Commit
git commit -m "Initial commit"

# Create GitHub repo and push
gh repo create my-faucet --private --push
\`\`\`

---

## Step 2: Connect to Vercel

1. Go to [Vercel](https://vercel.com)
2. Click **Add New Project**
3. Import your GitHub repository
4. Select the repository

---

## Step 3: Configure Environment Variables

In Vercel project settings:

1. Go to **Settings** → **Environment Variables**
2. Add each variable from your `.env.local`
3. Ensure all required variables are set

### Required Variables

\`\`\`
NEXT_PUBLIC_APP_URL
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
FAUCETPAY_API_KEY
CSRF_SECRET
CRON_SECRET
\`\`\`

### Production URL

Set `NEXT_PUBLIC_APP_URL` to your production domain:
\`\`\`
NEXT_PUBLIC_APP_URL=https://your-domain.com
\`\`\`

---

## Step 4: Configure Build Settings

Default settings usually work, but verify:

| Setting | Value |
|---------|-------|
| Framework Preset | Next.js |
| Build Command | `npm run build` |
| Output Directory | `.next` |
| Install Command | `npm install` |
| Node.js Version | 18.x or 20.x |

---

## Step 5: Deploy

1. Click **Deploy**
2. Wait for build to complete (2-5 minutes)
3. Check for any build errors
4. Access your deployed site

---

## Step 6: Configure Domain

### Using Vercel Domain

Your site is available at:
\`\`\`
https://your-project.vercel.app
\`\`\`

### Custom Domain

1. Go to **Settings** → **Domains**
2. Add your domain
3. Configure DNS:
   - **A Record:** `76.76.21.21`
   - **CNAME:** `cname.vercel-dns.com`
4. Wait for SSL certificate (automatic)

---

## Step 7: Update Redirect URLs

After deployment, update all redirect URLs:

### Supabase Auth

In Supabase Dashboard:
1. Go to **Authentication** → **URL Configuration**
2. Update Site URL to production domain
3. Add redirect URLs:
   \`\`\`
   https://your-domain.com/auth/callback
   https://your-domain.com/auth/confirm
   \`\`\`

### Google OAuth

In Google Cloud Console:
1. Update authorized origins
2. Update redirect URIs
3. Save changes

### Offerwall Postbacks

Update postback URLs in each provider's dashboard to use production domain.

---

## Step 8: Verify Deployment

Test all functionality:

- [ ] Homepage loads
- [ ] User registration works
- [ ] Login/logout works
- [ ] Dashboard accessible
- [ ] Offerwalls load
- [ ] Admin panel works
- [ ] Withdrawals process

---

## Continuous Deployment

Vercel automatically deploys:
- **Production:** When you push to `main` branch
- **Preview:** When you create pull requests

---

## Monitoring

### Vercel Analytics

Enable in project settings for:
- Page views
- Performance metrics
- Geographic data

### Logs

View logs in Vercel dashboard:
1. Go to **Deployments**
2. Click on deployment
3. View **Function Logs**

---

## Troubleshooting

### Build Failures

\`\`\`bash
# Check build locally first
npm run build
\`\`\`

Common issues:
- Missing environment variables
- TypeScript errors
- Import errors

### Runtime Errors

1. Check Vercel function logs
2. Verify environment variables
3. Test locally with production env

### Performance Issues

- Enable caching
- Optimize images
- Use Edge functions where appropriate

---

## Next Steps

Continue to [Maintenance](11-maintenance-updates.md) for ongoing operations.
