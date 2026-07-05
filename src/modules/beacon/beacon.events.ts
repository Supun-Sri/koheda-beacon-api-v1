import { EventEmitter } from 'events';

export const beaconBus = new EventEmitter();
beaconBus.setMaxListeners(30);

// Event types
export const BEACON_EVENTS = {
  ACTIVATED: 'beacon:activated',
  EXPIRED: 'beacon:expired',
  CANCELLED: 'beacon:cancelled',
  COUNTDOWN: 'beacon:countdown',
  MATCHES_FOUND: 'beacon:matches_found',
  AUCTION_OPEN: 'auction:open',
  BID_PLACED: 'auction:bid_placed',
  AUCTION_RESOLVED: 'auction:resolved',
  DEAL_AVAILABLE: 'deal:available',
} as const;
