import { db } from '../../db';

export interface NoiseState {
  level: number;
  state: 'active' | 'muted' | 'claimed';
  updatedAt: number;
}

// Constants from the specification
const LAMBDA = 0.08;           // Decay rate per hour
const DELTA_HIT = 0.15;        // Noise increase per match
const MUTE_THRESHOLD = 1.0;    // Level at which user is muted
const RECOVERY_THRESHOLD = 0.30; // Level at which user becomes active again

// In-memory cache for noise state
const cache = new Map<string, NoiseState>();

/**
 * Calculate decayed noise level based on time elapsed
 * Formula: η_c(t) = η_c(t-1) · e^(-λΔt)
 */
function getDecayedNoise(state: NoiseState): number {
  const hours = (Date.now() - state.updatedAt) / 3_600_000;
  return state.level * Math.exp(-LAMBDA * hours);
}

/**
 * Apply noise to a user based on match count
 * Formula: η_c(t) = η_c(t-1) · e^(-λΔt) + Δ_hit · matchCount
 */
export async function applyNoise(userId: string, matchCount: number): Promise<NoiseState> {
  // Get existing state or initialize
  let state = cache.get(userId) ?? {
    level: 0,
    state: 'active' as const,
    updatedAt: Date.now()
  };

  // Apply exponential decay + noise spike
  const decayed = getDecayedNoise(state);
  let newLevel = decayed + DELTA_HIT * matchCount;
  
  // Determine new state based on thresholds
  let newState: NoiseState['state'] =
    newLevel >= MUTE_THRESHOLD ? 'muted' :
    newLevel < RECOVERY_THRESHOLD ? 'active' :
    state.state; // Stay in current state if in hysteresis zone

  const updated: NoiseState = {
    level: Math.round(newLevel * 1000) / 1000,
    state: newState,
    updatedAt: Date.now()
  };

  cache.set(userId, updated);

  // Persist to DB (fire-and-forget, async)
  db.query(
    `UPDATE users SET noise_level = $1, noise_state = $2, noise_updated = NOW() 
     WHERE id = $3`,
    [updated.level, updated.state, userId]
  ).catch(() => {}); // Ignore errors if users table doesn't exist yet

  return updated;
}

/**
 * Get current noise state for a user with optional time simulation
 */
export function getNoiseState(
  userId: string,
  simulateMinutes?: number
): {
  state: string;
  noiseLevel: number;
  canReceive: boolean;
  lastUpdated?: string;
} {
  let state = cache.get(userId) ?? {
    level: 0,
    state: 'active' as const,
    updatedAt: Date.now()
  };

  // For testing: simulate time passage
  let adjustedUpdatedAt = state.updatedAt;
  if (simulateMinutes) {
    adjustedUpdatedAt = state.updatedAt - simulateMinutes * 60_000;
  }

  const tempState = { ...state, updatedAt: adjustedUpdatedAt };
  const decayed = getDecayedNoise(tempState);
  
  // Recalculate state based on decayed level
  const currentState =
    decayed >= MUTE_THRESHOLD ? 'muted' :
    decayed < RECOVERY_THRESHOLD ? 'active' :
    state.state;

  return {
    state: currentState,
    noiseLevel: Math.round(decayed * 1000) / 1000,
    canReceive: decayed < RECOVERY_THRESHOLD && currentState === 'active',
    lastUpdated: new Date(state.updatedAt).toISOString(),
  };
}

/**
 * Reset noise level for a user (for testing or after claim)
 */
export function resetNoise(userId: string): void {
  cache.set(userId, {
    level: 0,
    state: 'active',
    updatedAt: Date.now()
  });
}

/**
 * Load noise state from database on server start (optional)
 */
export async function loadNoiseFromDB(userId: string): Promise<void> {
  try {
    const result = await db.query(
      `SELECT noise_level, noise_state, noise_updated 
       FROM users WHERE id = $1`,
      [userId]
    );
    
    if (result.rows.length > 0) {
      const row = result.rows[0];
      cache.set(userId, {
        level: row.noise_level || 0,
        state: row.noise_state || 'active',
        updatedAt: new Date(row.noise_updated || Date.now()).getTime()
      });
    }
  } catch (error) {
    // Ignore if users table doesn't exist yet
  }
}
