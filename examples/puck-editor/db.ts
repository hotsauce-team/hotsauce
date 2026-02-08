// Database connection
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { schema } from './schema.ts';

// Create database connection
const client = new PGlite('./data');
export const db = drizzle(client, { schema });

// Export the database type for use in other modules
export type Database = typeof db;
