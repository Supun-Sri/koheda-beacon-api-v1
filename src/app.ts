import Fastify from 'fastify';
import cors from '@fastify/cors';
import { db } from './db';
import { restaurantRoutes } from './routes/restaurant.routes';
import { beaconRoutes } from './routes/beacon.routes';
import { auctionRoutes } from './routes/auction.routes';
import { dealRoutes } from './routes/deal.routes';
import { setupWebSocket } from './ws/socket';
import { setupOrchestrator } from './modules/orchestrator';

const app = Fastify({ logger: true });

app.register(cors);

app.get('/health', async () => {
  const dbCheck = await db.query('SELECT 1').then(() => 'connected').catch(() => 'error');
  return { status: 'ok', postgres: dbCheck, uptime: process.uptime() };
});

// Register routes
app.register(restaurantRoutes);
app.register(beaconRoutes);
app.register(auctionRoutes);
app.register(dealRoutes);

app.listen({ port: 3000, host: '0.0.0.0' }, (err) => {
  if (err) throw err;
  setupWebSocket(app.server);
  setupOrchestrator();
  console.log('Server + WebSocket + Orchestrator running on http://localhost:3000');
});

export default app;
