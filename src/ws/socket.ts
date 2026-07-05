import { Server } from 'socket.io';
import { beaconBus, BEACON_EVENTS } from '../modules/beacon/beacon.events';

let ioInstance: Server | null = null;

export function getIO(): Server | null {
  return ioInstance;
}

export function setupWebSocket(httpServer: any) {
  const io = new Server(httpServer, {
    cors: { origin: '*' },
    path: '/socket.io/'
  });

  ioInstance = io;

  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    // Consumer joins their user room to receive personal events
    socket.on('join:user', (userId: string) => {
      socket.join(`user:${userId}`);
      console.log(`${socket.id} joined user:${userId}`);
    });

    // Restaurant joins their restaurant room
    socket.on('join:restaurant', (restaurantId: string) => {
      socket.join(`restaurant:${restaurantId}`);
      // Also join a global room so all restaurants get beacon notifications
      socket.join('restaurants:all');
      console.log(`${socket.id} joined restaurant:${restaurantId}`);
    });

    // Join specific beacon room
    socket.on('join:beacon', (beaconId: string) => {
      socket.join(`beacon:${beaconId}`);
      console.log(`${socket.id} joined beacon:${beaconId}`);
    });

    // Join specific auction room
    socket.on('join:auction', (auctionId: string) => {
      socket.join(`auction:${auctionId}`);
      console.log(`${socket.id} joined auction:${auctionId}`);
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
  });

  // ── Beacon lifecycle events ──
  beaconBus.on(BEACON_EVENTS.ACTIVATED, (data) => {
    io.to(`user:${data.userId}`).emit('beacon:activated', data);
    io.to(`beacon:${data.beaconId}`).emit('beacon:activated', data);
    console.log('WS → beacon:activated', data.beaconId);
  });

  beaconBus.on(BEACON_EVENTS.EXPIRED, (data) => {
    io.to(`beacon:${data.beaconId}`).emit('beacon:expired', data);
  });

  beaconBus.on(BEACON_EVENTS.CANCELLED, (data) => {
    io.to(`beacon:${data.beaconId}`).emit('beacon:cancelled', data);
  });

  beaconBus.on(BEACON_EVENTS.COUNTDOWN, (data) => {
    io.to(`beacon:${data.beaconId}`).emit('beacon:countdown', data);
  });

  // ── Match results ──
  beaconBus.on(BEACON_EVENTS.MATCHES_FOUND, (data) => {
    io.to(`user:${data.userId}`).emit('beacon:matches_found', data);
    io.to(`beacon:${data.beaconId}`).emit('beacon:matches_found', data);
    console.log(`WS → matches_found: ${data.passedCount} passed, ${data.shieldedCount} shielded`);
  });

  // ── Auction events ──
  beaconBus.on(BEACON_EVENTS.AUCTION_OPEN, (data) => {
    // Notify each eligible restaurant individually
    if (data.eligibleRestaurants) {
      for (const r of data.eligibleRestaurants) {
        io.to(`restaurant:${r.restaurant_id}`).emit('auction:open', {
          auctionId: data.auctionId,
          beaconId: data.beaconId,
          consumerTags: data.consumerTags,
          biddingEndsAt: data.biddingEndsAt,
          restaurant: r, // their specific match info
        });
      }
    }
    // Also broadcast to the global restaurants room
    io.to('restaurants:all').emit('auction:open', data);
    console.log(`WS → auction:open ${data.auctionId} (${data.eligibleRestaurants?.length || 0} eligible)`);
  });

  beaconBus.on(BEACON_EVENTS.BID_PLACED, (data) => {
    io.to(`auction:${data.auctionId}`).emit('auction:bid_placed', data);
    // Also notify the bidding restaurant
    io.to(`restaurant:${data.restaurantId}`).emit('auction:bid_placed', data);
    console.log(`WS → bid_placed: ${data.restaurantName} bid ${data.bidAmount} LKR`);
  });

  beaconBus.on(BEACON_EVENTS.AUCTION_RESOLVED, (data) => {
    io.to(`auction:${data.auctionId}`).emit('auction:resolved', data);
    io.to(`user:${data.userId}`).emit('auction:resolved', data);
    // Notify each restaurant about result
    if (data.results) {
      for (const r of data.results) {
        io.to(`restaurant:${r.restaurant_id}`).emit('auction:resolved', {
          auctionId: data.auctionId,
          yourResult: r,
          winner: data.winner,
        });
      }
    }
    console.log(`WS → auction:resolved winner=${data.winner?.restaurant || 'none'}`);
  });

  // ── Deal events ──
  beaconBus.on(BEACON_EVENTS.DEAL_AVAILABLE, (data) => {
    io.to(`user:${data.userId}`).emit('deal:available', data);
    io.to(`beacon:${data.beaconId}`).emit('deal:available', data);
    io.to(`restaurant:${data.deal.restaurant_id}`).emit('deal:available', data);
    console.log(`WS → deal:available: ${data.deal.title} at ${data.deal.restaurant}`);
  });

  return io;
}
