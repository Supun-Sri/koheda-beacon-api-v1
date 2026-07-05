import { db } from '../../db';
import { beaconBus, BEACON_EVENTS } from './beacon.events';
import { BeaconActivationResponse } from './beacon.types';

const BEACON_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
const expiryTimers = new Map<string, NodeJS.Timeout>();
const countdownIntervals = new Map<string, NodeJS.Timeout>();

export async function activateBeacon(
  userId: string,
  lat: number,
  lng: number,
  vibeTags: string[]
): Promise<BeaconActivationResponse> {
  // Validate vibe tags
  if (!vibeTags || vibeTags.length === 0) {
    throw { statusCode: 400, message: 'Select at least 1 vibe tag' };
  }

  // One-beacon-per-user guard
  const existing = await db.query(
    `SELECT id FROM beacons 
     WHERE user_id = $1 AND status = 'active' AND expires_at > NOW()`,
    [userId]
  );
  
  if (existing.rows.length > 0) {
    throw { statusCode: 400, message: 'User already has an active beacon' };
  }

  // Insert beacon into database
  const expiresAt = new Date(Date.now() + BEACON_TTL_MS);
  const result = await db.query(
    `INSERT INTO beacons (user_id, location, vibe_tags, status, expires_at)
     VALUES ($1, ST_Point($3, $2)::geography, $4, 'active', $5)
     RETURNING id, status, created_at, expires_at`,
    [userId, lat, lng, JSON.stringify(vibeTags), expiresAt]
  );

  const beacon = result.rows[0];
  const remainingMs = expiresAt.getTime() - Date.now();

  // Set auto-expiry timer
  expiryTimers.set(beacon.id, setTimeout(() => expireBeacon(beacon.id), BEACON_TTL_MS));

  // Emit countdown every 30 seconds
  const countdownInterval = setInterval(() => {
    const remaining = expiresAt.getTime() - Date.now();
    if (remaining <= 0) {
      clearInterval(countdownInterval);
      countdownIntervals.delete(beacon.id);
      return;
    }
    beaconBus.emit(BEACON_EVENTS.COUNTDOWN, {
      beaconId: beacon.id,
      remainingMs: remaining,
      display: formatRemaining(remaining),
    });
  }, 30_000);
  
  countdownIntervals.set(beacon.id, countdownInterval);

  // Emit activation event
  beaconBus.emit(BEACON_EVENTS.ACTIVATED, {
    beaconId: beacon.id,
    userId,
    lat,
    lng,
    vibeTags,
  });

  return {
    beaconId: beacon.id,
    status: beacon.status,
    vibeTags,
    expiresAt: beacon.expires_at,
    remainingMs,
    remainingDisplay: formatRemaining(remainingMs),
  };
}

export async function expireBeacon(beaconId: string): Promise<void> {
  await db.query(`UPDATE beacons SET status = 'expired' WHERE id = $1`, [beaconId]);
  
  const timer = expiryTimers.get(beaconId);
  if (timer) {
    clearTimeout(timer);
    expiryTimers.delete(beaconId);
  }
  
  const countdown = countdownIntervals.get(beaconId);
  if (countdown) {
    clearInterval(countdown);
    countdownIntervals.delete(beaconId);
  }
  
  beaconBus.emit(BEACON_EVENTS.EXPIRED, { beaconId });
}

export async function cancelBeacon(beaconId: string, userId: string): Promise<{ beaconId: string; status: string }> {
  const result = await db.query(
    `UPDATE beacons SET status = 'cancelled'
     WHERE id = $1 AND user_id = $2 AND status = 'active'
     RETURNING id, status`,
    [beaconId, userId]
  );
  
  if (result.rows.length === 0) {
    throw { statusCode: 404, message: 'Beacon not found or already inactive' };
  }

  const timer = expiryTimers.get(beaconId);
  if (timer) {
    clearTimeout(timer);
    expiryTimers.delete(beaconId);
  }

  const countdown = countdownIntervals.get(beaconId);
  if (countdown) {
    clearInterval(countdown);
    countdownIntervals.delete(beaconId);
  }

  beaconBus.emit(BEACON_EVENTS.CANCELLED, { beaconId });
  
  return { beaconId, status: 'cancelled' };
}

export async function getBeaconStatus(beaconId: string) {
  const result = await db.query(
    `SELECT id, user_id, status, vibe_tags, created_at, expires_at 
     FROM beacons WHERE id = $1`,
    [beaconId]
  );
  
  if (result.rows.length === 0) {
    throw { statusCode: 404, message: 'Beacon not found' };
  }

  const beacon = result.rows[0];
  const remainingMs = Math.max(0, new Date(beacon.expires_at).getTime() - Date.now());
  
  return {
    ...beacon,
    vibe_tags: beacon.vibe_tags,
    remainingMs,
    remainingDisplay: formatRemaining(remainingMs),
  };
}

export async function getUserActiveBeacon(userId: string) {
  const result = await db.query(
    `SELECT id, status, vibe_tags, expires_at 
     FROM beacons
     WHERE user_id = $1 AND status = 'active' AND expires_at > NOW()
     LIMIT 1`,
    [userId]
  );
  
  if (result.rows.length === 0) {
    return { active: false };
  }
  
  const beacon = result.rows[0];
  const remainingMs = Math.max(0, new Date(beacon.expires_at).getTime() - Date.now());
  
  return {
    active: true,
    beacon: {
      ...beacon,
      vibe_tags: beacon.vibe_tags,
      remainingMs,
      remainingDisplay: formatRemaining(remainingMs),
    },
  };
}

function formatRemaining(ms: number): string {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `${h}H ${String(m).padStart(2, '0')}M`;
}
