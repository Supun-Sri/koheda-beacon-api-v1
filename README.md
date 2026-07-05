# Kohedha API - Phase 1 Setup Complete ✅

## What's Been Created

Phase 1 foundation is ready:
- ✅ Project structure with TypeScript
- ✅ Fastify server with health endpoint
- ✅ PostgreSQL + PostGIS configuration
- ✅ Database connection module
- ✅ Migration runner
- ✅ All dependencies installed

## Next Steps

### 1. Install Docker Desktop (Required)

Download and install Docker Desktop from: https://www.docker.com/products/docker-desktop

After installation, restart your computer if prompted.

### 2. Start PostgreSQL + PostGIS

```bash
docker-compose up -d
```

This will start a PostgreSQL 16 database with PostGIS 3.4 extension.

### 3. Verify Database Connection

```bash
pnpm tsx src/test-db.ts
```

Expected output: `DB connected: 2026-07-02T...`

### 4. Start the Development Server

```bash
pnpm dev
```

Server will start on `http://localhost:3000`

### 5. Test the Health Endpoint

Open another terminal and run:

```bash
curl http://localhost:3000/health
```

Expected response:
```json
{
  "status": "ok",
  "postgres": "connected",
  "uptime": 2.34
}
```

## Project Structure

```
koheda-api/
├── src/
│   ├── app.ts           # Main Fastify server
│   ├── db.ts            # PostgreSQL connection
│   ├── test-db.ts       # Database connection test
│   └── db/
│       └── migrate.ts   # Migration runner
├── migrations/          # SQL migration files (to be added)
├── .env                 # Environment variables
├── docker-compose.yml   # PostgreSQL + PostGIS
├── package.json
└── tsconfig.json
```

## Environment Variables

Current `.env` configuration:

```
DATABASE_URL=postgresql://koheda:koheda123@localhost:5432/koheda
NODE_ENV=development
PORT=3000
BEACON_TTL_MS=7200000
```

## What's Next (Phase 2)

After Docker is installed and the server is running:
- Create database migrations
- Seed vibe tags and restaurant data
- Add restaurant API endpoints
- Verify PostGIS spatial queries work

## Troubleshooting

### Docker not found
- Install Docker Desktop from docker.com
- Restart your terminal/computer after installation
- Verify with: `docker --version`

### Port 5432 already in use
- Stop any existing PostgreSQL instances
- Or change the port in `docker-compose.yml`

### pnpm command not found
- Already installed! If issues persist, restart terminal

---

**Phase 1 Status: ✅ COMPLETE**

Ready to proceed to Phase 2 once Docker is installed.
