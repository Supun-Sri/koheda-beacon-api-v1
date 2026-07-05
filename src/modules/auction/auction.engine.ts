import { db } from '../../db';
import { jaccardSimilarity } from '../beacon/beacon.vibe';

const MU_MIN = 0.10; // minimum match ratio to bid
const LAMBDA_DISTANCE = 0.08; // distance decay factor
const BASE_MIN_BID = 300; // LKR

/**
 * Step 26: Calculate Pond Density (μ)
 * 
 * μ = ρ_rel / ρ_eff
 * where:
 * - ρ_eff = total active beacons near restaurant
 * - ρ_rel = beacons with Jaccard ≥ 0.3 match
 */
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
  return { 
    mu: Math.round(mu * 1000) / 1000, 
    relevant: relevantCount, 
    total: totalActive, 
    eligible: mu >= MU_MIN 
  };
}

/**
 * Step 27: Calculate Surge Factor (σ)
 * 
 * σ_tag = 1 + 0.8 × (wins_tag / max_wins)
 * Based on 30-day auction history
 */
export async function calculateSurge(restaurantTags: string[]): Promise<{
  avgSurge: number; 
  bidFloor: number; 
  perTag: Record<string, number>;
}> {
  const wins = await db.query(`
    SELECT vibe_tag, COUNT(*) as wins
    FROM auction_history
    WHERE created_at >= NOW() - INTERVAL '30 days'
    GROUP BY vibe_tag
  `);

  const winMap: Record<string, number> = {};
  for (const row of wins.rows) {
    winMap[row.vibe_tag] = Number(row.wins);
  }

  const maxWins = Math.max(1, ...Object.values(winMap), 0);
  const perTag: Record<string, number> = {};
  let totalSurge = 0;

  for (const tag of restaurantTags) {
    const tagWins = winMap[tag] || 0;
    const surge = 1 + 0.8 * (tagWins / maxWins);
    perTag[tag] = Math.round(surge * 100) / 100;
    totalSurge += surge;
  }

  const avgSurge = Math.round((totalSurge / restaurantTags.length) * 100) / 100;
  const bidFloor = Math.round(BASE_MIN_BID * avgSurge);

  return { avgSurge, bidFloor, perTag };
}

/**
 * Step 28: Calculate Efficiency Score (η_j)
 * 
 * η_j = B_j · e^(-λ · d̄_j)
 * where:
 * - B_j = bid amount
 * - λ = 0.08 (distance decay)
 * - d̄_j = average distance in km
 */
export function efficiencyScore(bidAmount: number, avgDistanceKm: number): number {
  return Math.round(bidAmount * Math.exp(-LAMBDA_DISTANCE * avgDistanceKm) * 100) / 100;
}

/**
 * Run a full auction for a beacon
 * Finds matching restaurants, runs bidding, selects winner, records results
 */
export async function runAuction(beaconId: string) {
  // 1. Get beacon
  const beacon = await db.query(
    `SELECT id, user_id, vibe_tags, location FROM beacons WHERE id = $1 AND status = 'active'`,
    [beaconId]
  );
  if (beacon.rows.length === 0) return null;

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

  // 3. Calculate bids for each eligible restaurant
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
  bids.forEach((bid, i) => {
    bid.rank = i + 1;
    bid.status = i === 0 ? 'WINNER' : 'OUTBID';
  });

  const winner = bids.length > 0 ? bids[0] : null;

  // 5. Record auction round in DB
  let auctionRoundId: string | null = null;
  if (winner) {
    const round = await db.query(
      `INSERT INTO auction_rounds (beacon_id, winner_id) VALUES ($1, $2) RETURNING id`,
      [beaconId, winner.restaurant_id]
    );
    auctionRoundId = round.rows[0].id;

    for (const tag of winner.matchedTags) {
      await db.query(
        `INSERT INTO auction_history (vibe_tag, winner_id, bid_amount) VALUES ($1, $2, $3)`,
        [tag, winner.restaurant_id, winner.finalBid]
      );
    }
  }

  return {
    beaconId,
    userId: b.user_id,
    consumerTags,
    totalNearby: restaurants.rows.length,
    eligible: bids.length,
    bids,
    auctionRoundId,
    winner: winner ? {
      restaurant_id: winner.restaurant_id,
      restaurant: winner.restaurant,
      distance_km: winner.distance_km,
      matchPercent: winner.matchPercent,
      matchedTags: winner.matchedTags,
      finalBid: winner.finalBid,
      efficiencyScore: winner.efficiencyScore,
    } : null,
  };
}
