// Tests for Zod validation schema generation (via drizzle-zod)

import { assertEquals } from 'jsr:@std/assert';
import { z } from 'zod/v4';
import { createInsertSchema, createSelectSchema } from '../validation/zod.ts';
import * as pgSchema from './fixtures/schema-pg.ts';
import * as sqliteSchema from './fixtures/schema-sqlite.ts';

// Test both Postgres and SQLite schemas with the same test cases
const schemas = [
  { name: 'pg', schema: pgSchema },
  { name: 'sqlite', schema: sqliteSchema },
] as const;

for (const { name, schema } of schemas) {
  // createInsertSchema tests
  Deno.test(`${name}: createInsertSchema: creates schema for users table`, () => {
    const insertSchema = createInsertSchema(schema.users);

    const validResult = insertSchema.safeParse({
      email: 'test@example.com',
      name: 'Test User',
    });
    assertEquals(validResult.success, true);
  });

  Deno.test(`${name}: createInsertSchema: id is optional (has default)`, () => {
    const insertSchema = createInsertSchema(schema.users);

    // Without id - should pass (auto-increment)
    const withoutId = insertSchema.safeParse({
      email: 'test@example.com',
      name: 'Test User',
    });
    assertEquals(withoutId.success, true);

    // With id - should also pass
    const withId = insertSchema.safeParse({
      id: 123,
      email: 'test@example.com',
      name: 'Test User',
    });
    assertEquals(withId.success, true);
  });

  Deno.test(`${name}: createInsertSchema: validates required fields`, () => {
    const insertSchema = createInsertSchema(schema.users);

    // Missing required email
    const missingEmail = insertSchema.safeParse({
      name: 'Test User',
    });
    assertEquals(missingEmail.success, false);
  });

  Deno.test(`${name}: createInsertSchema: validates nullable fields`, () => {
    const insertSchema = createInsertSchema(schema.users);

    // Bio is nullable - null should be valid
    const withNullBio = insertSchema.safeParse({
      email: 'test@example.com',
      name: 'Test User',
      bio: null,
    });
    assertEquals(withNullBio.success, true);
  });

  Deno.test(`${name}: createInsertSchema: email column accepts valid email`, () => {
    const insertSchema = createInsertSchema(schema.users);

    const validEmail = insertSchema.safeParse({
      email: 'user@example.com',
      name: 'Test User',
    });
    assertEquals(validEmail.success, true);
  });

  Deno.test(`${name}: createInsertSchema: email column is required`, () => {
    const insertSchema = createInsertSchema(schema.users);

    // Missing email should fail (notNull constraint)
    const missingEmail = insertSchema.safeParse({
      name: 'Test User',
    });
    assertEquals(missingEmail.success, false);
  });

  Deno.test(`${name}: createInsertSchema: email rejects wrong type`, () => {
    const insertSchema = createInsertSchema(schema.users);

    // Number instead of string should fail
    const wrongType = insertSchema.safeParse({
      email: 12345,
      name: 'Test User',
    });
    assertEquals(wrongType.success, false);
  });

  Deno.test(`${name}: createInsertSchema: validates posts table`, () => {
    const insertSchema = createInsertSchema(schema.posts);

    // posts.authorId is integer referencing users.id
    const validPost = insertSchema.safeParse({
      title: 'My Post',
      slug: 'my-post',
      authorId: 1,
    });
    assertEquals(validPost.success, true);
  });

  Deno.test(`${name}: createInsertSchema: enum field validates values`, () => {
    const insertSchema = createInsertSchema(schema.posts);

    // Valid enum value
    const validStatus = insertSchema.safeParse({
      title: 'My Post',
      slug: 'my-post',
      authorId: 1,
      status: 'published',
    });
    assertEquals(validStatus.success, true);

    // Invalid enum value
    const invalidStatus = insertSchema.safeParse({
      title: 'My Post',
      slug: 'my-post',
      authorId: 1,
      status: 'invalid_status',
    });
    assertEquals(invalidStatus.success, false);
  });

  // createSelectSchema tests
  Deno.test(`${name}: createSelectSchema: creates schema for users table`, () => {
    const selectSchema = createSelectSchema(schema.users);

    const validSelect = selectSchema.safeParse({
      id: 1,
      email: 'test@example.com',
      name: 'Test User',
      bio: null,
      avatarUrl: null,
      isAdmin: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    assertEquals(validSelect.success, true);
  });

  Deno.test(`${name}: createSelectSchema: requires all fields including id`, () => {
    const selectSchema = createSelectSchema(schema.users);

    // Missing id - should fail for select schema
    const missingId = selectSchema.safeParse({
      email: 'test@example.com',
      name: 'Test User',
      bio: null,
      avatarUrl: null,
      isAdmin: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    assertEquals(missingId.success, false);
  });

  Deno.test(`${name}: createSelectSchema: validates posts with all fields`, () => {
    const selectSchema = createSelectSchema(schema.posts);

    const validSelect = selectSchema.safeParse({
      id: 1,
      title: 'My Post',
      slug: 'my-post',
      excerpt: null,
      body: null,
      status: 'draft',
      authorId: 1,
      featuredImageId: null,
      tags: ['tech', 'news'],
      publishedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    assertEquals(validSelect.success, true);
  });

  // Integration test
  Deno.test(`${name}: Integration: insert and select schema workflow`, () => {
    const insertSchema = createInsertSchema(schema.users);
    const selectSchema = createSelectSchema(schema.users);

    // Simulate what would be inserted
    const insertData = {
      email: 'user@example.com',
      name: 'New User',
    };
    assertEquals(insertSchema.safeParse(insertData).success, true);

    // Simulate what would be returned from DB (all fields populated)
    const selectData = {
      id: 42,
      email: 'user@example.com',
      name: 'New User',
      bio: null,
      avatarUrl: null,
      isAdmin: false,
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
    };
    assertEquals(selectSchema.safeParse(selectData).success, true);
  });

  // Uploads table tests
  Deno.test(`${name}: createInsertSchema: uploads table requires id (no default)`, () => {
    const insertSchema = createInsertSchema(schema.uploads);

    // id is required (no default on this table)
    const withoutId = insertSchema.safeParse({
      filename: 'photo.jpg',
      mimeType: 'image/jpeg',
      size: 12345,
      path: '/uploads/photo.jpg',
    });
    assertEquals(withoutId.success, false);

    // With id
    const withId = insertSchema.safeParse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      filename: 'photo.jpg',
      mimeType: 'image/jpeg',
      size: 12345,
      path: '/uploads/photo.jpg',
    });
    assertEquals(withId.success, true);
  });

  Deno.test(`${name}: createSelectSchema: uploads validates all fields`, () => {
    const selectSchema = createSelectSchema(schema.uploads);

    const validSelect = selectSchema.safeParse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      filename: 'photo.jpg',
      mimeType: 'image/jpeg',
      size: 12345,
      path: '/uploads/photo.jpg',
      alt: 'A nice photo',
      metadata: { width: 1920, height: 1080 },
      createdAt: new Date(),
    });
    assertEquals(validSelect.success, true);
  });

  Deno.test(`${name}: createSelectSchema: uploads allows null for optional fields`, () => {
    const selectSchema = createSelectSchema(schema.uploads);

    const withNulls = selectSchema.safeParse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      filename: 'document.pdf',
      mimeType: 'application/pdf',
      size: 99999,
      path: '/uploads/document.pdf',
      alt: null,
      metadata: null,
      createdAt: new Date(),
    });
    assertEquals(withNulls.success, true);
  });

  Deno.test(`${name}: createInsertSchema: uploads validates UUID format`, () => {
    // sqlite needs a drizzle-zod refinement for UUID validation.
    const insertSchema = name === 'sqlite'
      ? createInsertSchema(schema.uploads, { id: z.uuid() })
      : createInsertSchema(schema.uploads);

    const invalidUuid = insertSchema.safeParse({
      id: 'not-a-valid-uuid',
      filename: 'photo.jpg',
      mimeType: 'image/jpeg',
      size: 12345,
      path: '/uploads/photo.jpg',
    });
    assertEquals(invalidUuid.success, false);

    const validUuid = insertSchema.safeParse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      filename: 'photo.jpg',
      mimeType: 'image/jpeg',
      size: 12345,
      path: '/uploads/photo.jpg',
    });
    assertEquals(validUuid.success, true);
  });
}
