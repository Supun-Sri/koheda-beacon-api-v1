import { FastifyInstance } from 'fastify';
import {
  activateBeacon,
  cancelBeacon,
  getBeaconStatus,
  getUserActiveBeacon,
  expireBeacon,
} from '../modules/beacon/beacon.manager';
import {
  findNearbyRestaurants,
  calculateSpatialResults,
} from '../modules/beacon/beacon.spatial';
import { jaccardSimilarity } from '../modules/beacon/beacon.vibe';
import { getNoiseState, applyNoise, resetNoise } from '../modules/beacon/beacon.noise';

export async function beaconRoutes(app: FastifyInstance) {
  
  // POST /api/beacon/activate - Activate a new beacon
  app.post('/api/beacon/activate', async (req, reply) => {
    try {
      const { userId, lat, lng, vibeTags } = req.body as any;
      
      if (!userId || !lat || !lng) {
        return reply.code(400).send({ error: 'Missing required fields: userId, lat, lng' });
      }
      
      const result = await activateBeacon(userId, lat, lng, vibeTags);
      return result;
    } catch (error: any) {
      return reply.code(error.statusCode || 500).send({ error: error.message });
    }
  });

  // POST /api/beacon/:id/cancel - Cancel an active beacon
  app.post('/api/beacon/:id/cancel', async (req, reply) => {
    try {
      const { id } = req.params as any;
      const { userId } = req.body as any;
      
      if (!userId) {
        return reply.code(400).send({ error: 'Missing required field: userId' });
      }
      
      const result = await cancelBeacon(id, userId);
      return result;
    } catch (error: any) {
      return reply.code(error.statusCode || 500).send({ error: error.message });
    }
  });

  // GET /api/beacon/:id/status - Get beacon status and remaining time
  app.get('/api/beacon/:id/status', async (req, reply) => {
    try {
      const { id } = req.params as any;
      const result = await getBeaconStatus(id);
      return result;
    } catch (error: any) {
      return reply.code(error.statusCode || 500).send({ error: error.message });
    }
  });

  // GET /api/beacon/active/:userId - Get user's active beacon
  app.get('/api/beacon/active/:userId', async (req, reply) => {
    try {
      const { userId } = req.params as any;
      const result = await getUserActiveBeacon(userId);
      return result;
    } catch (error: any) {
      return reply.code(error.statusCode || 500).send({ error: error.message });
    }
  });

  // GET /api/beacon/:id/nearby - Find nearby restaurants (Step 18)
  app.get('/api/beacon/:id/nearby', async (req, reply) => {
    try {
      const { id } = req.params as any;
      const restaurants = await findNearbyRestaurants(id);
      return {
        beaconId: id,
        count: restaurants.length,
        restaurants,
      };
    } catch (error: any) {
      return reply.code(error.statusCode || 500).send({ error: error.message });
    }
  });

  // GET /api/beacon/:id/spatial - Spatial results with Ψ signal strength (Step 19)
  app.get('/api/beacon/:id/spatial', async (req, reply) => {
    try {
      const { id } = req.params as any;
      const rows = await findNearbyRestaurants(id);
      
      if (rows.length === 0) {
        return { beaconId: id, consumerTags: [], results: [] };
      }

      const consumerTags = rows[0].consumer_tags;
      const results = calculateSpatialResults(rows, consumerTags);
      const inRange = results.filter(r => r.inRange);
      const outOfRange = results.filter(r => !r.inRange);

      return {
        beaconId: id,
        consumerTags,
        inRange: inRange.length,
        outOfRange: outOfRange.length,
        results,
      };
    } catch (error: any) {
      return reply.code(error.statusCode || 500).send({ error: error.message });
    }
  });

  // GET /api/beacon/:id/matches - Combined spatial + vibe matching (Step 21)
  app.get('/api/beacon/:id/matches', async (req, reply) => {
    try {
      const { id } = req.params as any;
      const rows = await findNearbyRestaurants(id);
      
      if (rows.length === 0) {
        return {
          beaconId: id,
          consumerTags: [],
          summary: { total: 0, passed: 0, shielded: 0 },
          passed: [],
          shielded: [],
        };
      }

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
          restaurant_id: r.restaurant_id,
          distance_km: spatial.distance_km,
          signalStrength: spatial.signalStrength,
          matchedViaTag: spatial.matchedViaTag,
          radiusUsed: spatial.radiusUsed,
          jaccardScore: vibe.score,
          matchPercent: Math.round(vibe.score * 100) + '%',
          matchedTags: vibe.matchedTags,
          restaurantTags: r.restaurant_tags,
          rating: r.rating,
          status: vibe.passed && spatial.inRange ? 'PASSED' : 'VIBE_SHIELDED',
        };

        if (vibe.passed && spatial.inRange) {
          passed.push(combined);
        } else {
          shielded.push(combined);
        }
      }

      // Sort passed by Jaccard score descending (best matches first)
      passed.sort((a, b) => b.jaccardScore - a.jaccardScore);

      // Apply noise to user (Step 23)
      let noiseUpdate = null;
      const beaconQuery = await import('../db').then(m => m.db.query(
        'SELECT user_id FROM beacons WHERE id = $1',
        [id]
      ));
      
      if (beaconQuery.rows.length > 0 && passed.length > 0) {
        noiseUpdate = await applyNoise(beaconQuery.rows[0].user_id, passed.length);
      }

      return {
        beaconId: id,
        consumerTags,
        summary: {
          total: rows.length,
          passed: passed.length,
          shielded: shielded.length,
        },
        noiseUpdate,
        passed,
        shielded,
      };
    } catch (error: any) {
      return reply.code(error.statusCode || 500).send({ error: error.message });
    }
  });

  // POST /api/beacon/activate-test - Test endpoint with custom TTL
  app.post('/api/beacon/activate-test', async (req, reply) => {
    try {
      const { userId, lat, lng, vibeTags, ttlSeconds = 10 } = req.body as any;
      
      // Same as activate but with custom short TTL for testing
      const { db } = await import('../db');
      const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
      const result = await db.query(
        `INSERT INTO beacons (user_id, location, vibe_tags, status, expires_at)
         VALUES ($1, ST_Point($3, $2)::geography, $4, 'active', $5)
         RETURNING id`,
        [userId, lat, lng, JSON.stringify(vibeTags), expiresAt]
      );
      
      const beaconId = result.rows[0].id;
      
      // Set short expiry timer
      setTimeout(() => expireBeacon(beaconId), ttlSeconds * 1000);
      
      return { beaconId, expiresInSeconds: ttlSeconds };
    } catch (error: any) {
      return reply.code(error.statusCode || 500).send({ error: error.message });
    }
  });

  // GET /api/consumer/:userId/state - Get noise state (Step 22)
  app.get('/api/consumer/:userId/state', async (req, reply) => {
    try {
      const { userId } = req.params as any;
      const { simulateMinutes } = req.query as any;
      
      const state = getNoiseState(
        userId,
        simulateMinutes ? Number(simulateMinutes) : undefined
      );
      
      return state;
    } catch (error: any) {
      return reply.code(error.statusCode || 500).send({ error: error.message });
    }
  });

  // POST /api/consumer/:userId/reset - Reset noise (for testing)
  app.post('/api/consumer/:userId/reset', async (req, reply) => {
    try {
      const { userId } = req.params as any;
      resetNoise(userId);
      return { userId, message: 'Noise level reset to 0' };
    } catch (error: any) {
      return reply.code(error.statusCode || 500).send({ error: error.message });
    }
  });
}
