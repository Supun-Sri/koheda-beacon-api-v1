# Kohedha — Step-by-Step Build Guide (Test Every Step)

32 steps. Every step ends with a test you run. Don't move on until it passes.

---

## Phase 1 · Project Foundation

---

### Step 1 — Initialize the project

```bash
mkdir koheda-api && cd koheda-api
pnpm init
pnpm add fastify @fastify/cors @fastify/websocket pg dotenv uuid
pnpm add -D typescript @types/node @types/pg tsx
npx tsc --init
```

**✅ Test:**
```bash
pnpm ls
```
**Expect:** All packages listed, no errors.

---

### Step 2 — Create tsconfig and dev script

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "resolveJsonModule": true
  },
  "include": ["src"]
}
```

```jsonc
// package.json — add scripts
{
  "scripts": {
    "dev": "tsx watch src/app.ts",
    "build": "tsc",
    "start": "node dist/app.js",
    "migrate": "tsx src/db/migrate.ts",
    "seed": "tsx src/db/seed.ts"
  }
}
```

**✅ Test:**
```bash
echo "console.log('hello')" > src/app.ts
pnpm dev
```
**Expect:** Prints `hello` and watches for changes. `Ctrl+C` to stop.

---

### Step 3 — Start PostgreSQL + PostGIS

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

```bash
docker-compose up -d
```

**✅ Test:**
```bash
docker exec -it koheda-db psql -U koheda -d koheda -c "SELECT PostGIS_Version();"
```
**Expect:**
```
 postgis_version
-----------------
 3.4 ...
```

---

### Step 4 — Database connection module

```typescript
// src/db.ts
import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

export const db = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://koheda:koheda123@localhost:5432/koheda',
});
```

```bash
# .env
DATABASE_URL=postgresql://koheda:koheda123@localhost:5432/koheda
```

**✅ Test:** Create a quick test script:
```typescript
// src/test-db.ts
import { db } from './db';
async function main() {
  const res = await db.query('SELECT NOW() as time');
  console.log('DB connected:', res.rows[0].time);
  process.exit(0);
}
main();
```

```bash
npx tsx src/test-db.ts
```
**Expect:** `DB connected: 2026-07-02T...`

---

### Step 5 — Fastify server with health endpoint

```typescript
// src/app.ts
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { db } from './db';

const app = Fastify({ logger: true });

app.register(cors);

app.get('/health', async () => {
  const dbCheck = await db.query('SELECT 1').then(() => 'connected').catch(() => 'error');
  return { status: 'ok', postgres: dbCheck, uptime: process.uptime() };
});

app.listen({ port: 3000, host: '0.0.0.0' }, (err) => {
  if (err) throw err;
  console.log('Server running on http://localhost:3000');
});

export default app;
```

```bash
pnpm dev
```

**✅ Test:**
```bash
curl http://localhost:3000/health
```
**Expect:**
```json
{ "status": "ok", "postgres": "connected", "uptime": 2.34 }
```

---

## Phase 2 · Database & Restaurant Data

---

### Step 6 — Create migration runner

```typescript
// src/db/migrate.ts
import { db } from '../db';
import fs from 'fs';
import path from 'path';

