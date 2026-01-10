// Tests for Zod validation schema generation (via drizzle-zod)

import { assertEquals } from 'jsr:@std/assert';
import { createInsertSchema, createSelectSchema } from '../validation/zod.ts';
import * as schema from './fixtures/schema.ts';

// createInsertSchema tests
Deno.test('createInsertSchema: creates schema for users table', () => {
  const insertSchema = createInsertSchema(schema.users);

  // Valid insert - all required fields
  const validResult = insertSchema.safeParse({
    email: 'test@example.com',
    name: 'Test User',
  });
  assertEquals(validResult.success, true);
});

Deno.test('createInsertSchema: id is optional (has default)', () => {
  const insertSchema = createInsertSchema(schema.users);

  // Without id - should pass (serial auto-increment)
  const withoutId = insertSchema.safeParse({
    email: 'test@example.com',
    name: 'Test User',
  });
  assertEquals(withoutId.success, true);

  // With id - should also pass (serial is integer)
  const withId = insertSchema.safeParse({
    id: 123,
    email: 'test@example.com',
    name: 'Test User',
  });
  assertEquals(withId.success, true);
});

Deno.test('createInsertSchema: validates required fields', () => {
  const insertSchema = createInsertSchema(schema.users);

  // Missing required email
  const missingEmail = insertSchema.safeParse({
    name: 'Test User',
  });
  assertEquals(missingEmail.success, false);
});

Deno.test('createInsertSchema: validates nullable fields', () => {
  const insertSchema = createInsertSchema(schema.users);

  // Bio is nullable - null should be valid
  const withNullBio = insertSchema.safeParse({
    email: 'test@example.com',
    name: 'Test User',
    bio: null,
  });
  assertEquals(withNullBio.success, true);
});

Deno.test('createInsertSchema: validates posts table', () => {
  const insertSchema = createInsertSchema(schema.posts);

  // posts.authorId is integer referencing users.id
  const validPost = insertSchema.safeParse({
    title: 'My Post',
    slug: 'my-post',
    authorId: 1,
  });
  assertEquals(validPost.success, true);
});

Deno.test('createInsertSchema: enum field validates values', () => {
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
Deno.test('createSelectSchema: creates schema for users table', () => {
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

Deno.test('createSelectSchema: requires all fields including id', () => {
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

Deno.test('createSelectSchema: validates posts with all fields', () => {
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

// Integration test with actual database-like workflow
Deno.test('Integration: insert and select schema workflow', () => {
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

// UUID primary key tests (uploads table)
Deno.test('createInsertSchema: uploads table requires UUID id (no default)', () => {
  const insertSchema = createInsertSchema(schema.uploads);

  // UUID id is required (no default on this table)
  const withoutId = insertSchema.safeParse({
    filename: 'photo.jpg',
    mimeType: 'image/jpeg',
    size: 12345,
    path: '/uploads/photo.jpg',
  });
  assertEquals(withoutId.success, false);

  // With valid UUID
  const withId = insertSchema.safeParse({
    id: '550e8400-e29b-41d4-a716-446655440000',
    filename: 'photo.jpg',
    mimeType: 'image/jpeg',
    size: 12345,
    path: '/uploads/photo.jpg',
  });
  assertEquals(withId.success, true);
});

Deno.test('createInsertSchema: uploads validates UUID format', () => {
  const insertSchema = createInsertSchema(schema.uploads);

  // drizzle-zod validates UUID format
  const invalidUuid = insertSchema.safeParse({
    id: 'not-a-valid-uuid',
    filename: 'photo.jpg',
    mimeType: 'image/jpeg',
    size: 12345,
    path: '/uploads/photo.jpg',
  });
  assertEquals(invalidUuid.success, false);

  // Valid UUID format passes
  const validUuid = insertSchema.safeParse({
    id: '550e8400-e29b-41d4-a716-446655440000',
    filename: 'photo.jpg',
    mimeType: 'image/jpeg',
    size: 12345,
    path: '/uploads/photo.jpg',
  });
  assertEquals(validUuid.success, true);
});

Deno.test('createSelectSchema: uploads validates UUID and all fields', () => {
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

Deno.test('createSelectSchema: uploads allows null for optional fields', () => {
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
