import { db } from '../db';
import fs from 'fs';
import path from 'path';

async function migrate() {
  // Create migrations tracking table if it doesn't exist
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      executed_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  const migrationsDir = path.join(__dirname, '../../migrations');
  
  if (!fs.existsSync(migrationsDir)) {
    console.log('No migrations directory found');
    process.exit(0);
  }

  const files = fs.readdirSync(migrationsDir).sort();
  
  for (const file of files) {
    if (!file.endsWith('.sql')) continue;
    
    // Check if migration already executed
    const check = await db.query(
      'SELECT filename FROM schema_migrations WHERE filename = $1',
      [file]
    );
    
    if (check.rows.length > 0) {
      console.log(`Skipping: ${file} (already executed)`);
      continue;
    }
    
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    console.log(`Running: ${file}`);
    
    try {
      await db.query(sql);
      // Mark migration as executed
      await db.query(
        'INSERT INTO schema_migrations (filename) VALUES ($1)',
        [file]
      );
      console.log(`✓ Completed: ${file}`);
    } catch (error: any) {
      console.error(`✗ Failed: ${file}`);
      throw error;
    }
  }
  
  console.log('All migrations complete');
  process.exit(0);
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