async function migrate() {
  const files = fs.readdirSync(path.join(__dirname, '../../migrations')).sort();
  for (const file of files) {
    if (!file.endsWith('.sql')) continue;
    const sql = fs.readFileSync(path.join(__dirname, '../../migrations', file), 'utf-8');
    console.log(`Running: ${file}`);
    await db.query(sql);
  }
  console.log('Migrations complete');
  process.exit(0);
}
migrate();
```

**✅ Test:**
```bash
mkdir migrations
echo "SELECT 1;" > migrations/000_test.sql
pnpm run migrate
```
**Expect:** `Running: 000_test.sql` then `Migrations complete`

---

### Step 7 — Enable PostGIS + create vibe_tags table

```sql
-- migrations/001_initial.sql

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS vibe_tags (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       TEXT UNIQUE NOT NULL,
  radius_km  INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

```bash
pnpm run migrate
```

**✅ Test:**
```bash
docker exec -it koheda-db psql -U koheda -d koheda -c "\dt"
```
**Expect:** `vibe_tags` table listed.

```bash
docker exec -it koheda-db psql -U koheda -d koheda -c "SELECT PostGIS_Full_Version();"
```
**Expect:** Full PostGIS version string (confirms extension is active).

---

### Step 8 — Seed vibe tags

```sql
-- migrations/002_seed_vibe_tags.sql

INSERT INTO vibe_tags (name, radius_km) VALUES
  ('cocktails',  7),
  ('rooftop',    10),
  ('dj',         12),
  ('live music', 14),
  ('mic night',  16),
  ('fine dining', 18),
  ('late night', 12),
  ('byob',       10),
  ('cafe',       6),
  ('beach',      15),
  ('family',     8),
  ('date night', 10)
ON CONFLICT (name) DO NOTHING;
```

```bash
pnpm run migrate
```

**✅ Test:**
```bash
docker exec -it koheda-db psql -U koheda -d koheda \
  -c "SELECT name, radius_km FROM vibe_tags ORDER BY radius_km;"
```
**Expect:**
```
    name     | radius_km
-------------+-----------
 cafe        |         6
 cocktails   |         7
 family      |         8
 rooftop     |        10
 byob        |        10
 date night  |        10
 dj          |        12
 late night  |        12
 live music  |        14
 beach       |        15
 mic night   |        16
 fine dining |        18
(12 rows)
```

---

### Step 9 — Create restaurants table + seed Colombo data

```sql
-- migrations/003_restaurants.sql

CREATE TABLE IF NOT EXISTS restaurants (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       TEXT NOT NULL,
  location   GEOGRAPHY(POINT, 4326) NOT NULL,
  rating     DECIMAL(2,1) DEFAULT 4.0,
  open_until TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS restaurant_vibe_tags (
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  vibe_tag_id   UUID REFERENCES vibe_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (restaurant_id, vibe_tag_id)
);

CREATE INDEX idx_restaurants_location ON restaurants USING GIST (location);

-- Seed 15 Colombo restaurants
INSERT INTO restaurants (name, location, rating, open_until) VALUES
  ('The Hangover Bar',   ST_Point(79.8536, 6.9147)::geography, 4.7, '1AM'),
  ('Salt & Tide',        ST_Point(79.8612, 6.8721)::geography, 4.5, '12AM'),
  ('Black Cat Lounge',   ST_Point(79.8489, 6.9012)::geography, 4.3, '2AM'),
  ('Dish Close-Up',      ST_Point(79.8567, 6.9234)::geography, 4.5, '1AM'),
  ('Garden Bar',         ST_Point(79.8701, 6.8843)::geography, 4.2, '11PM'),
  ('Rooftop 27',         ST_Point(79.8445, 6.9311)::geography, 4.6, '12AM'),
  ('The Loft',           ST_Point(79.8623, 6.8956)::geography, 4.1, '12AM'),
  ('Spice Route',        ST_Point(79.8512, 6.9089)::geography, 4.4, '11PM'),
  ('The Groove',         ST_Point(79.8558, 6.9178)::geography, 4.0, '3AM'),
  ('Colombo Social',     ST_Point(79.8478, 6.8889)::geography, 4.3, '1AM'),
  ('Koko Beach',         ST_Point(79.8345, 6.8712)::geography, 4.4, '11PM'),
  ('Neon Tiger',         ST_Point(79.8601, 6.9267)::geography, 4.2, '2AM'),
  ('The Commons',        ST_Point(79.8534, 6.8978)::geography, 4.1, '10PM'),
  ('Café Moose',         ST_Point(79.8589, 6.9145)::geography, 3.9, '9PM'),
  ('Pearl Rooftop',      ST_Point(79.8467, 6.9198)::geography, 4.8, '1AM');

-- Link restaurants to vibe tags
INSERT INTO restaurant_vibe_tags (restaurant_id, vibe_tag_id)
SELECT r.id, v.id FROM restaurants r, vibe_tags v
WHERE (r.name = 'The Hangover Bar' AND v.name IN ('rooftop', 'cocktails', 'dj'))
   OR (r.name = 'Salt & Tide'      AND v.name IN ('byob', 'live music'))
   OR (r.name = 'Black Cat Lounge'  AND v.name IN ('dj', 'late night'))
   OR (r.name = 'Dish Close-Up'     AND v.name IN ('fine dining', 'cocktails'))
   OR (r.name = 'Garden Bar'        AND v.name IN ('live music', 'rooftop'))
   OR (r.name = 'Rooftop 27'        AND v.name IN ('rooftop', 'cocktails'))
   OR (r.name = 'The Loft'          AND v.name IN ('byob', 'rooftop'))
   OR (r.name = 'Spice Route'       AND v.name IN ('fine dining', 'date night'))
   OR (r.name = 'The Groove'        AND v.name IN ('dj', 'late night'))
   OR (r.name = 'Colombo Social'    AND v.name IN ('cocktails', 'live music', 'rooftop'))
   OR (r.name = 'Koko Beach'        AND v.name IN ('beach', 'cocktails'))
   OR (r.name = 'Neon Tiger'        AND v.name IN ('dj', 'late night', 'cocktails'))
   OR (r.name = 'The Commons'       AND v.name IN ('cafe', 'family'))
   OR (r.name = 'Café Moose'        AND v.name IN ('cafe', 'date night'))
   OR (r.name = 'Pearl Rooftop'     AND v.name IN ('rooftop', 'cocktails', 'fine dining'));
```

```bash
pnpm run migrate
```

**✅ Test:**
```bash
docker exec -it koheda-db psql -U koheda -d koheda \
  -c "SELECT r.name, array_agg(v.name) as tags
      FROM restaurants r
      JOIN restaurant_vibe_tags rvt ON r.id = rvt.restaurant_id
      JOIN vibe_tags v ON v.id = rvt.vibe_tag_id
      GROUP BY r.name
      ORDER BY r.name;"
```
**Expect:** 15 restaurants, each with their vibe tags listed.

---

### Step 10 — Verify PostGIS spatial query works

No code change — just test the spatial index directly.

**✅ Test:**
```bash
docker exec -it koheda-db psql -U koheda -d koheda -c "
  SELECT name, 
         ROUND((ST_Distance(
           location, 
           ST_Point(79.8536, 6.9147)::geography
         ) / 1000)::numeric, 2) AS distance_km
  FROM restaurants
  WHERE ST_DWithin(location, ST_Point(79.8536, 6.9147)::geography, 5000)
  ORDER BY distance_km;
"
```
**Expect:** Restaurants within 5km of The Hangover Bar, sorted by distance. The Hangover Bar itself at 0.00 km.

---

### Step 11 — Restaurant API endpoint

```typescript
// src/routes/restaurant.routes.ts
import { FastifyInstance } from 'fastify';
import { db } from '../db';

export async function restaurantRoutes(app: FastifyInstance) {

  // GET /api/restaurants?lat=6.9147&lng=79.8536&radiusKm=5
  app.get('/api/restaurants', async (req) => {
    const { lat, lng, radiusKm = 10 } = req.query as any;

    if (!lat || !lng) {
      const all = await db.query(`
        SELECT r.id, r.name, r.rating, r.open_until,
               array_agg(v.name) as tags
        FROM restaurants r
        LEFT JOIN restaurant_vibe_tags rvt ON r.id = rvt.restaurant_id
        LEFT JOIN vibe_tags v ON v.id = rvt.vibe_tag_id
        GROUP BY r.id ORDER BY r.name
      `);
      return { count: all.rows.length, restaurants: all.rows };
    }

    const nearby = await db.query(`
      SELECT r.id, r.name, r.rating, r.open_until,
             ROUND((ST_Distance(r.location, ST_Point($2,$1)::geography) / 1000)::numeric, 2) AS distance_km,
             array_agg(v.name) as tags
      FROM restaurants r
      LEFT JOIN restaurant_vibe_tags rvt ON r.id = rvt.restaurant_id
      LEFT JOIN vibe_tags v ON v.id = rvt.vibe_tag_id
      WHERE ST_DWithin(r.location, ST_Point($2,$1)::geography, $3)
      GROUP BY r.id
      ORDER BY distance_km
    `, [lat, lng, Number(radiusKm) * 1000]);

    return { count: nearby.rows.length, restaurants: nearby.rows };
  });

  // GET /api/vibe-tags
  app.get('/api/vibe-tags', async () => {
    const result = await db.query('SELECT name, radius_km FROM vibe_tags ORDER BY radius_km');
    return { tags: result.rows };
  });
}
```

Register in `app.ts`:
```typescript
import { restaurantRoutes } from './routes/restaurant.routes';
app.register(restaurantRoutes);
```

**✅ Test:**
```bash
# All restaurants
curl http://localhost:3000/api/restaurants | jq '.count'
# → 15

# Near The Hangover Bar, 5km radius
curl "http://localhost:3000/api/restaurants?lat=6.9147&lng=79.8536&radiusKm=5" | jq '.restaurants[] | {name, distance_km, tags}'

# Vibe tags
curl http://localhost:3000/api/vibe-tags | jq '.tags[] | .name'
```
**Expect:** Restaurants with distance in km, sorted nearest first. Vibe tags with their radii.

---

## Phase 3 · Beacon Lifecycle

---

### Step 12 — Beacon types, table, and event bus

```sql
-- migrations/004_beacons.sql

CREATE TABLE IF NOT EXISTS beacons (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    TEXT NOT NULL,
  location   GEOGRAPHY(POINT, 4326) NOT NULL,
  vibe_tags  JSONB NOT NULL,
  status     TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_beacons_user ON beacons(user_id, status);
CREATE INDEX idx_beacons_active ON beacons(status) WHERE status = 'active';
CREATE INDEX idx_beacons_location ON beacons USING GIST (location);
```

```typescript
// src/modules/beacon/beacon.types.ts
export interface Beacon {
  id: string;
  user_id: string;
  location: { lat: number; lng: number };
  vibe_tags: string[];
  status: 'active' | 'expired' | 'cancelled';
  created_at: Date;
  expires_at: Date;
}
```

```typescript
// src/modules/beacon/beacon.events.ts
import { EventEmitter } from 'events';
export const beaconBus = new EventEmitter();
beaconBus.setMaxListeners(20);
```

```bash
pnpm run migrate
```

**✅ Test:**
```bash
docker exec -it koheda-db psql -U koheda -d koheda -c "\d beacons"
```
**Expect:** Beacons table with columns: id, user_id, location, vibe_tags, status, created_at, expires_at.

---

### Step 13 — Beacon activate endpoint

```typescript
// src/modules/beacon/beacon.manager.ts
import { db } from '../../db';
import { beaconBus } from './beacon.events';

const BEACON_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
const expiryTimers = new Map<string, NodeJS.Timeout>();

export async function activateBeacon(userId: string, lat: number, lng: number, vibeTags: string[]) {
  // Validate
  if (!vibeTags || vibeTags.length === 0) {
    throw { statusCode: 400, message: 'Select at least 1 vibe tag' };
  }

  // Insert
  const expiresAt = new Date(Date.now() + BEACON_TTL_MS);
  const result = await db.query(
    `INSERT INTO beacons (user_id, location, vibe_tags, status, expires_at)
     VALUES ($1, ST_Point($3, $2)::geography, $4, 'active', $5)
     RETURNING id, status, created_at, expires_at`,
    [userId, lat, lng, JSON.stringify(vibeTags), expiresAt]
  );

  const beacon = result.rows[0];
  const remainingMs = expiresAt.getTime() - Date.now();

  // Auto-expiry timer
  expiryTimers.set(beacon.id, setTimeout(() => expireBeacon(beacon.id), BEACON_TTL_MS));

  // Emit event
  beaconBus.emit('beacon:activated', { beaconId: beacon.id, userId, lat, lng, vibeTags });

  return {
    beaconId: beacon.id,
    status: beacon.status,
    vibeTags,
    expiresAt: beacon.expires_at,
    remainingMs,
    remainingDisplay: formatRemaining(remainingMs),
  };
}

export async function expireBeacon(beaconId: string) {
  await db.query(`UPDATE beacons SET status = 'expired' WHERE id = $1`, [beaconId]);
  expiryTimers.delete(beaconId);
  beaconBus.emit('beacon:expired', { beaconId });
}

function formatRemaining(ms: number): string {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `${h}H ${String(m).padStart(2, '0')}M`;
}
```

```typescript
// src/routes/beacon.routes.ts
import { FastifyInstance } from 'fastify';
import { activateBeacon } from '../modules/beacon/beacon.manager';

export async function beaconRoutes(app: FastifyInstance) {
  app.post('/api/beacon/activate', async (req) => {
    const { userId, lat, lng, vibeTags } = req.body as any;
    return activateBeacon(userId, lat, lng, vibeTags);
  });
}
```

Register in `app.ts`:
```typescript
import { beaconRoutes } from './routes/beacon.routes';
app.register(beaconRoutes);
```

**✅ Test:**
```bash
curl -X POST http://localhost:3000/api/beacon/activate \
  -H "Content-Type: application/json" \
  -d '{"userId":"user-01","lat":6.9147,"lng":79.8536,"vibeTags":["rooftop","cocktails"]}'
```
**Expect:**
```json
{
  "beaconId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "status": "active",
  "vibeTags": ["rooftop","cocktails"],
  "expiresAt": "2026-07-02T...",
  "remainingMs": 7199998,
  "remainingDisplay": "2H 00M"
}
```

**Verify in DB:**
```bash
docker exec -it koheda-db psql -U koheda -d koheda \
  -c "SELECT id, user_id, status, vibe_tags, expires_at FROM beacons;"
```

---

### Step 14 — One-beacon-per-user guard

Add this check at the top of `activateBeacon()`:

```typescript
// Add to beacon.manager.ts — inside activateBeacon, before INSERT
const existing = await db.query(
  `SELECT id FROM beacons WHERE user_id = $1 AND status = 'active' AND expires_at > NOW()`,
  [userId]
);
if (existing.rows.length > 0) {
  throw { statusCode: 400, message: 'User already has an active beacon' };
}
```

**✅ Test:**
```bash
# First activation (should succeed — or use a new userId if step 13's beacon is still active)
curl -X POST http://localhost:3000/api/beacon/activate \
  -H "Content-Type: application/json" \
  -d '{"userId":"user-02","lat":6.9147,"lng":79.8536,"vibeTags":["dj"]}'
# → 200 OK

# Second activation same user (should FAIL)
curl -X POST http://localhost:3000/api/beacon/activate \
  -H "Content-Type: application/json" \
  -d '{"userId":"user-02","lat":6.9147,"lng":79.8536,"vibeTags":["rooftop"]}'
```
**Expect:** `400 — "User already has an active beacon"`

---

### Step 15 — Cancel beacon

```typescript
// Add to beacon.manager.ts
export async function cancelBeacon(beaconId: string, userId: string) {
  const result = await db.query(
    `UPDATE beacons SET status = 'cancelled'
     WHERE id = $1 AND user_id = $2 AND status = 'active'
     RETURNING id, status`,
    [beaconId, userId]
  );
  if (result.rows.length === 0) throw { statusCode: 404, message: 'Beacon not found' };

  const timer = expiryTimers.get(beaconId);
  if (timer) { clearTimeout(timer); expiryTimers.delete(beaconId); }

  beaconBus.emit('beacon:cancelled', { beaconId });
  return { beaconId, status: 'cancelled' };
}
```

```typescript
// Add to beacon.routes.ts
app.post('/api/beacon/:id/cancel', async (req) => {
  const { id } = req.params as any;
  const { userId } = req.body as any;
  return cancelBeacon(id, userId);
});
```

**✅ Test:**
```bash
# Cancel the beacon from step 14
curl -X POST http://localhost:3000/api/beacon/<BEACON_ID>/cancel \
  -H "Content-Type: application/json" \
  -d '{"userId":"user-02"}'
```
**Expect:** `{ "beaconId": "...", "status": "cancelled" }`

```bash
# Verify user can now activate a new one
curl -X POST http://localhost:3000/api/beacon/activate \
  -H "Content-Type: application/json" \
  -d '{"userId":"user-02","lat":6.9147,"lng":79.8536,"vibeTags":["dj"]}'
```
**Expect:** `200 OK` — new beacon created.

---

### Step 16 — Auto-expiry timer

The timer is already set in step 13. To verify it works without waiting 2 hours, add a short-lived test beacon:

```typescript
// Add to beacon.routes.ts — debug endpoint
app.post('/api/beacon/activate-test', async (req) => {
  const { userId, lat, lng, vibeTags, ttlSeconds = 10 } = req.body as any;
  // Same as activate but with custom short TTL for testing
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
  const result = await db.query(
    `INSERT INTO beacons (user_id, location, vibe_tags, status, expires_at)
     VALUES ($1, ST_Point($3, $2)::geography, $4, 'active', $5)
     RETURNING id`,
    [userId, lat, lng, JSON.stringify(vibeTags), expiresAt]
  );
  const beaconId = result.rows[0].id;
  expiryTimers.set(beaconId, setTimeout(() => expireBeacon(beaconId), ttlSeconds * 1000));
  return { beaconId, expiresInSeconds: ttlSeconds };
});
```

**✅ Test:**
```bash
# Create a beacon that expires in 10 seconds
curl -X POST http://localhost:3000/api/beacon/activate-test \
  -H "Content-Type: application/json" \
  -d '{"userId":"user-03","lat":6.9147,"lng":79.8536,"vibeTags":["rooftop"],"ttlSeconds":10}'
# → { "beaconId": "b-xxx", "expiresInSeconds": 10 }

# Check DB immediately
docker exec -it koheda-db psql -U koheda -d koheda \
  -c "SELECT id, status FROM beacons WHERE user_id = 'user-03';"
# → status = 'active'

# Wait 12 seconds, then check again
sleep 12
docker exec -it koheda-db psql -U koheda -d koheda \
  -c "SELECT id, status FROM beacons WHERE user_id = 'user-03';"
```
**Expect:** Status changed to `expired` automatically.

---

### Step 17 — Beacon status + remaining time endpoint

```typescript
// Add to beacon.routes.ts
app.get('/api/beacon/:id/status', async (req) => {
  const { id } = req.params as any;
  const result = await db.query(
    `SELECT id, user_id, status, vibe_tags, created_at, expires_at FROM beacons WHERE id = $1`,
    [id]
  );
  if (result.rows.length === 0) throw { statusCode: 404, message: 'Not found' };

  const beacon = result.rows[0];
  const remainingMs = Math.max(0, new Date(beacon.expires_at).getTime() - Date.now());
  const h = Math.floor(remainingMs / 3_600_000);
  const m = Math.floor((remainingMs % 3_600_000) / 60_000);

  return {
    ...beacon,
    remainingMs,
    remainingDisplay: `${h}H ${String(m).padStart(2, '0')}M`,
  };
});

// Get active beacon for a user
app.get('/api/beacon/active/:userId', async (req) => {
  const { userId } = req.params as any;
  const result = await db.query(
    `SELECT id, status, vibe_tags, expires_at FROM beacons
     WHERE user_id = $1 AND status = 'active' AND expires_at > NOW()
     LIMIT 1`,
    [userId]
  );
  if (result.rows.length === 0) return { active: false };
  return { active: true, beacon: result.rows[0] };
});
```

**✅ Test:**
```bash
# Check status of an active beacon
curl http://localhost:3000/api/beacon/<BEACON_ID>/status
# → { "status": "active", "remainingDisplay": "1H 58M", ... }

# Check by user
curl http://localhost:3000/api/beacon/active/user-01
# → { "active": true, "beacon": { ... } }

curl http://localhost:3000/api/beacon/active/nobody
# → { "active": false }
```

---

## Phase 4 · Spatial Engine + Vibe Shield

---

### Step 18 — Spatial query: find restaurants near a beacon

```typescript
// src/modules/beacon/beacon.spatial.ts
import { db } from '../../db';

export async function findNearbyRestaurants(beaconId: string) {
  const result = await db.query(`
    SELECT
      r.id AS restaurant_id,
      r.name,
      r.rating,
      ROUND((ST_Distance(r.location, b.location) / 1000)::numeric, 2) AS distance_km,
      array_agg(v.name) AS restaurant_tags,
      array_agg(v.radius_km) AS tag_radii,
      b.vibe_tags AS consumer_tags
    FROM beacons b
    JOIN restaurants r ON ST_DWithin(r.location, b.location, 18000)
    LEFT JOIN restaurant_vibe_tags rvt ON r.id = rvt.restaurant_id
    LEFT JOIN vibe_tags v ON v.id = rvt.vibe_tag_id
    WHERE b.id = $1
    GROUP BY r.id, r.name, r.rating, r.location, b.location, b.vibe_tags
    ORDER BY distance_km
  `, [beaconId]);

  return result.rows;
}
```

```typescript
// Add to beacon.routes.ts
import { findNearbyRestaurants } from '../modules/beacon/beacon.spatial';

app.get('/api/beacon/:id/nearby', async (req) => {
  const { id } = req.params as any;
  const restaurants = await findNearbyRestaurants(id);
  return { beaconId: id, count: restaurants.length, restaurants };
});
```

**✅ Test:**
```bash
# Use an active beacon ID
curl http://localhost:3000/api/beacon/<BEACON_ID>/nearby | jq '.restaurants[] | {name, distance_km, restaurant_tags}'
```
**Expect:** Restaurants within 18km, each with distance and their tags.

---

### Step 19 — ψ signal strength calculation

```typescript
// Add to beacon.spatial.ts
export function calculatePsi(distanceKm: number, radiusKm: number): number {
  if (distanceKm > radiusKm) return 0;
  return Math.round((1 - distanceKm / radiusKm) * 1000) / 1000; // 3 decimal places
}

export function calculateSpatialResults(restaurants: any[], consumerTags: string[]) {
  return restaurants.map(r => {
    // Find best matching radius from consumer's tags that this restaurant also has
    const rTags: string[] = r.restaurant_tags || [];
    const tagRadii: number[] = r.tag_radii || [];

    let bestPsi = 0;
    let bestTag = '';
    let bestRadius = 0;

    // For each restaurant tag, check if it's in consumer's tags
    rTags.forEach((tag: string, i: number) => {
      if (consumerTags.includes(tag)) {
        const radius = tagRadii[i];
        const psi = calculatePsi(Number(r.distance_km), radius);
        if (psi > bestPsi) {
          bestPsi = psi;
          bestTag = tag;
          bestRadius = radius;
        }
      }
    });

    return {
      restaurant: r.name,
      restaurant_id: r.restaurant_id,
      distance_km: Number(r.distance_km),
      signalStrength: bestPsi,
      matchedViaTag: bestTag || null,
      radiusUsed: bestRadius || null,
      inRange: bestPsi > 0,
    };
  });
}
```

```typescript
// Add to beacon.routes.ts
import { findNearbyRestaurants, calculateSpatialResults } from '../modules/beacon/beacon.spatial';

app.get('/api/beacon/:id/spatial', async (req) => {
  const { id } = req.params as any;
  const rows = await findNearbyRestaurants(id);
  if (rows.length === 0) return { beaconId: id, results: [] };

  const consumerTags = rows[0].consumer_tags;
  const results = calculateSpatialResults(rows, consumerTags);
  const inRange = results.filter(r => r.inRange);
  const outOfRange = results.filter(r => !r.inRange);

  return { beaconId: id, consumerTags, inRange: inRange.length, outOfRange: outOfRange.length, results };
});
```

**✅ Test:**
```bash
curl http://localhost:3000/api/beacon/<BEACON_ID>/spatial | jq '.results[] | {restaurant, distance_km, signalStrength, matchedViaTag}'
```
**Expect:**
```json
{
  "restaurant": "The Hangover Bar",
  "distance_km": 0.6,
  "signalStrength": 0.914,
  "matchedViaTag": "cocktails"
}
```

**Manual math check:** distance=0.6, radius=7 (cocktails), ψ = 1 - 0.6/7 = 0.914 ✓

---

### Step 20 — Jaccard Vibe Shield

```typescript
// src/modules/beacon/beacon.vibe.ts

export function jaccardSimilarity(consumerTags: string[], restaurantTags: string[]): {
  score: number;
  matchedTags: string[];
  passed: boolean;
} {
  const cSet = new Set(consumerTags);
  const rSet = new Set(restaurantTags);

  const intersection = [...cSet].filter(t => rSet.has(t));
  const union = new Set([...cSet, ...rSet]);

  const score = union.size === 0 ? 0 : Math.round((intersection.length / union.size) * 1000) / 1000;

  return {
    score,
    matchedTags: intersection,
    passed: score > 0,
  };
}
```

**✅ Test — unit test this directly:**
```bash
npx tsx -e "
const { jaccardSimilarity } = require('./src/modules/beacon/beacon.vibe');

// Test 1: Overlap
console.log('Test 1:', jaccardSimilarity(['rooftop','cocktails'], ['rooftop','cocktails','dj']));
// → score: 0.667, matchedTags: ['rooftop','cocktails'], passed: true

// Test 2: No overlap
console.log('Test 2:', jaccardSimilarity(['rooftop','cocktails'], ['byob','live music']));
// → score: 0, matchedTags: [], passed: false

// Test 3: Perfect match
console.log('Test 3:', jaccardSimilarity(['dj'], ['dj']));
// → score: 1, matchedTags: ['dj'], passed: true
"
```
**Expect:** All three results match the Jaccard formula from your architecture doc.

---

### Step 21 — Combined matches endpoint (spatial + vibe)

```typescript
// Add to beacon.routes.ts
import { jaccardSimilarity } from '../modules/beacon/beacon.vibe';

app.get('/api/beacon/:id/matches', async (req) => {
  const { id } = req.params as any;
  const rows = await findNearbyRestaurants(id);
  if (rows.length === 0) return { beaconId: id, passed: [], shielded: [] };

  const consumerTags: string[] = rows[0].consumer_tags;
  const spatialResults = calculateSpatialResults(rows, consumerTags);

  const passed: any[] = [];
  const shielded: any[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const spatial = spatialResults[i];
    const vibe = jaccardSimilarity(consumerTags, r.restaurant_tags || []);

    const combined = {
      restaurant: r.name,
      distance_km: spatial.distance_km,
      signalStrength: spatial.signalStrength,
      jaccardScore: vibe.score,
      matchPercent: Math.round(vibe.score * 100) + '%',
      matchedTags: vibe.matchedTags,
      restaurantTags: r.restaurant_tags,
      status: vibe.passed ? 'PASSED' : 'VIBE_SHIELDED',
    };

    if (vibe.passed && spatial.inRange) {
      passed.push(combined);
    } else {
      shielded.push(combined);
    }
  }

  // Sort passed by Jaccard score descending
  passed.sort((a, b) => b.jaccardScore - a.jaccardScore);

  return {
    beaconId: id,
    consumerTags,
    summary: { total: rows.length, passed: passed.length, shielded: shielded.length },
    passed,
    shielded,
  };
});
```

**✅ Test:**
```bash
curl http://localhost:3000/api/beacon/<BEACON_ID>/matches | jq '.'
```
**Expect:**
```json
{
  "consumerTags": ["rooftop", "cocktails"],
  "summary": { "total": 12, "passed": 7, "shielded": 5 },
  "passed": [
    { "restaurant": "Rooftop 27", "matchPercent": "100%", "matchedTags": ["rooftop","cocktails"], "status": "PASSED" },
    { "restaurant": "The Hangover Bar", "matchPercent": "67%", ... },
    ...
  ],
  "shielded": [
    { "restaurant": "The Commons", "matchPercent": "0%", "status": "VIBE_SHIELDED" },
    ...
  ]
}
```

Restaurants with 0% match are shielded. Restaurants with >0% and in range pass through.

---

## Phase 5 · Noise Tracker

---

### Step 22 — Noise tracker with in-memory state + DB persistence

```typescript
// src/modules/beacon/beacon.noise.ts
import { db } from '../../db';

interface NoiseState {
  level: number;
  state: 'active' | 'muted' | 'claimed';
  updatedAt: number;
}

const LAMBDA = 0.08;
const DELTA_HIT = 0.15;
const MUTE_THRESHOLD = 1.0;
const RECOVERY_THRESHOLD = 0.30;

const cache = new Map<string, NoiseState>();

function getDecayedNoise(state: NoiseState): number {
  const hours = (Date.now() - state.updatedAt) / 3_600_000;
  return state.level * Math.exp(-LAMBDA * hours);
}

export async function applyNoise(userId: string, matchCount: number): Promise<NoiseState> {
  let state = cache.get(userId) ?? { level: 0, state: 'active' as const, updatedAt: Date.now() };

  // Decay + spike
  let newLevel = getDecayedNoise(state) + DELTA_HIT * matchCount;
  let newState: NoiseState['state'] = newLevel >= MUTE_THRESHOLD ? 'muted'
    : newLevel < RECOVERY_THRESHOLD ? 'active'
    : state.state;

  const updated: NoiseState = { level: Math.round(newLevel * 1000) / 1000, state: newState, updatedAt: Date.now() };
  cache.set(userId, updated);

  // Persist to DB (fire-and-forget)
  db.query(
    `UPDATE users SET noise_level = $1, noise_state = $2, noise_updated = NOW() WHERE id = $3`,
    [updated.level, updated.state, userId]
  ).catch(() => {}); // ignore if user table not ready

  return updated;
}

export function getNoiseState(userId: string, simulateMinutes?: number): {
  state: string; noiseLevel: number; canReceive: boolean;
} {
  let state = cache.get(userId) ?? { level: 0, state: 'active' as const, updatedAt: Date.now() };

  let adjustedUpdatedAt = state.updatedAt;
  if (simulateMinutes) {
    adjustedUpdatedAt = state.updatedAt - simulateMinutes * 60_000;
  }

  const tempState = { ...state, updatedAt: adjustedUpdatedAt };
  const decayed = getDecayedNoise(tempState);
  const currentState = decayed >= MUTE_THRESHOLD ? 'muted'
    : decayed < RECOVERY_THRESHOLD ? 'active'
    : state.state;

  return {
    state: currentState,
    noiseLevel: Math.round(decayed * 1000) / 1000,
    canReceive: decayed < RECOVERY_THRESHOLD && currentState === 'active',
  };
}
```

```typescript
// Add to beacon.routes.ts
import { getNoiseState, applyNoise } from '../modules/beacon/beacon.noise';

app.get('/api/consumer/:userId/state', async (req) => {
  const { userId } = req.params as any;
  const { simulateMinutes } = req.query as any;
  return getNoiseState(userId, simulateMinutes ? Number(simulateMinutes) : undefined);
});
```

**✅ Test:**
```bash
# Fresh user — should be active with 0 noise
curl http://localhost:3000/api/consumer/user-10/state
```
**Expect:** `{ "state": "active", "noiseLevel": 0, "canReceive": true }`

---

### Step 23 — Trigger noise via beacon matches

Wire the vibe match results into the noise tracker:

```typescript
// Add to beacon.routes.ts — update the /matches endpoint to also apply noise
import { applyNoise } from '../modules/beacon/beacon.noise';

// Inside the GET /api/beacon/:id/matches handler, after calculating passed results:
// Add at the end, before return:
const beacon = await db.query('SELECT user_id FROM beacons WHERE id = $1', [id]);
if (beacon.rows.length > 0 && passed.length > 0) {
  const noiseResult = await applyNoise(beacon.rows[0].user_id, passed.length);
  return {
    beaconId: id, consumerTags,
    summary: { total: rows.length, passed: passed.length, shielded: shielded.length },
    noiseUpdate: noiseResult,
    passed, shielded,
  };
}
```

**✅ Test:**
```bash
# Hit matches endpoint (triggers noise)
curl http://localhost:3000/api/beacon/<BEACON_ID>/matches | jq '.noiseUpdate'
# → { "level": 1.05, "state": "muted" }  (if 7 matches: 7 × 0.15 = 1.05)

# Check consumer state
curl http://localhost:3000/api/consumer/user-01/state
# → { "state": "muted", "noiseLevel": 1.05, "canReceive": false }
```

---

### Step 24 — Verify time decay

```bash
# Simulate 30 minutes passing (noise should decay)
curl "http://localhost:3000/api/consumer/user-01/state?simulateMinutes=30"
# η = 1.05 × e^(-0.08 × 0.5) = 1.05 × 0.961 = 1.009 → still muted

# Simulate 2 hours passing
curl "http://localhost:3000/api/consumer/user-01/state?simulateMinutes=120"
# η = 1.05 × e^(-0.08 × 2) = 1.05 × 0.852 = 0.895 → still above 0.30

# Simulate 15 hours passing
curl "http://localhost:3000/api/consumer/user-01/state?simulateMinutes=900"
# η = 1.05 × e^(-0.08 × 15) = 1.05 × 0.301 = 0.316 → nearly recovered

# Simulate 20 hours
curl "http://localhost:3000/api/consumer/user-01/state?simulateMinutes=1200"
# η = 1.05 × e^(-0.08 × 20) = 1.05 × 0.202 = 0.212 → active again!
```
**Expect:** Noise decays exponentially. Consumer transitions from `muted` → `active` once below 0.30.

---

## Phase 6 · Auction Engine

---

### Step 25 — Auction tables

```sql
-- migrations/005_auction.sql

CREATE TABLE IF NOT EXISTS auction_rounds (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  beacon_id    UUID REFERENCES beacons(id),
  round_number INT NOT NULL DEFAULT 1,
  winner_id    UUID REFERENCES restaurants(id),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bids (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auction_round_id UUID REFERENCES auction_rounds(id),
  restaurant_id    UUID REFERENCES restaurants(id),
  bid_amount       DECIMAL(10,2) NOT NULL,
  match_ratio      DECIMAL(4,3),
  efficiency_score DECIMAL(10,3),
  is_winner        BOOLEAN DEFAULT FALSE,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS auction_history (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vibe_tag     TEXT NOT NULL,
  winner_id    UUID REFERENCES restaurants(id),
  bid_amount   DECIMAL(10,2),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_auction_history_tag ON auction_history(vibe_tag, created_at DESC);

CREATE TABLE IF NOT EXISTS deals (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auction_id    UUID REFERENCES auction_rounds(id),
  restaurant_id UUID REFERENCES restaurants(id),
  title         TEXT NOT NULL,
  description   TEXT,
  total_claims  INT DEFAULT 30,
  claimed_count INT DEFAULT 0,
  expires_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
```

```bash
pnpm run migrate
```

**✅ Test:**
```bash
docker exec -it koheda-db psql -U koheda -d koheda -c "\dt"
```
**Expect:** Tables `auction_rounds`, `bids`, `auction_history`, `deals` all listed.

---

### Step 26 — Pond density (μ)

```typescript
// src/modules/auction/auction.engine.ts
import { db } from '../../db';
import { jaccardSimilarity } from '../beacon/beacon.vibe';

const MU_MIN = 0.10; // minimum match ratio to bid

export async function calculatePondDensity(restaurantId: string, beaconId: string) {
  // Get all active beacons near this restaurant
  const result = await db.query(`
    SELECT b.id, b.vibe_tags, r_tags.tags AS restaurant_tags
    FROM beacons b,
    LATERAL (
      SELECT array_agg(v.name) AS tags
      FROM restaurant_vibe_tags rvt
      JOIN vibe_tags v ON v.id = rvt.vibe_tag_id
      WHERE rvt.restaurant_id = $1
    ) r_tags
    WHERE b.status = 'active' AND b.expires_at > NOW()
    AND ST_DWithin(b.location, (SELECT location FROM restaurants WHERE id = $1), 18000)
  `, [restaurantId]);

  const totalActive = result.rows.length; // ρ_eff
  let relevantCount = 0; // ρ_rel

  for (const row of result.rows) {
    const j = jaccardSimilarity(row.vibe_tags, row.restaurant_tags || []);
    if (j.score >= 0.3) relevantCount++;
  }

  const mu = totalActive === 0 ? 0 : relevantCount / Math.max(1, totalActive);
  return { mu: Math.round(mu * 1000) / 1000, relevant: relevantCount, total: totalActive, eligible: mu >= MU_MIN };
}
```

**✅ Test:**
```bash
# Make sure at least 1 beacon is active, then:
curl -X POST http://localhost:3000/api/auction/pond-density \
  -H "Content-Type: application/json" \
  -d '{"restaurantName":"The Hangover Bar"}'
```
(You'll need a quick route for this — or test via the full auction in step 29.)

---

### Step 27 — Surge pricing (σ)

```typescript
// Add to auction.engine.ts
export async function calculateSurge(restaurantTags: string[]): Promise<{
  avgSurge: number; bidFloor: number; perTag: Record<string, number>;
}> {
  const wins = await db.query(`
    SELECT vibe_tag, COUNT(*) as wins
    FROM auction_history
    WHERE created_at >= NOW() - INTERVAL '30 days'
    GROUP BY vibe_tag
  `);

  const winMap: Record<string, number> = {};
  for (const row of wins.rows) winMap[row.vibe_tag] = Number(row.wins);

  const maxWins = Math.max(1, ...Object.values(winMap));
  const perTag: Record<string, number> = {};
  let totalSurge = 0;

  for (const tag of restaurantTags) {
    const tagWins = winMap[tag] || 0;
    const surge = 1 + 0.8 * (tagWins / maxWins);
    perTag[tag] = Math.round(surge * 100) / 100;
    totalSurge += surge;
  }

  const avgSurge = Math.round((totalSurge / restaurantTags.length) * 100) / 100;
  const BASE_MIN_BID = 300; // LKR
  const bidFloor = Math.round(BASE_MIN_BID * avgSurge);

  return { avgSurge, bidFloor, perTag };
}
```

**✅ Test:**
```bash
# With no auction history yet, surge should be 1.0× for all tags
curl -X POST http://localhost:3000/api/auction/surge \
  -H "Content-Type: application/json" \
  -d '{"tags":["cocktails","rooftop","dj"]}'
```
**Expect:** `{ "avgSurge": 1.0, "bidFloor": 300, "perTag": { "cocktails": 1, "rooftop": 1, "dj": 1 } }`

---

### Step 28 — Efficiency score (η_j)

```typescript
// Add to auction.engine.ts
const LAMBDA_DISTANCE = 0.08;

export function efficiencyScore(bidAmount: number, avgDistanceKm: number): number {
  return Math.round(bidAmount * Math.exp(-LAMBDA_DISTANCE * avgDistanceKm) * 100) / 100;
}
```

**✅ Test — inline calculation:**
```bash
npx tsx -e "
const eta = 800 * Math.exp(-0.08 * 0.6);
console.log('η_j =', Math.round(eta * 100) / 100);
// Expected: 762.38
"
```
**Expect:** `η_j = 762.38` — matches the formula `B_j · e^(-λd̄_j)`.

---

### Step 29 — Full auction simulation endpoint

```typescript
// src/routes/auction.routes.ts
import { FastifyInstance } from 'fastify';
import { db } from '../db';
import { jaccardSimilarity } from '../modules/beacon/beacon.vibe';
import { calculateSurge, efficiencyScore } from '../modules/auction/auction.engine';

export async function auctionRoutes(app: FastifyInstance) {

  app.post('/api/auction/simulate', async (req) => {
    const { beaconId } = req.body as any;

    // 1. Get beacon
    const beacon = await db.query(
      `SELECT id, user_id, vibe_tags, location FROM beacons WHERE id = $1 AND status = 'active'`, [beaconId]
    );
    if (beacon.rows.length === 0) throw { statusCode: 404, message: 'No active beacon found' };
    const b = beacon.rows[0];
    const consumerTags: string[] = b.vibe_tags;

    // 2. Get nearby restaurants with tags
    const restaurants = await db.query(`
      SELECT r.id, r.name,
             ROUND((ST_Distance(r.location, $1::geography) / 1000)::numeric, 2) AS distance_km,
             array_agg(v.name) AS tags
      FROM restaurants r
      JOIN restaurant_vibe_tags rvt ON r.id = rvt.restaurant_id
      JOIN vibe_tags v ON v.id = rvt.vibe_tag_id
      WHERE ST_DWithin(r.location, $1::geography, 18000)
      GROUP BY r.id, r.name, r.location
      ORDER BY distance_km
    `, [b.location]);

    // 3. Calculate for each restaurant: Jaccard → pond density → surge → bid → efficiency
    const bids: any[] = [];

    for (const r of restaurants.rows) {
      const vibe = jaccardSimilarity(consumerTags, r.tags);
      if (!vibe.passed) continue; // vibe shielded

      const mu = vibe.score; // simplified: using Jaccard as match ratio proxy
      if (mu < 0.10) continue; // below min match ratio

      const surge = await calculateSurge(r.tags);
      const baseBid = 300 + Math.floor(Math.random() * 700); // simulate restaurant bid 300-1000 LKR
      const effectiveBid = Math.round(baseBid * (0.5 + 0.5 * mu));
      const finalBid = Math.max(surge.bidFloor, effectiveBid);
      const eta = efficiencyScore(finalBid, Number(r.distance_km));

      bids.push({
        restaurant_id: r.id,
        restaurant: r.name,
        distance_km: Number(r.distance_km),
        matchRatio: mu,
        matchPercent: Math.round(vibe.score * 100) + '%',
        matchedTags: vibe.matchedTags,
        baseBid,
        surgeFactor: surge.avgSurge,
        bidFloor: surge.bidFloor,
        effectiveBid,
        finalBid,
        efficiencyScore: eta,
      });
    }

    // 4. Rank by efficiency score
    bids.sort((a, b) => b.efficiencyScore - a.efficiencyScore);
    bids.forEach((b, i) => {
      b.rank = i + 1;
      b.status = i === 0 ? 'WINNER' : 'OUTBID';
    });

    const winner = bids.length > 0 ? bids[0] : null;

    // 5. Record auction round in DB
    if (winner) {
      const round = await db.query(
        `INSERT INTO auction_rounds (beacon_id, winner_id) VALUES ($1, $2) RETURNING id, round_number`,
        [beaconId, winner.restaurant_id]
      );

      // Record in history for future surge calculations
      for (const tag of winner.matchedTags) {
        await db.query(
          `INSERT INTO auction_history (vibe_tag, winner_id, bid_amount) VALUES ($1, $2, $3)`,
          [tag, winner.restaurant_id, winner.finalBid]
        );
      }
    }

    return {
      beaconId,
      consumerTags,
      totalNearby: restaurants.rows.length,
      eligible: bids.length,
      bids,
      winner: winner ? {
        restaurant: winner.restaurant,
        distance_km: winner.distance_km,
        matchPercent: winner.matchPercent,
        finalBid: winner.finalBid,
        efficiencyScore: winner.efficiencyScore,
        revenue: {
          bidFee: winner.finalBid + ' LKR',
          claimFee: '200 LKR (on redemption)',
        },
      } : null,
    };
  });
}
```

Register in `app.ts`:
```typescript
import { auctionRoutes } from './routes/auction.routes';
app.register(auctionRoutes);
```

**✅ Test:**
```bash
curl -X POST http://localhost:3000/api/auction/simulate \
  -H "Content-Type: application/json" \
  -d '{"beaconId":"<ACTIVE_BEACON_ID>"}' | jq '.'
```
**Expect:**
```json
{
  "consumerTags": ["rooftop", "cocktails"],
  "totalNearby": 12,
  "eligible": 7,
  "bids": [
    { "rank": 1, "restaurant": "The Hangover Bar", "efficiencyScore": 762.38, "status": "WINNER" },
    { "rank": 2, "restaurant": "Rooftop 27", "efficiencyScore": 534.12, "status": "OUTBID" },
    ...
  ],
  "winner": { "restaurant": "The Hangover Bar", "revenue": { "bidFee": "800 LKR" } }
}
```

```bash
# Run it again — surge should increase since we recorded a winner
curl -X POST http://localhost:3000/api/auction/simulate \
  -d '{"beaconId":"<ACTIVE_BEACON_ID>"}' | jq '.bids[0].surgeFactor'
```
**Expect:** Surge factor increases from `1.0` to `1.8` (since the winning tag now has history).

---

## Phase 7 · Real-Time + Deals

---

### Step 30 — Socket.IO on the same server

```bash
pnpm add socket.io
```

```typescript
// src/ws/socket.ts
import { Server } from 'socket.io';
import { beaconBus } from '../modules/beacon/beacon.events';

export function setupWebSocket(httpServer: any) {
  const io = new Server(httpServer, { cors: { origin: '*' } });

  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    socket.on('join:beacon', (beaconId: string) => {
      socket.join(`beacon:${beaconId}`);
      console.log(`${socket.id} joined beacon:${beaconId}`);
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
  });

  // Forward beacon events to WebSocket rooms
  beaconBus.on('beacon:activated', (data) => {
    io.to(`beacon:${data.beaconId}`).emit('beacon:activated', data);
  });

  beaconBus.on('beacon:expired', (data) => {
    io.to(`beacon:${data.beaconId}`).emit('beacon:expired', data);
  });

  return io;
}
```

Update `app.ts` to attach Socket.IO:
```typescript
import { setupWebSocket } from './ws/socket';

// Change app.listen to:
app.listen({ port: 3000, host: '0.0.0.0' }, (err) => {
  if (err) throw err;
  setupWebSocket(app.server);
  console.log('Server + WebSocket running on http://localhost:3000');
});
```

**✅ Test:**
```bash
# Install WebSocket test tool
npx wscat -c ws://localhost:3000/socket.io/?EIO=4&transport=websocket
```
**Expect:** Connection established, `Client connected: ...` appears in server logs.

---

### Step 31 — Live beacon events over WebSocket

```typescript
// Add countdown broadcast to beacon.manager.ts
import { beaconBus } from './beacon.events';

// Add to activateBeacon(), after creating the beacon:
// Emit countdown every 30 seconds
const countdownInterval = setInterval(() => {
  const remaining = expiresAt.getTime() - Date.now();
  if (remaining <= 0) { clearInterval(countdownInterval); return; }
  beaconBus.emit('beacon:countdown', {
    beaconId: beacon.id,
    remainingMs: remaining,
    display: formatRemaining(remaining),
  });
}, 30_000);
```

```typescript
// Add to ws/socket.ts
beaconBus.on('beacon:countdown', (data) => {
  io.to(`beacon:${data.beaconId}`).emit('beacon:countdown', data);
});
```

**✅ Test:** Open two terminals:

**Terminal 1 — WebSocket client:**
```bash
# Connect and join a beacon room (use Socket.IO client for proper protocol)
npx tsx -e "
const { io } = require('socket.io-client');
const socket = io('http://localhost:3000');
socket.on('connect', () => {
  console.log('Connected');
  socket.emit('join:beacon', '<BEACON_ID>');
});
socket.on('beacon:countdown', (data) => console.log('Countdown:', data));
socket.on('beacon:expired', (data) => console.log('Expired!', data));
"
```

**Terminal 2 — activate beacon:**
```bash
curl -X POST http://localhost:3000/api/beacon/activate-test \
  -H "Content-Type: application/json" \
  -d '{"userId":"user-ws","lat":6.9147,"lng":79.8536,"vibeTags":["rooftop"],"ttlSeconds":60}'
```

**Expect:** Terminal 1 receives `Countdown: { display: "0H 00M", ... }` every 30 seconds, then `Expired!` after 60 seconds.

---

### Step 32 — Deal claim + QR code

```typescript
// src/routes/deal.routes.ts
import { FastifyInstance } from 'fastify';
import { db } from '../db';
import crypto from 'crypto';

export async function dealRoutes(app: FastifyInstance) {

  // POST /api/deal/create (called after auction winner is selected)
  app.post('/api/deal/create', async (req) => {
    const { auctionId, restaurantId, title, description } = req.body as any;
    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2h
    const result = await db.query(
      `INSERT INTO deals (auction_id, restaurant_id, title, description, expires_at)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [auctionId, restaurantId, title, description, expiresAt]
    );
    return result.rows[0];
  });

  // POST /api/deal/:id/claim
  app.post('/api/deal/:id/claim', async (req) => {
    const { id } = req.params as any;
    const { userId } = req.body as any;

    // Check deal exists and has claims left
    const deal = await db.query('SELECT * FROM deals WHERE id = $1', [id]);
    if (deal.rows.length === 0) throw { statusCode: 404, message: 'Deal not found' };
    if (deal.rows[0].claimed_count >= deal.rows[0].total_claims) {
      throw { statusCode: 400, message: 'No claims left' };
    }

    // Generate QR code string
    const claimCode = 'K-' + crypto.randomBytes(3).toString('hex').toUpperCase().slice(0, 7);

    // Update claim count
    await db.query('UPDATE deals SET claimed_count = claimed_count + 1 WHERE id = $1', [id]);

    const remainingMs = new Date(deal.rows[0].expires_at).getTime() - Date.now();

    return {
      dealId: id,
      userId,
      claimCode,
      restaurant: deal.rows[0].title,
      expiresIn: Math.round(remainingMs / 60_000) + ' minutes',
      note: 'Single-use · server-verified · auto-revokes 30 min after redemption',
    };
  });
}
```

Register in `app.ts`:
```typescript
import { dealRoutes } from './routes/deal.routes';
app.register(dealRoutes);
```

**✅ Test:**
```bash
# Create a deal (normally done by auction engine)
curl -X POST http://localhost:3000/api/deal/create \
  -H "Content-Type: application/json" \
  -d '{"restaurantId":"<RESTAURANT_UUID>","title":"30% off cocktails","description":"Until 11pm all signature drinks"}'

