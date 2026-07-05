import { db } from './db';

async function main() {
  try {
    const res = await db.query('SELECT NOW() as time');
    console.log('DB connected:', res.rows[0].time);
    process.exit(0);
  } catch (err) {
    console.error('DB connection failed:', err);
    process.exit(1);
  }
}

main();
