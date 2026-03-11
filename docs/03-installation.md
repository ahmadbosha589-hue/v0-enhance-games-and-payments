# Installation Guide

## Step 1: Extract the Files

Extract the ZIP file to your desired location:

\`\`\`bash
# Example
unzip crypto-faucet-platform.zip -d ~/projects/my-faucet
cd ~/projects/my-faucet
\`\`\`

---

## Step 2: Install Dependencies

Open a terminal in the project directory and run:

\`\`\`bash
# Using npm
npm install

# OR using pnpm (faster)
pnpm install
\`\`\`

This will install all required packages (may take a few minutes).

---

## Step 3: Environment Variables

Create a `.env.local` file in the root directory:

\`\`\`bash
# Copy the example file
cp .env.example .env.local
\`\`\`

Edit `.env.local` with your configuration. See [Environment Variables](04-environment-variables.md) for detailed instructions.

---

## Step 4: Database Setup

1. Create a Supabase project (see [Database Setup](05-database-supabase.md))
2. Run the migration scripts in the `/scripts` folder
3. Verify tables are created correctly

---

## Step 5: Run Development Server

Start the development server:

\`\`\`bash
npm run dev
\`\`\`

Open your browser and visit:
\`\`\`
http://localhost:3000
\`\`\`

---

## Step 6: Verify Installation

Check that everything works:

1. **Homepage loads** - You should see the landing page
2. **Auth works** - Try registering a new account
3. **Dashboard loads** - After login, verify dashboard appears
4. **Admin panel** - Access `/admin` with an admin account

---

## Common Installation Issues

### "Module not found" errors
\`\`\`bash
# Delete node_modules and reinstall
rm -rf node_modules
rm package-lock.json
npm install
\`\`\`

### Port 3000 already in use
\`\`\`bash
# Use a different port
npm run dev -- -p 3001
\`\`\`

### Environment variable errors
- Ensure `.env.local` exists
- Check all required variables are set
- Restart the dev server after changes

---

## Project Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run start` | Start production server |
| `npm run lint` | Run code linting |

---

## Next Steps

Continue to [Environment Variables](04-environment-variables.md) to configure your application.
