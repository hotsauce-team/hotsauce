// Re-export Zod schema generation from drizzle-zod
// drizzle-zod handles all edge cases for Drizzle table types

export { createInsertSchema, createSelectSchema } from 'drizzle-zod';
