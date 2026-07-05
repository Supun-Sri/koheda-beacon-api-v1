import { beaconBus, BEACON_EVENTS } from './beacon/beacon.events';
import { findNearbyRestaurants, calculateSpatialResults } from './beacon/beacon.spatial';
import { jaccardSimilarity } from './beacon/beacon.vibe';
import { applyNoise } from './beacon/beacon.noise';
import { efficiencyScore } from './auction/auction.engine';
import { db } from '../db';
import crypto from 'crypto';

// Bidding window: how long restaurants have to place bids (ms)
const BIDDING_WINDOW_MS = 60_000; // 30 seconds for testing

// Track open auctions
interface OpenAuction {
  auctionId: string;
  beaconId: string;
  userId: string;
  consumerTags: string[];
  eligibleRestaurants: any[];
  biddingEndsAt: Date;
  timer: NodeJS.Timeout;
}
const openAuctions = new Map<string, OpenAuction>();

/**
 * Orchestrator: Wires the full beacon → matches → auction → deal pipeline.
 * 
 * Flow:
 * 1. Consumer activates beacon
 * 2. System finds matching restaurants (spatial + vibe filter)
 * 3. Auction opens — eligible restaurants are notified
 * 4. Restaurants place real bids within the bidding window
 * 5. Bidding window closes — winner selected by efficiency score
 * 6. Deal auto-created from winner
 * 7. Consumer gets notified about the deal
 */
export function setupOrchestrator() {
  console.log(`Orchestrator: pipeline registered (bidding window: ${BIDDING_WINDOW_MS / 1000}s)`);

  beaconBus.on(BEACON_EVENTS.ACTIVATED, async (data) => {
    const { beaconId, userId, vibeTags } = data;
    console.log(`\n=== ORCHESTRATOR: Beacon ${beaconId} activated ===`);

    try {
      // ─── Step 1: Find matching restaurants ───
      await delay(1000);

      const rows = await findNearbyRestaurants(beaconId);
      if (rows.length === 0) {
        console.log('Orchestrator: No nearby restaurants found');
        beaconBus.emit(BEACON_EVENTS.MATCHES_FOUND, {
          beaconId, userId, passedCount: 0, shieldedCount: 0, passed: [], shielded: [],
        });
        return;
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
          jaccardScore: vibe.score,
          matchPercent: Math.round(vibe.score * 100) + '%',
          matchedTags: vibe.matchedTags,
          restaurantTags: r.restaurant_tags,
          rating: r.rating,
          status: vibe.passed && spatial.inRange ? 'PASSED' : 'VIBE_SHIELDED',
        };

        if (vibe.passed && spatial.inRange) passed.push(combined);
        else shielded.push(combined);
      }

      passed.sort((a, b) => b.jaccardScore - a.jaccardScore);

      // Apply noise
      let noiseUpdate = null;
      if (passed.length > 0) {
        noiseUpdate = await applyNoise(userId, passed.length);
      }

      // Emit matches found
      beaconBus.emit(BEACON_EVENTS.MATCHES_FOUND, {
        beaconId, userId, consumerTags,
        passedCount: passed.length, shieldedCount: shielded.length,
        noiseUpdate, passed, shielded,
      });

      console.log(`Orchestrator: ${passed.length} passed, ${shielded.length} shielded`);

      if (passed.length === 0) return;

      // ─── Step 2: Open auction ───
      await delay(500);

      const biddingEndsAt = new Date(Date.now() + BIDDING_WINDOW_MS);

      // Create auction round in DB
      const auctionResult = await db.query(
        `INSERT INTO auction_rounds (beacon_id) VALUES ($1) RETURNING id, round_number`,
        [beaconId]
      );
      const auctionId = auctionResult.rows[0].id;

      // Set timer to resolve auction after bidding window
      const timer = setTimeout(() => resolveAuction(auctionId), BIDDING_WINDOW_MS);

      // Track open auction
      const auction: OpenAuction = {
        auctionId, beaconId, userId, consumerTags,
        eligibleRestaurants: passed,
        biddingEndsAt, timer,
      };
      openAuctions.set(auctionId, auction);

      // Emit auction open — restaurants get notified
      beaconBus.emit(BEACON_EVENTS.AUCTION_OPEN, {
        auctionId, beaconId, userId, consumerTags,
        biddingEndsAt: biddingEndsAt.toISOString(),
        biddingWindowMs: BIDDING_WINDOW_MS,
        eligibleRestaurants: passed,
      });

      console.log(`Orchestrator: Auction ${auctionId} opened — ${passed.length} restaurants eligible, closes in ${BIDDING_WINDOW_MS / 1000}s`);

    } catch (error) {
      console.error('Orchestrator error:', error);
    }
  });
}

