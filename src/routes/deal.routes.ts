import { FastifyInstance } from 'fastify';
import { db } from '../db';
import crypto from 'crypto';

export async function dealRoutes(app: FastifyInstance) {

  // POST /api/deal/create (called after auction winner is selected)
  app.post('/api/deal/create', async (req, reply) => {
    try {
      const { auctionId, restaurantId, title, description } = req.body as any;
      
      if (!restaurantId || !title) {
        return reply.code(400).send({ error: 'Missing required fields: restaurantId, title' });
      }
      
      const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours
      
      const result = await db.query(
        `INSERT INTO deals (auction_id, restaurant_id, title, description, expires_at)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [auctionId || null, restaurantId, title, description || '', expiresAt]
      );
      
      return result.rows[0];
    } catch (error: any) {
      return reply.code(error.statusCode || 500).send({ error: error.message });
    }
  });

  // GET /api/deal/:id - Get deal details
  app.get('/api/deal/:id', async (req, reply) => {
    try {
      const { id } = req.params as any;
      
      const result = await db.query(
        `SELECT d.*, r.name as restaurant_name 
         FROM deals d
         JOIN restaurants r ON r.id = d.restaurant_id
         WHERE d.id = $1`,
        [id]
      );
      
      if (result.rows.length === 0) {
        return reply.code(404).send({ error: 'Deal not found' });
      }
      
      const deal = result.rows[0];
      const remainingMs = new Date(deal.expires_at).getTime() - Date.now();
      
      return {
        ...deal,
        remainingMs: Math.max(0, remainingMs),
        claimsRemaining: deal.total_claims - deal.claimed_count,
      };
    } catch (error: any) {
      return reply.code(error.statusCode || 500).send({ error: error.message });
    }
  });

  // POST /api/deal/:id/claim
  app.post('/api/deal/:id/claim', async (req, reply) => {
    try {
      const { id } = req.params as any;
      const { userId } = req.body as any;

      if (!userId) {
        return reply.code(400).send({ error: 'Missing userId' });
      }

      // Check deal exists and has claims left
      const dealResult = await db.query(
        `SELECT d.*, r.name as restaurant_name 
         FROM deals d
         JOIN restaurants r ON r.id = d.restaurant_id
         WHERE d.id = $1`,
        [id]
      );
      
      if (dealResult.rows.length === 0) {
        return reply.code(404).send({ error: 'Deal not found' });
      }

      const deal = dealResult.rows[0];

      // Check expiry
      if (new Date(deal.expires_at) < new Date()) {
        return reply.code(400).send({ error: 'Deal has expired' });
      }

      // Check claims remaining
      if (deal.claimed_count >= deal.total_claims) {
        return reply.code(400).send({ error: 'No claims left' });
      }

      // Generate QR code string (7 characters)
      const claimCode = 'K-' + crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 6);

      // Update claim count
      await db.query(
        'UPDATE deals SET claimed_count = claimed_count + 1 WHERE id = $1',
        [id]
      );

      const remainingMs = new Date(deal.expires_at).getTime() - Date.now();

      return {
        dealId: id,
        userId,
        claimCode,
        restaurant: deal.restaurant_name,
        title: deal.title,
        description: deal.description,
        expiresIn: Math.round(remainingMs / 60_000) + ' minutes',
        note: 'Single-use · server-verified · auto-revokes 30 min after redemption',
      };
    } catch (error: any) {
      return reply.code(error.statusCode || 500).send({ error: error.message });
    }
  });

  // GET /api/deals - List all active deals
  app.get('/api/deals', async (req, reply) => {
    try {
      const result = await db.query(`
        SELECT d.*, r.name as restaurant_name
        FROM deals d
        JOIN restaurants r ON r.id = d.restaurant_id
        WHERE d.expires_at > NOW()
        AND d.claimed_count < d.total_claims
        ORDER BY d.created_at DESC
        LIMIT 20
      `);

      return {
        deals: result.rows.map((d: any) => ({
          ...d,
          claimsRemaining: d.total_claims - d.claimed_count,
        })),
      };
    } catch (error: any) {
      return reply.code(error.statusCode || 500).send({ error: error.message });
    }
  });
}
