// Spice Rack schema — hot sauce catalogue demo for hotsauce-cms
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { createInsertSchema, createUpdateSchema } from 'drizzle-zod';
import { z } from 'zod';

import '@hotsauce/core/extend';
import type {
  CmsColumnOptions,
  CmsTableOptions,
  FileReference,
} from '@hotsauce/core/extend';
import type { Parsers } from '@hotsauce/cms';

// ─────────────────────────────────────────────────────────────
// Type declarations for $cms() method on Drizzle columns/tables.
// Required for TypeScript support. Add once per project.
// ─────────────────────────────────────────────────────────────
declare module 'drizzle-orm/pg-core' {
  interface PgColumnBuilder {
    $cms(options: CmsColumnOptions): this;
  }
  interface PgTable {
    $cms(options: CmsTableOptions): this;
  }
}

// ─────────────────────────────────────────────────────────────
// Tables
// ─────────────────────────────────────────────────────────────

/**
 * Makers table - the companies and individuals who produce hot sauces.
 * Exercises: file upload (logo), markdown bio, relation FK target.
 */
export const makers = pgTable('makers', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  // Markdown bio - transformed to HTML by the markdown plugin
  bio: text('bio').$cms({
    plugins: { markdown: { role: 'source', output: 'bioHtml' } },
  }),
  // Rendered HTML - populated automatically, hidden from edit form
  bioHtml: text('bio_html').$cms({
    plugins: { markdown: { role: 'output' } },
  }),
  // Maker logo - stored in DB (small, ~50KB limit)
  logo: jsonb('logo').$type<FileReference>().$cms({
    file: { accept: 'image/*', maxSize: 50 * 1024, previewSvg: true },
    thumbnail: true, // Show as image in admin list view
  }),
  website: varchar('website', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

/**
 * Media table - uploaded files (bottle shots, logos, hero images).
 *
 * Picker mode sends: PK (always) + columns with `plugins.puck.role: 'source'`
 * - `thumbnail: true` = grid rendering (image preview)
 * - `role: 'source'` = data exposure (postMessage to plugin)
 */
export const media = pgTable('media', {
  id: serial('id').primaryKey(),
  file: jsonb('file').$type<FileReference>().$cms({
    file: { accept: 'image/*', previewSvg: true },
    thumbnail: true, // Grid rendering
    plugins: { puck: { role: 'source' } }, // Data exposure
  }),
  alt: text('alt').$cms({
    plugins: { puck: { role: 'source' } }, // Data exposure
  }),
  caption: text('caption'), // NOT exposed to plugins
  published: boolean('published').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}).$cms({ autoDraft: true });

/**
 * Sauces table - the main content type.
 * Exercises: FK relation (maker), file upload (bottle photo), markdown
 * tasting notes, integer heat rating, published flag, frontendUrl.
 */
export const sauces = pgTable('sauces', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 120 }).notNull(),
  slug: varchar('slug', { length: 120 }).notNull().unique(),
  // FK to makers - renders as a relation picker in the admin form
  makerId: integer('maker_id')
    .notNull()
    .references(() => makers.id),
  // Heat rating 1–10, rendered as 🌶 repeats on the public site
  heat: integer('heat').notNull(),
  // Scoville units - optional, surfaced as secondary detail
  scoville: integer('scoville'),
  // Bottle photo - stored in DB or S3 depending on config
  bottle: jsonb('bottle').$type<FileReference>().$cms({
    file: { accept: 'image/*', previewSvg: true },
    thumbnail: true, // Show as image in admin list view
  }),
  // Markdown tasting notes - transformed to HTML by markdown plugin
  tastingNotes: text('tasting_notes').notNull().$cms({
    plugins: { markdown: { role: 'source', output: 'tastingNotesHtml' } },
  }),
  // Rendered HTML - populated automatically, hidden from edit form
  tastingNotesHtml: text('tasting_notes_html').$cms({
    plugins: { markdown: { role: 'output' } },
  }),
  published: boolean('published').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}).$cms({
  // "View on site" link shown on the edit page when published
  frontendUrl: (sauce) => sauce.published ? `/sauce/${sauce.slug}` : null,
});

