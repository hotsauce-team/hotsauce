// Database connection and type exports
// Shared by both the public site and CMS admin
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { schema } from './schema.ts';

// Create database connection
const dataDir = Deno.env.get('PGLITE_DATA_DIR') ?? './data';
const client = new PGlite(dataDir);
export const db = drizzle(client, { schema });

// Export the database type for use in other modules
export type Database = typeof db;
