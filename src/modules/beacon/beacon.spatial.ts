import { db } from '../../db';

export interface NearbyRestaurant {
  restaurant_id: string;
  name: string;
  rating: string;
  distance_km: number;
  restaurant_tags: string[];
  tag_radii: number[];
  consumer_tags: any;
}

export interface SpatialResult {
  restaurant: string;
  restaurant_id: string;
  distance_km: number;
  signalStrength: number;
  matchedViaTag: string | null;
  radiusUsed: number | null;
  inRange: boolean;
}

/**
 * Find all restaurants near a beacon within 18km max radius
 */
export async function findNearbyRestaurants(beaconId: string): Promise<NearbyRestaurant[]> {
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
    WHERE b.id = $1 AND b.status = 'active'
    GROUP BY r.id, r.name, r.rating, r.location, b.location, b.vibe_tags
    ORDER BY distance_km
  `, [beaconId]);

  return result.rows;
}

/**
 * Calculate Ψ (psi) signal strength
 * Formula: ψ = 1 - (distance / radius)
 * Returns 0 if outside radius
 */
export function calculatePsi(distanceKm: number, radiusKm: number): number {
  if (distanceKm > radiusKm) return 0;
  return Math.round((1 - distanceKm / radiusKm) * 1000) / 1000; // 3 decimal places
}

/**
 * Calculate spatial results with Ψ signal strength for all restaurants
 */
export function calculateSpatialResults(
  restaurants: NearbyRestaurant[],
  consumerTags: string[]
): SpatialResult[] {
  return restaurants.map(r => {
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
