// Configuration validation using Zod
// Validates CmsOptions at startup and throws on invalid config

import { z } from 'zod';

/**
 * Zod schema for CmsOptions validation
 * 
 * Validates configuration at startup to catch errors early.
 * Throws ZodError with detailed messages for invalid config.
 */
export const CmsOptionsSchema = z.object({
  // Required fields
  db: z.any().refine(
    (val) => val != null && typeof val === 'object',
    { message: 'db is required and must be a Drizzle database instance' }
  ),
  schema: z.record(z.string(), z.any()).refine(
    (val) => Object.keys(val).length > 0,
    { message: 'schema must contain at least one table' }
  ),
  
  // Optional fields with validation
  basePath: z.string()
    .regex(/^\//, { message: 'basePath must start with /' })
    .optional(),
  title: z.string()
    .min(1, { message: 'title cannot be empty' })
    .max(100, { message: 'title must be 100 characters or less' })
    .optional(),
  csrfSecret: z.string()
    .min(32, { message: 'csrfSecret must be at least 32 characters for security' })
    .optional(),
  // Functions validated as 'any' since Zod's function validation is complex
  // Runtime will fail anyway if these aren't callable
  isAuthenticated: z.any().optional(),
  canAccess: z.any().optional(),
  onError: z.any().optional(),
});

/**
 * Custom error class for CMS configuration errors
 */
export class CmsConfigError extends Error {
  constructor(message: string, public details?: z.ZodError) {
    super(message);
    this.name = 'CmsConfigError';
  }
}

/**
 * Validate CmsOptions and throw on invalid configuration
 * 
 * @throws {CmsConfigError} When configuration is invalid
 */
export function validateCmsOptions(options: unknown): void {
  const result = CmsOptionsSchema.safeParse(options);
  
  if (!result.success) {
    const issues = result.error.issues
      .map(issue => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    
    throw new CmsConfigError(
      `Invalid CMS configuration:\n${issues}`,
      result.error
    );
  }
}
