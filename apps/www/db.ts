// SQLite database setup

import { drizzle } from '@hotsauce/drizzle-runtime-sqlite';
import * as schema from './schema.ts';

const dbPath = Deno.env.get('DATABASE_URL') ?? './data/www.db';

// Ensure data directory exists
try {
  Deno.mkdirSync('./data', { recursive: true });
} catch {
  // Directory might already exist
}

export const db = drizzle(dbPath, { schema });
