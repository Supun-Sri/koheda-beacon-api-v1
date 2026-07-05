# 🆓 Free Deployment Options for Kohedha API

## Overview

Your Kohedha API can be deployed for **FREE** using these platforms:

| Platform | API Hosting | Database | Limitations | Best For |
|----------|-------------|----------|-------------|----------|
| **Railway** | Free tier | PostgreSQL free | 500 hours/month, sleeps after inactivity | ⭐ **Recommended** |
| **Render** | Free tier | No free PostgreSQL with PostGIS | Spins down after 15 min inactivity | Demo/Testing |
| **Fly.io** | Free tier | Free PostgreSQL | 3 VMs free, limited storage | Production |
| **Supabase** | Use as DB | Free PostgreSQL + PostGIS | 500MB storage, limited API calls | Database only |
| **Vercel + Supabase** | Serverless | Supabase free | Cold starts, serverless limits | Serverless approach |

---

## 🚂 Option 1: Railway (Recommended - Easiest)

**Free Tier:**
- 500 execution hours/month
- $5 credit/month
- PostgreSQL with PostGIS included
- No credit card required initially

### Quick Deploy

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Initialize project
cd koheda-api
railway init

# Add PostgreSQL with PostGIS
railway add --plugin postgresql

# Deploy
railway up
```

### Enable PostGIS

```bash
# Connect to database
railway connect postgres

# In psql:
CREATE EXTENSION IF NOT EXISTS postgis;
\q
```

### Set Environment Variables

Railway auto-configures `DATABASE_URL`. Just add:

```bash
railway variables set NODE_ENV=production
railway variables set BEACON_TTL_MS=7200000
```

### Get Your URL

```bash
railway domain
# Returns: https://koheda-api-production.up.railway.app
```

**Cost:** FREE (within 500 hours/month)

---

## 🌐 Option 2: Render Free + Supabase (Best for MVP)

**Combination:**
- Render Free tier for API (spins down after inactivity)
- Supabase free tier for PostgreSQL + PostGIS

### Step 1: Create Supabase Database

1. Go to https://supabase.com
2. Create account (free, no credit card)
3. Create new project:
   - **Name:** koheda
   - **Database password:** (save this!)
   - **Region:** Singapore
4. Wait for provisioning (2 minutes)
5. PostGIS is already enabled!

### Step 2: Get Connection String

1. Go to Project Settings → Database
2. Copy **Connection string** (Direct connection)
3. Replace `[YOUR-PASSWORD]` with your password

Example:
```
postgresql://postgres:[YOUR-PASSWORD]@db.xyz.supabase.co:5432/postgres
```

### Step 3: Deploy API to Render

Create `render-free.yaml`:

```yaml
services:
  - type: web
    name: koheda-api-free
    runtime: node
    plan: free
    branch: main
    buildCommand: npm install -g pnpm && pnpm install && pnpm run build
    startCommand: pnpm start
    envVars:
      - key: NODE_ENV
        value: production
      - key: DATABASE_URL
        value: YOUR_SUPABASE_CONNECTION_STRING
      - key: BEACON_TTL_MS
        value: 7200000
```

**Limitations:**
- API spins down after 15 minutes of inactivity
- First request after sleep takes 30-60 seconds
- 750 hours/month free

**Cost:** FREE

---

## ✈️ Option 3: Fly.io (Best for Always-On)

**Free Tier:**
- 3 VMs (256MB RAM each)
- 3GB persistent storage
- PostgreSQL with PostGIS
- No sleep/spin down

### Quick Deploy

```bash
# Install Fly CLI
curl -L https://fly.io/install.sh | sh
# or on Windows:
pwsh -Command "iwr https://fly.io/install.ps1 -useb | iex"

# Login
fly auth login

# Initialize
cd koheda-api
fly launch --name koheda-api

# Create PostgreSQL with PostGIS
fly postgres create --name koheda-db --region sin
fly postgres attach --app koheda-api koheda-db

# Deploy
fly deploy
```

### Enable PostGIS

```bash
fly postgres connect -a koheda-db
CREATE EXTENSION IF NOT EXISTS postgis;
\q
```

**Cost:** FREE (3 VMs included)

---

## 📊 Option 4: Supabase Only (Database as Backend)

Use Supabase as both database AND API (via PostgREST + Edge Functions).

### Architecture
```
Mobile App → Supabase Edge Functions → PostgreSQL + PostGIS
```

### Step 1: Create Supabase Project

Same as Option 2

### Step 2: Enable PostgREST API

Supabase automatically exposes REST API for your tables!

### Step 3: Create Edge Functions (Deno)

```bash
# Install Supabase CLI
npm install -g supabase

# Login
supabase login

# Link project
supabase link --project-ref YOUR_PROJECT_REF