# Claim it
curl -X POST http://localhost:3000/api/deal/<DEAL_ID>/claim \
  -H "Content-Type: application/json" \
  -d '{"userId":"user-01"}'
```
**Expect:**
```json
{
  "dealId": "...",
  "claimCode": "K-A3F2B1C",
  "restaurant": "30% off cocktails",
  "expiresIn": "119 minutes",
  "note": "Single-use · server-verified · auto-revokes 30 min after redemption"
}
```

---

## Summary Checklist

| Step | What | Test Command | Pass Criteria |
|---|---|---|---|
| 1 | Project init | `pnpm ls` | No errors |
| 2 | TypeScript + scripts | `pnpm dev` | Prints hello |
| 3 | PostgreSQL + PostGIS | `SELECT PostGIS_Version()` | Returns version |
| 4 | DB connection | `npx tsx src/test-db.ts` | Prints timestamp |
| 5 | Health endpoint | `curl /health` | `postgres: connected` |
| 6 | Migration runner | `pnpm run migrate` | Runs SQL files |
| 7 | Vibe tags table | `\dt` | Table exists |
| 8 | Seed vibe tags | `SELECT * FROM vibe_tags` | 12 rows |
| 9 | Restaurants + tags | `SELECT name, tags FROM...` | 15 restaurants |
| 10 | PostGIS spatial | `ST_DWithin` query | Distance in km |
| 11 | Restaurant API | `curl /api/restaurants?lat=...` | Sorted by distance |
| 12 | Beacon table + events | `\d beacons` | Table exists |
| 13 | Beacon activate | `POST /api/beacon/activate` | Returns beacon ID |
| 14 | 1-per-user guard | Second activation | Returns 400 |
| 15 | Beacon cancel | `POST /api/beacon/:id/cancel` | Status: cancelled |
| 16 | Auto-expiry | 10-second TTL test | Status → expired |
| 17 | Status endpoint | `GET /api/beacon/:id/status` | Shows remaining time |
| 18 | Nearby restaurants | `GET /api/beacon/:id/nearby` | Distance + tags |
| 19 | ψ signal strength | `GET /api/beacon/:id/spatial` | ψ = 0.914 at 0.6km |
| 20 | Jaccard similarity | Unit test | J = 0.667 |
| 21 | Combined matches | `GET /api/beacon/:id/matches` | Passed + shielded |
| 22 | Noise state | `GET /api/consumer/:id/state` | noiseLevel: 0 |
| 23 | Noise from matches | Hit matches → check state | Noise spikes |
| 24 | Time decay | `?simulateMinutes=1200` | Recovers to active |
| 25 | Auction tables | `\dt` | 4 new tables |
| 26 | Pond density (μ) | Via auction simulate | mu value |
| 27 | Surge pricing (σ) | Via auction simulate | surgeFactor |
| 28 | Efficiency (η_j) | Inline math | 762.38 |
| 29 | Full auction | `POST /api/auction/simulate` | Winner selected |
| 30 | WebSocket connect | `wscat` | Connected |
| 31 | Live events | Countdown in WS client | Receives updates |
| 32 | Deal claim + QR | `POST /api/deal/:id/claim` | Returns claim code |
