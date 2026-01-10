// Re-export Zod schema generation from drizzle-zod
// No need to reinvent the wheel - drizzle-zod handles all edge cases

export { createInsertSchema, createSelectSchema } from 'drizzle-zod';