# Create function
supabase functions new activate-beacon
```

**Edge Function Example:**
```typescript
// supabase/functions/activate-beacon/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  const { userId, lat, lng, vibeTags } = await req.json()

  // Insert beacon
  const { data, error } = await supabase
    .from('beacons')
    .insert({
      user_id: userId,
      location: `POINT(${lng} ${lat})`,
      vibe_tags: vibeTags,
      status: 'active',
      expires_at: new Date(Date.now() + 7200000)
    })
    .select()

  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json' }
  })
})
```

**Limitations:**
- Need to rewrite Node.js code to Deno
- Edge Functions are still beta
- 500K invocations/month free

**Cost:** FREE

---

## 🔀 Option 5: Vercel Serverless + Supabase

**Best for:** Serverless architecture

### Step 1: Convert to Serverless

Create `api/` folder with serverless functions:

```typescript
// api/health.ts
import { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  res.status(200).json({ status: 'ok' })
}
```

### Step 2: Deploy to Vercel

```bash
npm install -g vercel
vercel login
vercel
```

### Step 3: Add Environment Variables

```bash
vercel env add DATABASE_URL
```

**Limitations:**
- Serverless functions have cold starts
- No persistent WebSocket connections (need separate service)
- 100GB bandwidth/month free

**Cost:** FREE

---

## 🆓 Recommended Free Stack

### For MVP / Demo
```
Railway (API + PostgreSQL)
↓
Free domain from Railway
↓
Total: FREE
```

### For Production-Ready Free
```
Fly.io (API - 3 VMs)
↓
Supabase (PostgreSQL + PostGIS)
↓
Cloudflare (CDN + DNS)
↓
Total: FREE
```

### For Serverless
```
Vercel (API)
↓
Supabase (Database)
↓
Pusher (WebSocket - free tier)
↓
Total: FREE
```

---

## 📝 Detailed Railway Setup (Recommended)

### 1. Install & Login

```bash
npm install -g @railway/cli
railway login
```

### 2. Initialize Project

```bash
cd koheda-api
railway init
# Name: koheda-api
# Enter to confirm
```

### 3. Add PostgreSQL

```bash
railway add
# Select: PostgreSQL
```

### 4. Link Database

Railway automatically sets `DATABASE_URL` environment variable!

### 5. Enable PostGIS

```bash
railway run bash
# Inside container:
psql $DATABASE_URL
CREATE EXTENSION IF NOT EXISTS postgis;
\q
exit
```

### 6. Deploy

```bash
railway up
```

### 7. Get URL

```bash
railway domain
# Example: koheda-api-production-abc123.up.railway.app
```

### 8. Run Migrations

```bash
railway run npm run migrate
```

### Done! 🎉

Your API is live at: `https://koheda-api-production-abc123.up.railway.app`

**Free for:**
- 500 hours/month (enough for MVP)
- After hours expire, $5 credit kicks in
- No credit card required initially

---

## 💡 Cost Breakdown

### Railway Free Tier

```
Execution Hours: 500/month = ~16 hours/day
Good for:
  - Development
  - Testing
  - Low-traffic MVP
  - Demo/Portfolio

Not good for:
  - 24/7 production (uses 720 hours/month)
```

### When You Outgrow Free Tier

Once you need 24/7 uptime:

**Railway Hobby:**
- $5/month base
- Pay-as-you-go after that
- Estimated: $10-15/month for API + DB

**Fly.io:**
- 3 free VMs forever
- Add paid VMs as needed
- Estimated: $0-10/month

---

## 🚀 Quick Start: Railway (5 Minutes)

```bash
# 1. Install CLI
npm install -g @railway/cli

# 2. Login
railway login

# 3. Deploy
cd koheda-api
railway init
railway add  # Select PostgreSQL
railway up

# 4. Enable PostGIS
railway connect postgres
CREATE EXTENSION IF NOT EXISTS postgis;
\q

# 5. Run migrations
railway run npm run migrate

# 6. Get URL
railway domain
```

**Done!** Your API is live for free. 🎉

---

## 📊 Comparison Table

| Feature | Railway | Render Free | Fly.io | Supabase Only |
|---------|---------|-------------|---------|---------------|
| **API Hosting** | ✅ Free (500h) | ✅ Free (spins down) | ✅ Free (3 VMs) | ✅ Edge Functions |
| **PostgreSQL** | ✅ Included | ❌ Not free | ✅ Included | ✅ Included |
| **PostGIS** | ✅ Manual enable | ❌ N/A | ✅ Manual enable | ✅ Built-in |
| **Always On** | ❌ Limited hours | ❌ Spins down | ✅ Yes | ✅ Yes |
| **Custom Domain** | ✅ Free | ✅ Free | ✅ Free | ✅ Free |
| **SSL** | ✅ Auto | ✅ Auto | ✅ Auto | ✅ Auto |
| **Setup Time** | 5 minutes | 10 minutes | 10 minutes | 30 minutes |
| **Complexity** | ⭐ Easy | ⭐⭐ Medium | ⭐⭐ Medium | ⭐⭐⭐ Hard |

---

## 🎯 Recommendation

**For quickest free deployment: Use Railway**

```bash
npm install -g @railway/cli
railway login
cd koheda-api
railway init
railway add  # PostgreSQL
railway up
```

That's it! Your API is live with PostgreSQL + PostGIS for FREE.

**When to upgrade:**
- You exceed 500 hours/month (need 24/7)
- You need more than hobby-level resources
- You're ready to pay $10-15/month for always-on production

---

## 🆘 Need Help?

- **Railway:** https://railway.app/help
- **Render:** https://community.render.com
- **Fly.io:** https://community.fly.io
- **Supabase:** https://supabase.com/docs

---

**Bottom line:** Start with Railway free tier. It's the easiest way to get your Kohedha API deployed for free with PostgreSQL + PostGIS included! 🚂