/**
 * Place a bid on an open auction (called from route handler)
 */
export async function placeBid(
  auctionId: string,
  restaurantId: string,
  bidAmount: number
): Promise<any> {
  const auction = openAuctions.get(auctionId);
  if (!auction) {
    throw { statusCode: 404, message: 'Auction not found or already closed' };
  }

  if (new Date() > auction.biddingEndsAt) {
    throw { statusCode: 400, message: 'Bidding window has closed' };
  }

  // Verify restaurant is eligible for this auction
  const eligible = auction.eligibleRestaurants.find(r => r.restaurant_id === restaurantId);
  if (!eligible) {
    throw { statusCode: 403, message: 'Restaurant is not eligible for this auction (vibe shielded or out of range)' };
  }

  // Calculate efficiency score
  const eta = efficiencyScore(bidAmount, eligible.distance_km);
  const matchRatio = eligible.jaccardScore;

  // Store bid in DB
  const result = await db.query(
    `INSERT INTO bids (auction_round_id, restaurant_id, bid_amount, match_ratio, efficiency_score)
     VALUES ($1, $2, $3, $4, $5) 
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [auctionId, restaurantId, bidAmount, matchRatio, eta]
  );

  const bidData = {
    auctionId,
    restaurantId,
    restaurantName: eligible.restaurant,
    bidAmount,
    matchPercent: eligible.matchPercent,
    distance_km: eligible.distance_km,
    efficiencyScore: eta,
    remainingMs: auction.biddingEndsAt.getTime() - Date.now(),
  };

  // Emit bid placed event
  beaconBus.emit(BEACON_EVENTS.BID_PLACED, bidData);

  return bidData;
}

/**
 * Resolve an auction after the bidding window closes
 */
async function resolveAuction(auctionId: string) {
  const auction = openAuctions.get(auctionId);
  if (!auction) return;

  console.log(`\n=== ORCHESTRATOR: Resolving auction ${auctionId} ===`);

  try {
    // Get all bids for this auction
    const bidsResult = await db.query(
      `SELECT b.*, r.name as restaurant_name
       FROM bids b
       JOIN restaurants r ON r.id = b.restaurant_id
       WHERE b.auction_round_id = $1
       ORDER BY b.efficiency_score DESC`,
      [auctionId]
    );

    const bids = bidsResult.rows;
    console.log(`Orchestrator: ${bids.length} bids received`);

    if (bids.length === 0) {
      // No bids — notify consumer
      beaconBus.emit(BEACON_EVENTS.AUCTION_RESOLVED, {
        auctionId,
        beaconId: auction.beaconId,
        userId: auction.userId,
        totalBids: 0,
        winner: null,
        results: [],
        message: 'No restaurants placed bids',
      });
      openAuctions.delete(auctionId);
      return;
    }

    // Rank bids
    const results = bids.map((b: any, i: number) => ({
      rank: i + 1,
      restaurant_id: b.restaurant_id,
      restaurant: b.restaurant_name,
      bidAmount: Number(b.bid_amount),
      matchRatio: Number(b.match_ratio),
      matchPercent: Math.round(Number(b.match_ratio) * 100) + '%',
      efficiencyScore: Number(b.efficiency_score),
      status: i === 0 ? 'WINNER' : 'OUTBID',
    }));

    const winner = results[0];

    // Update DB: mark winner
    await db.query(
      `UPDATE auction_rounds SET winner_id = $1 WHERE id = $2`,
      [winner.restaurant_id, auctionId]
    );
    await db.query(
      `UPDATE bids SET is_winner = true WHERE auction_round_id = $1 AND restaurant_id = $2`,
      [auctionId, winner.restaurant_id]
    );

    // Record in auction history for surge pricing
    const eligible = auction.eligibleRestaurants.find(
      (r: any) => r.restaurant_id === winner.restaurant_id
    );
    if (eligible) {
      for (const tag of eligible.matchedTags || []) {
        await db.query(
          `INSERT INTO auction_history (vibe_tag, winner_id, bid_amount) VALUES ($1, $2, $3)`,
          [tag, winner.restaurant_id, winner.bidAmount]
        );
      }
    }

    // Emit auction resolved
    beaconBus.emit(BEACON_EVENTS.AUCTION_RESOLVED, {
      auctionId,
      beaconId: auction.beaconId,
      userId: auction.userId,
      totalBids: bids.length,
      winner,
      results,
    });

    console.log(`Orchestrator: Winner = ${winner.restaurant} (${winner.bidAmount} LKR, η=${winner.efficiencyScore})`);

    // ─── Step 3: Auto-create deal from winner ───
    await delay(500);

    const dealTitle = generateDealTitle(eligible?.matchedTags || []);
    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);

    const dealResult = await db.query(
      `INSERT INTO deals (auction_id, restaurant_id, title, description, expires_at)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [
        auctionId,
        winner.restaurant_id,
        dealTitle,
        `Exclusive deal from ${winner.restaurant} — ${winner.matchPercent} vibe match`,
        expiresAt,
      ]
    );

    const deal = dealResult.rows[0];

    // Emit deal available
    beaconBus.emit(BEACON_EVENTS.DEAL_AVAILABLE, {
      beaconId: auction.beaconId,
      userId: auction.userId,
      deal: {
        id: deal.id,
        restaurant_id: winner.restaurant_id,
        restaurant: winner.restaurant,
        title: dealTitle,
        description: deal.description,
        distance_km: eligible?.distance_km || 0,
        matchPercent: winner.matchPercent,
        bidAmount: winner.bidAmount,
        efficiencyScore: winner.efficiencyScore,
        claimsRemaining: deal.total_claims,
        expiresAt: deal.expires_at,
      },
    });

    console.log(`=== ORCHESTRATOR: Pipeline complete — deal "${dealTitle}" created ===\n`);

  } catch (error) {
    console.error('Orchestrator resolve error:', error);
  } finally {
    openAuctions.delete(auctionId);
  }
}

