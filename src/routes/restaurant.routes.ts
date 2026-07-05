import { FastifyInstance } from 'fastify';
import { db } from '../db';

export async function restaurantRoutes(app: FastifyInstance) {

  // GET /api/restaurants?lat=6.9147&lng=79.8536&radiusKm=5
  app.get('/api/restaurants', async (req) => {
    const { lat, lng, radiusKm = 10 } = req.query as any;

    if (!lat || !lng) {
      // Return all restaurants if no location specified
      const all = await db.query(`
        SELECT r.id, r.name, r.rating, r.open_until,
               array_agg(v.name) as tags
        FROM restaurants r
        LEFT JOIN restaurant_vibe_tags rvt ON r.id = rvt.restaurant_id
        LEFT JOIN vibe_tags v ON v.id = rvt.vibe_tag_id
        GROUP BY r.id 
        ORDER BY r.name
      `);
      return { count: all.rows.length, restaurants: all.rows };
    }

    // Spatial query: find restaurants within radius
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