/**
 * Pages table - visual pages edited with Puck.
 * Uses JSONB content with Puck visual editor (vs sauces which use markdown).
 */
export const pages = pgTable('pages', {
  id: serial('id').primaryKey().$cms({ hidden: true }),
  title: varchar('title', { length: 255 }),
  slug: varchar('slug', { length: 255 }).unique()
    .$defaultFn(() => `draft-${crypto.randomUUID().slice(0, 8)}`),
  // JSON content edited with Puck visual editor
  content: jsonb('content').$cms({ plugins: { puck: true } }),
  sortOrder: integer('sort_order').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  published: boolean('published').default(false).notNull(),
}).$cms({
  autoDraft: true,
  frontendUrl: (page) => page.published ? `/${page.slug}` : null,
});

/**
 * Site settings - key/value configuration.
 * Read-only in the live demo (policy set in admin.ts).
 */
export const settings = pgTable('settings', {
  id: serial('id').primaryKey(),
  key: varchar('key', { length: 100 }).notNull().unique(),
  value: text('value').notNull(),
  description: text('description'),
});

/**
 * CMS users - authentication for the admin panel.
 */
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull().$cms({
    hidden: true, // Never shown in admin forms
  }),
  name: varchar('name', { length: 100 }).notNull(),
  role: varchar('role', { length: 50 }).default('editor').notNull(),
  avatar: jsonb('avatar').$type<FileReference>().$cms({
    file: { maxSize: 20 * 1024 }, // 20KB - always stored in database
  }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ─────────────────────────────────────────────────────────────
// Relations
// ─────────────────────────────────────────────────────────────

export const makersRelations = relations(makers, ({ many }) => ({
  sauces: many(sauces),
}));

export const saucesRelations = relations(sauces, ({ one }) => ({
  maker: one(makers, {
    fields: [sauces.makerId],
    references: [makers.id],
  }),
}));

// ─────────────────────────────────────────────────────────────
// Schema export (for Drizzle and CMS)
// ─────────────────────────────────────────────────────────────

export const schema = {
  sauces,
  makers,
  pages,
  media,
  users,
  settings,
  // Relations
  makersRelations,
  saucesRelations,
};

// ─────────────────────────────────────────────────────────────
// Zod schemas for validation (used by CMS)
// All tables use the CMS's built-in drizzle-zod fallback except where
// custom cross-field rules or extra refinements are needed.
// ─────────────────────────────────────────────────────────────

// Sauces: clamp heat to the 1–10 display scale
const saucesInsertSchema = createInsertSchema(sauces, {
  heat: (s) => s.min(1).max(10),
});
const saucesUpdateSchema = createUpdateSchema(sauces, {
  heat: (s) => s.min(1).max(10).optional(),
});

// Pages: require title and slug when publishing
function requireTitleSlugWhenPublished(
  data: Record<string, unknown>,
  ctx: z.RefinementCtx,
) {
  if (data.published) {
    if (!data.title || (typeof data.title === 'string' && !data.title.trim())) {
      ctx.addIssue({
        code: 'custom',
        message: 'Title is required when publishing',
        path: ['title'],
      });
    }
    if (!data.slug || (typeof data.slug === 'string' && !data.slug.trim())) {
      ctx.addIssue({
        code: 'custom',
        message: 'Slug is required when publishing',
        path: ['slug'],
      });
    }
  }
}
const pagesInsertSchema = createInsertSchema(pages).superRefine(
  requireTitleSlugWhenPublished,
);
const pagesUpdateSchema = createUpdateSchema(pages).superRefine(
  requireTitleSlugWhenPublished,
);

/**
 * Parsers for CMS form validation.
 * Only tables with custom rules are listed; all others fall back to the
 * CMS's built-in drizzle-zod validation automatically.
 */
export const parsers: Parsers = {
  sauces: {
    insert: (data: unknown) => saucesInsertSchema.parse(data),
    update: (data: unknown) => saucesUpdateSchema.parse(data),
  },
  pages: {
    insert: (data: unknown) => pagesInsertSchema.parse(data),
    update: (data: unknown) => pagesUpdateSchema.parse(data),
  },
};