/**
 * Get info about an open auction
 */
export function getOpenAuction(auctionId: string): OpenAuction | undefined {
  return openAuctions.get(auctionId);
}

/**
 * Get all currently open auctions
 */
export function getAllOpenAuctions(): any[] {
  return Array.from(openAuctions.values()).map(a => ({
    auctionId: a.auctionId,
    beaconId: a.beaconId,
    consumerTags: a.consumerTags,
    biddingEndsAt: a.biddingEndsAt.toISOString(),
    remainingMs: Math.max(0, a.biddingEndsAt.getTime() - Date.now()),
    eligibleCount: a.eligibleRestaurants.length,
    eligibleRestaurants: a.eligibleRestaurants,
  }));
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function generateDealTitle(matchedTags: string[]): string {
  const templates: Record<string, string[]> = {
    'cocktails': ['30% off signature cocktails', 'Happy Hour extended!', 'Buy 2 Get 1 on cocktails'],
    'rooftop': ['Rooftop special: 25% off', 'Sunset hour deal', 'Sky-high savings: 20% off'],
    'dj': ['Free cover charge + drink', 'DJ night: 2-for-1 drinks', 'Party starter pack'],
    'live music': ['Live music night: 20% off', 'Dinner & show combo', 'Music lovers special'],
    'fine dining': ["Chef's tasting menu: 30% off", 'Prix fixe dinner deal', 'Fine dining experience'],
    'late night': ['Late night bites: 25% off', 'After hours special', 'Night owl deal'],
    'cafe': ['Coffee & cake combo', 'Afternoon tea special', 'Brunch deal: 20% off'],
    'beach': ['Beach vibes: 30% off', 'Seaside dining deal', 'Ocean view special'],
    'date night': ['Couples combo: 25% off', 'Romantic dinner deal', 'Date night special'],
    'byob': ['BYOB night: no corkage fee', 'Bring your own & save', 'Free corkage + appetizer'],
    'family': ['Family meal deal: 20% off', 'Kids eat free', 'Family platter special'],
    'mic night': ['Open mic: free entry + drink', 'Stage night special', 'Mic night deal'],
  };

  for (const tag of matchedTags) {
    const options = templates[tag];
    if (options) return options[Math.floor(Math.random() * options.length)];
  }
  return '20% off your bill — exclusive Kohedha deal';
}
