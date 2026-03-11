# Deployment Guide

## Prerequisites

- Node.js 18+
- PostgreSQL database (Supabase recommended)
- FaucetPay API key (for withdrawals)

## Vercel Deployment (Recommended)

### Step 1: Connect Repository

1. Go to [vercel.com](https://vercel.com)
2. Import your GitHub repository
3. Vercel will auto-detect Next.js

### Step 2: Configure Environment Variables

Add the following in Vercel dashboard:

\`\`\`
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
FAUCETPAY_API_KEY=your_faucetpay_key
METRICS_API_KEY=secure_random_string
NEXT_PUBLIC_APP_URL=https://your-domain.com
\`\`\`

### Step 3: Database Setup

1. Go to Supabase dashboard
2. Navigate to SQL Editor
3. Run migration scripts in order (001-012)
4. Verify tables created successfully

### Step 4: Deploy

Click Deploy in Vercel. Done!

## Self-Hosted Deployment

### Build

\`\`\`bash
npm ci
npm run build
\`\`\`

### Production Server

\`\`\`bash
npm start
\`\`\`

Or use PM2:

\`\`\`bash
pm2 start npm --name "cryptofaucet" -- start
\`\`\`

### Nginx Configuration

\`\`\`nginx
server {
    listen 80;
    server_name your-domain.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }
}
\`\`\`

### SSL with Certbot

\`\`\`bash
sudo certbot --nginx -d your-domain.com
\`\`\`

## Docker Deployment

### Dockerfile

\`\`\`dockerfile
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:18-alpine AS runner
WORKDIR /app
ENV NODE_ENV production
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]
\`\`\`

### Docker Compose

\`\`\`yaml
version: '3.8'
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
    env_file:
      - .env.production
\`\`\`

## Post-Deployment

### Create Admin User

1. Sign up normally via the app
2. Connect to database
3. Update role:

\`\`\`sql
UPDATE profiles 
SET role = 'superadmin' 
WHERE id = 'your-user-id';
\`\`\`

### Configure FaucetPay

1. Get API key from FaucetPay dashboard
2. Add to environment variables
3. Test with small withdrawal

### Set Up Monitoring

1. Configure health check endpoint monitoring
2. Set up alerts for `/api/health` failures
3. Connect `/api/metrics` to Prometheus/Grafana

## Troubleshooting

### Database Connection Issues

- Verify Supabase URL and keys
- Check RLS policies are correct
- Ensure IP is not blocked

### Auth Not Working

- Verify redirect URLs in Supabase
- Check NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL for dev

### Withdrawals Failing

- Verify FaucetPay API key
- Check FaucetPay balance
- Review error logs
