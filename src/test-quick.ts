import { Client } from 'pg';

async function test() {
  // Test 1: Connect with explicit params to 127.0.0.1
  console.log('Test 1: Connecting to 127.0.0.1 with explicit params...');
  const c1 = new Client({
    host: '127.0.0.1',
    port: 5432,
    database: 'koheda',
    user: 'koheda',
    password: 'koheda123',
  });
  try {
    await c1.connect();
    const r = await c1.query('SELECT NOW() as t');
    console.log('  ✅ SUCCESS:', r.rows[0].t);
    await c1.end();
  } catch (e: any) {
    console.error('  ❌ FAILED:', e.message);
    try { await c1.end(); } catch {}
  }

  // Test 2: Connect with connection string
  console.log('\nTest 2: Connecting with connection string...');
  const c2 = new Client({
    connectionString: 'postgresql://koheda:koheda123@localhost:5432/koheda',
  });
  try {
    await c2.connect();
    const r = await c2.query('SELECT NOW() as t');
    console.log('  ✅ SUCCESS:', r.rows[0].t);
    await c2.end();
  } catch (e: any) {
    console.error('  ❌ FAILED:', e.message);
    try { await c2.end(); } catch {}
  }

  // Test 3: Connect to 'localhost' host explicitly
  console.log('\nTest 3: Connecting to localhost with explicit params...');
  const c3 = new Client({
    host: 'localhost',
    port: 5432,
    database: 'koheda',
    user: 'koheda',
    password: 'koheda123',
  });
  try {
    await c3.connect();
    const r = await c3.query('SELECT NOW() as t');
    console.log('  ✅ SUCCESS:', r.rows[0].t);
    await c3.end();
  } catch (e: any) {
    console.error('  ❌ FAILED:', e.message);
    try { await c3.end(); } catch {}
  }

  process.exit(0);
}

test();
