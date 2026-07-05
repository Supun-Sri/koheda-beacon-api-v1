import { FastifyInstance } from 'fastify';
import { db } from '../db';
import { jaccardSimilarity } from '../modules/beacon/beacon.vibe';
import { calculateSurge, efficiencyScore } from '../modules/auction/auction.engine';
import { placeBid, getAllOpenAuctions, getOpenAuction } from '../modules/orchestrator';

export async function auctionRoutes(app: FastifyInstance) {

  // GET /api/auctions/open - Get all currently open auctions (for restaurants)
  app.get('/api/auctions/open', async (req, reply) => {
    try {
      return { auctions: getAllOpenAuctions() };
    } catch (error: any) {
      return reply.code(500).send({ error: error.message });
    }
  });

  // GET /api/auction/:auctionId - Get details of a specific auction
  app.get('/api/auction/:auctionId', async (req, reply) => {
    try {
      const { auctionId } = req.params as any;
      
      // Check if it's still open
      const open = getOpenAuction(auctionId);
      if (open) {
        // Get current bids
        const bidsResult = await db.query(
          `SELECT b.restaurant_id, r.name as restaurant_name, b.bid_amount, b.efficiency_score, b.created_at
           FROM bids b
           JOIN restaurants r ON r.id = b.restaurant_id
           WHERE b.auction_round_id = $1
           ORDER BY b.efficiency_score DESC`,
          [auctionId]
        );

        return {
          auctionId,
          status: 'open',
          beaconId: open.beaconId,
          consumerTags: open.consumerTags,
          biddingEndsAt: open.biddingEndsAt.toISOString(),
          remainingMs: Math.max(0, open.biddingEndsAt.getTime() - Date.now()),
          eligibleCount: open.eligibleRestaurants.length,
          eligibleRestaurants: open.eligibleRestaurants,
          currentBids: bidsResult.rows.map((b: any) => ({
            restaurant_id: b.restaurant_id,
            restaurant: b.restaurant_name,
            bidAmount: Number(b.bid_amount),
            efficiencyScore: Number(b.efficiency_score),
          })),
        };
      }

      // Check DB for resolved auction
      const round = await db.query(
        `SELECT ar.*, r.name as winner_name
         FROM auction_rounds ar
         LEFT JOIN restaurants r ON r.id = ar.winner_id
         WHERE ar.id = $1`,
        [auctionId]
      );
      if (round.rows.length === 0) {
        return reply.code(404).send({ error: 'Auction not found' });
      }

      const bidsResult = await db.query(
        `SELECT b.*, r.name as restaurant_name
         FROM bids b
         JOIN restaurants r ON r.id = b.restaurant_id
         WHERE b.auction_round_id = $1
         ORDER BY b.efficiency_score DESC`,
        [auctionId]
      );

      return {
        auctionId,
        status: 'resolved',
        winner: round.rows[0].winner_name,
        winnerId: round.rows[0].winner_id,
        bids: bidsResult.rows.map((b: any, i: number) => ({
          rank: i + 1,
          restaurant: b.restaurant_name,
          bidAmount: Number(b.bid_amount),
          efficiencyScore: Number(b.efficiency_score),
          isWinner: b.is_winner,
        })),
      };
    } catch (error: any) {
      return reply.code(error.statusCode || 500).send({ error: error.message });
    }
  });

  // POST /api/auction/:auctionId/bid - Restaurant places a bid
  app.post('/api/auction/:auctionId/bid', async (req, reply) => {
    try {
      const { auctionId } = req.params as any;
      const { restaurantId, bidAmount } = req.body as any;

      if (!restaurantId || !bidAmount) {
        return reply.code(400).send({ error: 'Missing restaurantId or bidAmount' });
      }

      if (bidAmount < 300) {
        return reply.code(400).send({ error: 'Minimum bid is 300 LKR' });
      }

      if (bidAmount > 10000) {
        return reply.code(400).send({ error: 'Maximum bid is 10,000 LKR' });
      }

      const result = await placeBid(auctionId, restaurantId, Number(bidAmount));
      return result;
    } catch (error: any) {
      return reply.code(error.statusCode || 500).send({ error: error.message });
    }
  });

  // GET /api/restaurant/:restaurantId/auctions - Get open auctions relevant to a restaurant
  app.get('/api/restaurant/:restaurantId/auctions', async (req, reply) => {
    try {
      const { restaurantId } = req.params as any;
      const allOpen = getAllOpenAuctions();

      // Filter to auctions where this restaurant is eligible
      const relevant = allOpen.filter(a =>
        a.eligibleRestaurants.some((r: any) => r.restaurant_id === restaurantId)
      ).map(a => ({
        ...a,
        myMatch: a.eligibleRestaurants.find((r: any) => r.restaurant_id === restaurantId),
      }));

      return { auctions: relevant };
    } catch (error: any) {
      return reply.code(500).send({ error: error.message });
    }
  });

  // POST /api/auction/simulate - Keep existing simulate endpoint for testing
  app.post('/api/auction/simulate', async (req, reply) => {
    try {
      const { beaconId } = req.body as any;

      if (!beaconId) {
        return reply.code(400).send({ error: 'Missing beaconId' });
      }

      // 1. Get beacon
      const beacon = await db.query(
        `SELECT id, user_id, vibe_tags, location FROM beacons WHERE id = $1 AND status = 'active'`, 
        [beaconId]
      );
      
      if (beacon.rows.length === 0) {
        return reply.code(404).send({ error: 'No active beacon found' });
      }
      
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

      // 3. Calculate for each restaurant
      const bids: any[] = [];
      for (const r of restaurants.rows) {
        const vibe = jaccardSimilarity(consumerTags, r.tags);
        if (!vibe.passed) continue;
        const mu = vibe.score;
        if (mu < 0.10) continue;

        const surge = await calculateSurge(r.tags);
        const baseBid = 300 + Math.floor(Math.random() * 700);
        const effectiveBid = Math.round(baseBid * (0.5 + 0.5 * mu));
        const finalBid = Math.max(surge.bidFloor, effectiveBid);
        const eta = efficiencyScore(finalBid, Number(r.distance_km));

        bids.push({
          restaurant_id: r.id, restaurant: r.name,
          distance_km: Number(r.distance_km),
          matchRatio: mu, matchPercent: Math.round(vibe.score * 100) + '%',
          matchedTags: vibe.matchedTags,
          baseBid, surgeFactor: surge.avgSurge, bidFloor: surge.bidFloor,
          effectiveBid, finalBid, efficiencyScore: eta,
        });
      }

      bids.sort((a, b) => b.efficiencyScore - a.efficiencyScore);
      bids.forEach((bid, i) => { bid.rank = i + 1; bid.status = i === 0 ? 'WINNER' : 'OUTBID'; });

      const winner = bids.length > 0 ? bids[0] : null;
      if (winner) {
        await db.query(`INSERT INTO auction_rounds (beacon_id, winner_id) VALUES ($1, $2)`, [beaconId, winner.restaurant_id]);
        for (const tag of winner.matchedTags) {
          await db.query(`INSERT INTO auction_history (vibe_tag, winner_id, bid_amount) VALUES ($1, $2, $3)`, [tag, winner.restaurant_id, winner.finalBid]);
        }
      }

      return {
        beaconId, consumerTags,
        totalNearby: restaurants.rows.length, eligible: bids.length,
        bids,
        winner: winner ? {
          restaurant: winner.restaurant, distance_km: winner.distance_km,
          matchPercent: winner.matchPercent, matchedTags: winner.matchedTags,
          finalBid: winner.finalBid, efficiencyScore: winner.efficiencyScore,
          revenue: { bidFee: winner.finalBid + ' LKR', claimFee: '200 LKR (on redemption)' },
        } : null,
      };
    } catch (error: any) {
      return reply.code(error.statusCode || 500).send({ error: error.message });
    }
  });

  // POST /api/auction/surge - Test surge calculation
  app.post('/api/auction/surge', async (req, reply) => {
    try {
      const { tags } = req.body as any;
      if (!tags || !Array.isArray(tags)) {
        return reply.code(400).send({ error: 'Missing or invalid tags array' });
      }
      const surge = await calculateSurge(tags);
      return surge;
    } catch (error: any) {
      return reply.code(error.statusCode || 500).send({ error: error.message });
    }
  });
}
