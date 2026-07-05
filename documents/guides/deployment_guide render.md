# Kohedha — Deployment Guide (Render)

---

## Overview

```mermaid
graph LR
    A["Local Dev<br/>Docker Compose<br/>localhost:3000"] -->|"git push"| B["Render<br/>koheda-api.onrender.com"]
    C["React Native<br/>Expo"] -->|"API calls"| B
    B --> D["Render PostgreSQL<br/>+ PostGIS"]

    style A fill:#E6F3FF
    style B fill:#E6FFE6
    style D fill:#FFF4E6
```

**One server. One database. One platform.** No AWS, no Docker in production, no DevOps.

---

## Local Development

### Prerequisites

| Tool | Install |
|---|---|
| Node.js 20 | [nodejs.org](https://nodejs.org) |
| Docker Desktop | [docker.com](https://docker.com) |
| pnpm | `npm install -g pnpm` |

### Docker Compose — Just Postgres

```yaml
# docker-compose.yml
version: "3.9"
services:
  postgres:
    image: postgis/postgis:16-3.4
    container_name: koheda-db
    ports:
      - "5432:5432"
    environment:
      POSTGRES_DB: koheda
      POSTGRES_USER: koheda
      POSTGRES_PASSWORD: koheda123
    volumes:
      - pg_data:/var/lib/postgresql/data
volumes:
  pg_data:
```

### Environment File

```bash
# .env
DATABASE_URL=postgresql://koheda:koheda123@localhost:5432/koheda
NODE_ENV=development
PORT=3000
BEACON_TTL_MS=7200000
AUCTION_LAMBDA_DECAY=0.08
AUCTION_MIN_MATCH_RATIO=0.10
AUCTION_BASE_MIN_BID=300
AUCTION_CLAIM_FEE=200
JWT_SECRET=local-dev-secret
```

### Start

```bash
docker-compose up -d    # start Postgres
pnpm install            # install dependencies
pnpm run migrate        # create tables + seed data
pnpm dev                # start server with hot-reload
```

Two commands to infrastructure, two commands to code. Server at `http://localhost:3000`.

---

## Deploy to Render

### Step 1 — Add render.yaml to project root

```yaml
# render.yaml
services:
  - type: web
    name: koheda-api
    runtime: node
    plan: free
    buildCommand: pnpm install && pnpm build
    startCommand: pnpm run migrate && node dist/app.js
    envVars:
      - key: NODE_ENV
        value: production
      - key: DATABASE_URL
        fromDatabase:
          name: koheda-db
          property: connectionString
      - key: BEACON_TTL_MS
        value: "7200000"
      - key: AUCTION_LAMBDA_DECAY
        value: "0.08"
      - key: AUCTION_MIN_MATCH_RATIO
        value: "0.10"
      - key: AUCTION_BASE_MIN_BID
        value: "300"
      - key: AUCTION_CLAIM_FEE
        value: "200"
      - key: JWT_SECRET
        generateValue: true

databases:
  - name: koheda-db
    plan: free
    postgresMajorVersion: "16"
```

### Step 2 — Deploy

1. Push your code to GitHub
2. Go to [dashboard.render.com](https://dashboard.render.com)
3. Click **New → Blueprint**
4. Select your GitHub repo
5. Render reads `render.yaml` and creates both the Web Service and PostgreSQL database
6. Click **Apply** — deploys in ~2 minutes

### Step 3 — Enable PostGIS

After the database is provisioned:

```bash
# Option A: From Render dashboard → your database → Shell tab
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

# Option B: Already in your migration file (recommended)
# migrations/001_initial.sql handles this automatically on first deploy
```

### Step 4 — Verify

```bash
curl https://koheda-api.onrender.com/health
```
```json
{ "status": "ok", "postgres": "connected" }
```

**Done.** Every future `git push` to `main` auto-deploys.

---

## Custom Domain

```
Render Dashboard → koheda-api → Settings → Custom Domains
  → Add: api.kohedha.lk
  → Render gives you a CNAME target
  → Add CNAME record at your DNS provider
  → SSL certificate auto-issued (free, via Let's Encrypt)
```

---

## Environment Variables

Manage via Render Dashboard → koheda-api → Environment:

| Variable | Value | Notes |
|---|---|---|
| `DATABASE_URL` | Auto-set by Render | From linked database |
| `NODE_ENV` | `production` | |
| `BEACON_TTL_MS` | `7200000` | 2 hours |
| `AUCTION_LAMBDA_DECAY` | `0.08` | Distance decay factor |
| `AUCTION_MIN_MATCH_RATIO` | `0.10` | 10% minimum |
| `AUCTION_BASE_MIN_BID` | `300` | LKR |
| `AUCTION_CLAIM_FEE` | `200` | LKR per redemption |
| `JWT_SECRET` | Auto-generated | Render creates this |

To add Firebase (when you build the mobile app):

| Variable | Value |
|---|---|
| `FIREBASE_PROJECT_ID` | Your project ID |
| `FIREBASE_SERVICE_ACCOUNT` | JSON key (paste as value) |

---

## CI/CD — Automatic

```
git push origin main
       ↓
Render detects push
       ↓
Runs: pnpm install && pnpm build
       ↓
Runs: pnpm run migrate && node dist/app.js
       ↓
Health check passes → live
       ↓
Old instance stopped (zero-downtime deploy)
```

No GitHub Actions, no Docker builds, no deploy scripts. Render handles everything.

### Preview Environments (Pull Requests)

Enable in Render Dashboard → koheda-api → Settings → Preview Environments → **On**

Every pull request gets its own URL (e.g., `koheda-api-pr-12.onrender.com`) with its own database. Deleted when PR is closed.

---

## Monitoring

### Built-in (Free)

| What | Where |
|---|---|
| **Logs** | Render Dashboard → koheda-api → Logs (real-time stream) |
| **Metrics** | Render Dashboard → koheda-api → Metrics (CPU, memory, response time) |
| **Deploy history** | Render Dashboard → koheda-api → Events |
| **Database metrics** | Render Dashboard → koheda-db → Metrics |

### Add-ons (Recommended)

| Tool | Purpose | Cost | Setup |
|---|---|---|---|
| **Sentry** | Error tracking with stack traces | Free tier (5K events/month) | `pnpm add @sentry/node` → add DSN to env vars |
| **BetterUptime** | Uptime monitoring, alerts to Slack/email | Free tier | Point at your `/health` endpoint |

### Key Logs to Watch

```bash
# From Render Dashboard → Logs, look for:
# ✅ "Server running on port 3000"
# ✅ "Migrations complete"
# ❌ "ECONNREFUSED" — database connection issue
# ❌ "relation does not exist" — migration didn't run
```

---

## Cost

### Free Tier (Testing & Development)

| Service | Spec | Cost |
|---|---|---|
| Web Service | 512 MB RAM, sleeps after 15 min idle | $0 |
| PostgreSQL | 1 GB storage, 90-day limit | $0 |
| **Total** | | **$0/month** |

> [!NOTE]
> Free tier server sleeps after 15 minutes of no traffic. First request after sleep takes ~30 seconds (cold start). WebSocket connections drop during sleep. Fine for development and demos.

### Production (Real Users)

| Service | Spec | Cost |
|---|---|---|
| Web Service (Starter) | 512 MB RAM, always on, no sleep | $7/month |
| PostgreSQL (Starter) | 1 GB storage, no expiry | $7/month |
| **Total** | | **$14/month** |

### Growth

| Service | Spec | Cost |
|---|---|---|
| Web Service (Standard) | 2 GB RAM, auto-scaling | $25/month |
| PostgreSQL (Standard) | 10 GB, daily backups, high availability | $20/month |
| **Total** | | **$45/month** |

---

## Database Management

### Migrations

Migrations run automatically on every deploy (`startCommand` in render.yaml). For manual control:

```bash
# Connect to Render database from local machine
# (Get external connection string from Render Dashboard → koheda-db → Info)
psql "postgres://koheda_user:xxxxx@oregon-postgres.render.com/koheda"

# Check what tables exist
\dt

# Run a manual query
SELECT COUNT(*) FROM restaurants;
```

### Backups

| Plan | Backup | Restore |
|---|---|---|
| Free | None | — |
| Starter ($7) | None (manual only) | `pg_dump` / `pg_restore` |
| Standard ($20) | Daily automatic | One-click restore from dashboard |

For Starter plan, set up your own backup:

```bash
# Add to package.json scripts
"db:backup": "pg_dump $DATABASE_URL > backup_$(date +%Y%m%d).sql"

# Run manually or on a cron (local machine)
pnpm run db:backup
```

---

## Security Checklist

| Area | How Render Handles It |
|---|---|
| **HTTPS/SSL** | Auto-issued Let's Encrypt certificate, HTTPS enforced |
| **Database access** | Internal network only (Web Service → DB). No public access by default |
| **Secrets** | Environment variables encrypted at rest |
| **DDoS protection** | Cloudflare in front of all Render services |
| **Deploys** | Git-based, audit trail in Events tab |

### Your responsibility:

- [ ] Set strong `JWT_SECRET` (auto-generated by render.yaml)
- [ ] Add rate limiting in Fastify (in-memory, per the build guide)
- [ ] Validate all API inputs with Fastify JSON schemas
- [ ] Don't log `DATABASE_URL` or secrets in application code
- [ ] Purge GPS data when beacon expires (privacy)

---

## Rollback

```
Render Dashboard → koheda-api → Events
  → Find the last working deploy
  → Click "Rollback to this deploy"
  → Takes effect in ~30 seconds
```

No CLI needed. One click.

---

## When to Outgrow Render

| Trigger | Sign | Action |
|---|---|---|
| > 500 concurrent WebSocket connections | Memory > 80% on Starter plan | Upgrade to Standard ($25/month) |
| > 2 GB database | Storage warning | Upgrade PostgreSQL plan |
| Need multiple server instances | Single server can't handle load | Add Redis ($0 via Upstash free tier) for Socket.IO adapter, scale to 2+ instances |
| Need background job reliability | setTimeout isn't reliable enough | Add a Render Background Worker ($7/month) |

> [!TIP]
> **You won't hit these limits during MVP.** A single Render Starter instance comfortably handles 100+ concurrent users, which is more than enough for Colombo's nightlife beta.
