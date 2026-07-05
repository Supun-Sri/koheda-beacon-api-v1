import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

export const db = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://koheda:koheda123@localhost:5432/koheda',
});
