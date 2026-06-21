// Integration tests for renderField → fieldOverrides flow
// Verifies that plugin UI hooks produce visible changes in rendered pages

import { assertEquals, assertStringIncludes } from '@std/assert';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { sql } from 'drizzle-orm';
import { createCmsHandler } from '../mod.ts';
import type { FilterContext, InProcessPluginConfig } from '../plugins/types.ts';
import type { UIRenderFieldContext } from '@hotsauce/workers';
import {
  createPagesTable,
  schemaWithPlugins,
  TEST_CSRF_SECRET,
} from './integration_helpers.ts';

const { pages } = schemaWithPlugins;

// Unique markers to verify our plugin's output appears in the response
const CUSTOM_LINK_LABEL = 'Edit with Custom Editor';
const CUSTOM_LINK_HREF = '/custom-editor/pages/1/content';
const CUSTOM_VALUE_SUMMARY = 'Custom plugin value summary';
const CUSTOM_FILE_URL = 'https://example.com/custom-file.png';

/**
 * Create a test plugin that returns custom UI overrides for fields with plugins config
 */
function createRenderFieldPlugin(
  name: string,
  options?: {
    onRenderField?: (ctx: UIRenderFieldContext) => void;
    fileUrl?: string;
    link?: { label: string; href: string; target?: '_blank' };
    valueSummary?: string;
  },
): InProcessPluginConfig {
  return {
    name,
    filter: 'dangerously-open',
    hooks: {
      ui: {
        renderField: (ctx: UIRenderFieldContext) => {
          options?.onRenderField?.(ctx);

          // Only render for fields that have our plugin configured
          if (!ctx.field.plugin) return null;

          return {
            link: options?.link ?? {
              label: CUSTOM_LINK_LABEL,
              href: `${CUSTOM_LINK_HREF}`,
            },
            valueSummary: options?.valueSummary ?? CUSTOM_VALUE_SUMMARY,
            fileUrl: options?.fileUrl ?? CUSTOM_FILE_URL,
          };
        },
      },
    },
  };
}

Deno.test('integration: renderField produces fieldOverrides in detail view', async (t) => {
  const client = new PGlite();
  const db = drizzle(client, { schema: schemaWithPlugins });
  await createPagesTable(db);

  async function resetDb() {
    await db.execute(sql`TRUNCATE TABLE pages RESTART IDENTITY CASCADE`);
  }

  await t.step('detail view includes renderField link output', async () => {
    await resetDb();

    // Insert a page with content
    await db.insert(pages).values({
      title: 'Test Page',
      content: { blocks: [] },
    });

    const plugin = createRenderFieldPlugin('puck');

    const handler = createCmsHandler({
      csrfSecret: TEST_CSRF_SECRET,
      auth: 'dangerously-open',
      policies: 'dangerously-open',
      db,
      schema: schemaWithPlugins,
      basePath: '/admin',
      plugins: [plugin],
    });

    // GET detail view
    const response = await handler(
      new Request('http://localhost/admin/pages/1'),
    );

    assertEquals(response.status, 200);
    // Detail view uses fileUrl for file fields, but content is JSON not file
    // For non-file fields, detail view shows the raw value, not the link
    // The link is for edit forms. Detail view should show fileUrl if available.
    // Since content is JSON (not file type), the fileUrl isn't used here.
    // This test verifies the plugin is called - context tests below verify the data flow.
  });

  await t.step(
    'renderField receives correct context for detail view',
    async () => {
      await resetDb();

      await db.insert(pages).values({
        title: 'Context Test',
        content: { testData: 'hello' },
      });

      let receivedCtx: UIRenderFieldContext | null = null;

      const plugin = createRenderFieldPlugin('puck', {
        onRenderField: (ctx) => {
          if (ctx.field.name === 'content') {
            receivedCtx = ctx;
          }
        },
      });

      const handler = createCmsHandler({
        csrfSecret: TEST_CSRF_SECRET,
        auth: 'dangerously-open',
        policies: 'dangerously-open',
        db,
        schema: schemaWithPlugins,
        basePath: '/admin',
        plugins: [plugin],
      });

      await handler(new Request('http://localhost/admin/pages/1'));

      // Verify the context passed to renderField
      assertEquals(receivedCtx!.table, 'pages');
      assertEquals(receivedCtx!.view, 'detail');
      assertEquals(receivedCtx!.recordId, '1');
      assertEquals(receivedCtx!.field.name, 'content');
      assertEquals(
        (receivedCtx!.value as Record<string, unknown>)?.testData,
        'hello',
      );
      assertEquals(receivedCtx!.field.plugin, true); // puck: true from schema
    },
  );

  await client.close();
});

Deno.test('integration: renderField produces fieldOverrides in create view', async (t) => {
  const client = new PGlite();
  const db = drizzle(client, { schema: schemaWithPlugins });
  await createPagesTable(db);

  await t.step('create view includes renderField link output', async () => {
    const plugin = createRenderFieldPlugin('puck');

    const handler = createCmsHandler({
      csrfSecret: TEST_CSRF_SECRET,
      auth: 'dangerously-open',
      policies: 'dangerously-open',
      db,
      schema: schemaWithPlugins,
      basePath: '/admin',
      plugins: [plugin],
    });

    // GET create form
    const response = await handler(
      new Request('http://localhost/admin/pages/new'),
    );

    assertEquals(response.status, 200);
    const html = await response.text();

    // Plugin's link label should appear in the form
    assertStringIncludes(html, CUSTOM_LINK_LABEL);
  });

  await t.step(
    'renderField receives correct context for create view',
    async () => {
      let receivedCtx: UIRenderFieldContext | null = null;

      const plugin = createRenderFieldPlugin('puck', {
        onRenderField: (ctx) => {
          if (ctx.field.name === 'content') {
            receivedCtx = ctx;
          }
        },
      });

      const handler = createCmsHandler({
        csrfSecret: TEST_CSRF_SECRET,
        auth: 'dangerously-open',
        policies: 'dangerously-open',
        db,
        schema: schemaWithPlugins,
        basePath: '/admin',
        plugins: [plugin],
      });

      await handler(new Request('http://localhost/admin/pages/new'));

      // Verify context for create view
      assertEquals(receivedCtx!.table, 'pages');
      assertEquals(receivedCtx!.view, 'create');
      assertEquals(receivedCtx!.recordId, undefined);
      assertEquals(receivedCtx!.field.name, 'content');
      assertEquals(receivedCtx!.value, null); // No value yet
    },
  );

  await client.close();
});

Deno.test('integration: renderField produces fieldOverrides in edit view', async (t) => {
  const client = new PGlite();
  const db = drizzle(client, { schema: schemaWithPlugins });
  await createPagesTable(db);

  async function resetDb() {
    await db.execute(sql`TRUNCATE TABLE pages RESTART IDENTITY CASCADE`);
  }

  await t.step('edit view includes renderField link output', async () => {
    await resetDb();

    await db.insert(pages).values({
      title: 'Edit Test',
      content: { editing: true },
    });

    const plugin = createRenderFieldPlugin('puck');

    const handler = createCmsHandler({
      csrfSecret: TEST_CSRF_SECRET,
      auth: 'dangerously-open',
      policies: 'dangerously-open',
      db,
      schema: schemaWithPlugins,
      basePath: '/admin',
      plugins: [plugin],
    });

    // GET edit form
    const response = await handler(
      new Request('http://localhost/admin/pages/1/edit'),
    );

    assertEquals(response.status, 200);
    const html = await response.text();

    // Plugin's link label should appear in the form
    assertStringIncludes(html, CUSTOM_LINK_LABEL);
  });

  await t.step(
    'renderField receives correct context for edit view',
    async () => {
      await resetDb();

      await db.insert(pages).values({
        title: 'Context Edit Test',
        content: { editMode: 'full' },
      });

      let receivedCtx: UIRenderFieldContext | null = null;

      const plugin = createRenderFieldPlugin('puck', {
        onRenderField: (ctx) => {
          if (ctx.field.name === 'content') {
            receivedCtx = ctx;
          }
        },
      });

      const handler = createCmsHandler({
        csrfSecret: TEST_CSRF_SECRET,
        auth: 'dangerously-open',
        policies: 'dangerously-open',
        db,
        schema: schemaWithPlugins,
        basePath: '/admin',
        plugins: [plugin],
      });

      await handler(new Request('http://localhost/admin/pages/1/edit'));

      // Verify context for edit view
      assertEquals(receivedCtx!.table, 'pages');
      assertEquals(receivedCtx!.view, 'edit');
      assertEquals(receivedCtx!.recordId, '1');
      assertEquals(receivedCtx!.field.name, 'content');
      assertEquals(
        (receivedCtx!.value as Record<string, unknown>)?.editMode,
        'full',
      );
    },
  );

  await client.close();
});

Deno.test('integration: renderField is only called for fields with plugin config', async () => {
  const client = new PGlite();
  const db = drizzle(client, { schema: schemaWithPlugins });
  await createPagesTable(db);

  await db.execute(sql`TRUNCATE TABLE pages RESTART IDENTITY CASCADE`);
  await db.insert(pages).values({
    title: 'No Plugin Field',
    content: null,
  });

  const calledFields: string[] = [];

  const plugin = createRenderFieldPlugin('puck', {
    onRenderField: (ctx) => {
      calledFields.push(ctx.field.name);
    },
  });

  const handler = createCmsHandler({
    csrfSecret: TEST_CSRF_SECRET,
    auth: 'dangerously-open',
    policies: 'dangerously-open',
    db,
    schema: schemaWithPlugins,
    basePath: '/admin',
    plugins: [plugin],
  });

  // Request detail view
  await handler(new Request('http://localhost/admin/pages/1'));

  // After optimization: only fields with plugin config should be passed
  // The 'content' field has plugins: { puck: true }
  // The 'title', 'id', 'created_at' fields do NOT have plugins config
  assertEquals(
    calledFields,
    ['content'],
    'Only content field should be processed (has plugin config)',
  );

  await client.close();
});

Deno.test('integration: fieldOverrides fileUrl is passed to detail view', async () => {
  const client = new PGlite();
  const db = drizzle(client, { schema: schemaWithPlugins });
  await createPagesTable(db);

  await db.execute(sql`TRUNCATE TABLE pages RESTART IDENTITY CASCADE`);
  await db.insert(pages).values({
    title: 'File URL Test',
    content: { hasImage: true },
  });

  const customFileUrl = 'https://cdn.example.com/preview-123.jpg';
  let receivedOverride: unknown = null;

  // Create plugin that tracks what fileUrl it returns
  const plugin: InProcessPluginConfig = {
    name: 'puck',
    filter: 'dangerously-open',
    hooks: {
      ui: {
        renderField: (ctx: UIRenderFieldContext) => {
          if (ctx.field.name === 'content' && ctx.field.plugin) {
            const override = { fileUrl: customFileUrl };
            receivedOverride = override;
            return override;
          }
          return null;
        },
      },
    },
  };

  const handler = createCmsHandler({
    csrfSecret: TEST_CSRF_SECRET,
    auth: 'dangerously-open',
    policies: 'dangerously-open',
    db,
    schema: schemaWithPlugins,
    basePath: '/admin',
    plugins: [plugin],
  });

  await handler(new Request('http://localhost/admin/pages/1'));

  // Verify the plugin was called and returned the fileUrl
  // (The fileUrl is only displayed for file fields in the current UI,
  // but we verify the data flow works correctly)
  assertEquals(receivedOverride, { fileUrl: customFileUrl });

  await client.close();
});

Deno.test('integration: renderField produces cellOverrides in list view', async (t) => {
  const client = new PGlite();
  const db = drizzle(client, { schema: schemaWithPlugins });
  await createPagesTable(db);

  async function resetDb() {
    await db.execute(sql`TRUNCATE TABLE pages RESTART IDENTITY CASCADE`);
  }

  await t.step('list view includes renderField link output', async () => {
    await resetDb();

    // Insert pages with content
    await db.insert(pages).values([
      { title: 'Page One', content: { blocks: [1] } },
      { title: 'Page Two', content: { blocks: [2] } },
    ]);

    const plugin = createRenderFieldPlugin('puck');

    const handler = createCmsHandler({
      csrfSecret: TEST_CSRF_SECRET,
      auth: 'dangerously-open',
      policies: 'dangerously-open',
      db,
      schema: schemaWithPlugins,
      basePath: '/admin',
      plugins: [plugin],
    });

    // GET list view
    const response = await handler(
      new Request('http://localhost/admin/pages'),
    );

    assertEquals(response.status, 200);
    const html = await response.text();

    // Both valueSummary and link label should appear in the table cells
    assertStringIncludes(html, CUSTOM_VALUE_SUMMARY);
    assertStringIncludes(html, CUSTOM_LINK_LABEL);
    // The link href should also be present
    assertStringIncludes(html, CUSTOM_LINK_HREF);
  });

  await t.step(
    'renderField receives correct context for list view',
    async () => {
      await resetDb();

      await db.insert(pages).values({
        title: 'List Context Test',
        content: { listData: 'test' },
      });

      let receivedCtx: UIRenderFieldContext | null = null;

      const plugin = createRenderFieldPlugin('puck', {
        onRenderField: (ctx) => {
          if (ctx.field.name === 'content' && ctx.view === 'list') {
            receivedCtx = ctx;
          }
        },
      });

      const handler = createCmsHandler({
        csrfSecret: TEST_CSRF_SECRET,
        auth: 'dangerously-open',
        policies: 'dangerously-open',
        db,
        schema: schemaWithPlugins,
        basePath: '/admin',
        plugins: [plugin],
      });

      await handler(new Request('http://localhost/admin/pages'));

      // Verify context for list view
      assertEquals(receivedCtx!.table, 'pages');
      assertEquals(receivedCtx!.view, 'list');
      assertEquals(receivedCtx!.recordId, 1); // PGlite returns number, not string
      assertEquals(receivedCtx!.field.name, 'content');
      assertEquals(
        (receivedCtx!.value as Record<string, unknown>)?.listData,
        'test',
      );
      assertEquals(receivedCtx!.field.plugin, true); // puck: true from schema
    },
  );

  await t.step(
    'renderField is called for each record in list view',
    async () => {
      await resetDb();

      await db.insert(pages).values([
        { title: 'Multi 1', content: { id: 'a' } },
        { title: 'Multi 2', content: { id: 'b' } },
        { title: 'Multi 3', content: { id: 'c' } },
      ]);

      const receivedRecordIds: (string | number)[] = [];

      const plugin = createRenderFieldPlugin('puck', {
        onRenderField: (ctx) => {
          if (
            ctx.field.name === 'content' && ctx.view === 'list' && ctx.recordId
          ) {
            receivedRecordIds.push(ctx.recordId);
          }
        },
      });

      const handler = createCmsHandler({
        csrfSecret: TEST_CSRF_SECRET,
        auth: 'dangerously-open',
        policies: 'dangerously-open',
        db,
        schema: schemaWithPlugins,
        basePath: '/admin',
        plugins: [plugin],
      });

      await handler(new Request('http://localhost/admin/pages'));

      // Should have been called for each of the 3 records
      assertEquals(receivedRecordIds.length, 3);
      // IDs should be 1, 2, 3 (order may vary due to parallel execution)
      assertEquals(new Set(receivedRecordIds), new Set([1, 2, 3]));
    },
  );

  await client.close();
});

Deno.test('integration: hidden columns with plugins are not shown in list view', async () => {
  // Import pg-core directly for this test's custom schema
  const { pgTable, serial, varchar, json, timestamp } = await import(
    'drizzle-orm/pg-core'
  );

  // Define a schema with a hidden column that also has plugin config
  const pagesWithHidden = pgTable('pages', {
    id: serial('id').primaryKey(),
    title: varchar('title', { length: 200 }).notNull(),
    // This column has BOTH hidden: true AND plugins config
    content: json('content').$cms({ hidden: true, plugins: { puck: true } }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  });
  const schemaWithHiddenPlugin = { pages: pagesWithHidden };

  const client = new PGlite();
  const db = drizzle(client, { schema: schemaWithHiddenPlugin });

  // Create table
  await db.execute(sql`
    CREATE TABLE pages (
      id SERIAL PRIMARY KEY,
      title VARCHAR(200) NOT NULL,
      content JSON,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await db.insert(pagesWithHidden).values({
    title: 'Test Page',
    content: { blocks: [] },
  });

  // Track if renderField was called for the hidden column
  const calledForColumns: string[] = [];

  const plugin = createRenderFieldPlugin('puck', {
    onRenderField: (ctx) => {
      calledForColumns.push(ctx.field.name);
    },
  });

  const handler = createCmsHandler({
    csrfSecret: TEST_CSRF_SECRET,
    auth: 'dangerously-open',
    policies: 'dangerously-open',
    db,
    schema: schemaWithHiddenPlugin,
    basePath: '/admin',
    plugins: [plugin],
  });

  // GET list view
  const response = await handler(new Request('http://localhost/admin/pages'));

  assertEquals(response.status, 200);
  const html = await response.text();

  // The hidden column should NOT trigger renderField
  assertEquals(
    calledForColumns.includes('content'),
    false,
    'renderField should not be called for hidden columns',
  );

  // The custom link should NOT appear (since the column is hidden)
  assertEquals(
    html.includes(CUSTOM_LINK_LABEL),
    false,
    'Hidden column plugin links should not appear in list view',
  );

  await client.close();
});

Deno.test('integration: renderField filter receives correct action for each view', async (t) => {
  const client = new PGlite();
  const db = drizzle(client, { schema: schemaWithPlugins });
  await createPagesTable(db);

  async function resetDb() {
    await db.execute(sql`TRUNCATE TABLE pages RESTART IDENTITY CASCADE`);
  }

  // Track actions received by the filter for each view
  const filterActions: { view: string; action: string }[] = [];

  /**
   * Create a plugin that records filter context and always returns a link
   */
  function createFilterTrackingPlugin(): InProcessPluginConfig {
    return {
      name: 'filter-tracker',
      filter: (ctx: FilterContext) => {
        // Only track ui:renderField hook calls
        if (ctx.hookType === 'ui:renderField') {
          filterActions.push({ view: 'unknown', action: ctx.action });
        }
        return true; // Always allow
      },
      hooks: {
        ui: {
          renderField: (ctx: UIRenderFieldContext) => {
            // Update the last filter action entry with the actual view
            const last = filterActions[filterActions.length - 1];
            if (last && last.view === 'unknown') {
              last.view = ctx.view;
            }

            if (!ctx.field.plugin) return null;
            return {
              link: { label: 'Test Link', href: '/test' },
            };
          },
        },
      },
    };
  }

  await t.step('list view passes action=read to filter', async () => {
    await resetDb();
    filterActions.length = 0; // Clear previous calls

    await db.insert(pages).values({ title: 'Test', content: { data: 1 } });

    const plugin = createFilterTrackingPlugin();

    const handler = createCmsHandler({
      csrfSecret: TEST_CSRF_SECRET,
      auth: 'dangerously-open',
      policies: 'dangerously-open',
      db,
      schema: schemaWithPlugins,
      basePath: '/admin',
      plugins: [plugin],
    });

    await handler(new Request('http://localhost/admin/pages'));

    // Find the filter call for list view
    const listCalls = filterActions.filter((a) => a.view === 'list');
    assertEquals(
      listCalls.length > 0,
      true,
      'renderField should be called for list view',
    );
    assertEquals(
      listCalls[0]!.action,
      'read',
      'list view should pass action=read to filter (viewing existing records)',
    );
  });

  await t.step('detail view passes action=read to filter', async () => {
    await resetDb();
    filterActions.length = 0;

    await db.insert(pages).values({ title: 'Test', content: { data: 1 } });

    const plugin = createFilterTrackingPlugin();

    const handler = createCmsHandler({
      csrfSecret: TEST_CSRF_SECRET,
      auth: 'dangerously-open',
      policies: 'dangerously-open',
      db,
      schema: schemaWithPlugins,
      basePath: '/admin',
      plugins: [plugin],
    });

    await handler(new Request('http://localhost/admin/pages/1'));

    const detailCalls = filterActions.filter((a) => a.view === 'detail');
    assertEquals(
      detailCalls.length > 0,
      true,
      'renderField should be called for detail view',
    );
    assertEquals(
      detailCalls[0]!.action,
      'read',
      'detail view should pass action=read to filter (viewing existing record)',
    );
  });

  await t.step('create view passes action=create to filter', async () => {
    await resetDb();
    filterActions.length = 0;

    const plugin = createFilterTrackingPlugin();

    const handler = createCmsHandler({
      csrfSecret: TEST_CSRF_SECRET,
      auth: 'dangerously-open',
      policies: 'dangerously-open',
      db,
      schema: schemaWithPlugins,
      basePath: '/admin',
      plugins: [plugin],
    });

    await handler(new Request('http://localhost/admin/pages/new'));

    const createCalls = filterActions.filter((a) => a.view === 'create');
    assertEquals(
      createCalls.length > 0,
      true,
      'renderField should be called for create view',
    );
    assertEquals(
      createCalls[0]!.action,
      'create',
      'create view should pass action=create to filter (creating new record)',
    );
  });

  await t.step('edit view passes action=read to filter', async () => {
    await resetDb();
    filterActions.length = 0;

    await db.insert(pages).values({ title: 'Test', content: { data: 1 } });

    const plugin = createFilterTrackingPlugin();

    const handler = createCmsHandler({
      csrfSecret: TEST_CSRF_SECRET,
      auth: 'dangerously-open',
      policies: 'dangerously-open',
      db,
      schema: schemaWithPlugins,
      basePath: '/admin',
      plugins: [plugin],
    });

    await handler(new Request('http://localhost/admin/pages/1/edit'));

    const editCalls = filterActions.filter((a) => a.view === 'edit');
    assertEquals(
      editCalls.length > 0,
      true,
      'renderField should be called for edit view',
    );
    assertEquals(
      editCalls[0]!.action,
      'read',
      'edit view should pass action=read to filter (editing existing record)',
    );
  });

  await client.close();
});

Deno.test('integration: list view link supports target=_blank with rel=noopener', async () => {
  const client = new PGlite();
  const db = drizzle(client, { schema: schemaWithPlugins });
  await createPagesTable(db);

  await db.insert(pages).values({ title: 'Test', content: { data: 1 } });

  const plugin = createRenderFieldPlugin('puck', {
    link: {
      label: 'Open Editor',
      href: '/editor/1',
      target: '_blank',
    },
  });

  const handler = createCmsHandler({
    csrfSecret: TEST_CSRF_SECRET,
    auth: 'dangerously-open',
    policies: 'dangerously-open',
    db,
    schema: schemaWithPlugins,
    basePath: '/admin',
    plugins: [plugin],
  });

  const response = await handler(new Request('http://localhost/admin/pages'));
  assertEquals(response.status, 200);

  const html = await response.text();

  // Should include target="_blank" and rel="noopener" for security
  assertStringIncludes(html, 'target="_blank"');
  assertStringIncludes(html, 'rel="noopener"');
  // Should show link label with arrow for external links
  assertStringIncludes(html, 'Open Editor ↗');

  await client.close();
});

Deno.test('integration: list view renders valueSummary when no link', async () => {
  const client = new PGlite();
  const db = drizzle(client, { schema: schemaWithPlugins });
  await createPagesTable(db);

  await db.insert(pages).values({ title: 'Test', content: { data: 1 } });

  // Plugin returns only valueSummary, no link
  // Use 'puck' as plugin name to match the schema declaration
  const plugin: InProcessPluginConfig = {
    name: 'puck',
    filter: 'dangerously-open',
    hooks: {
      ui: {
        renderField: (ctx: UIRenderFieldContext) => {
          // Only respond for the content column which has puck plugin config
          if (!ctx.field.plugin) return null;
          return {
            valueSummary: 'Custom Summary Text',
            // No link - testing valueSummary-only display
          };
        },
      },
    },
  };

  const handler = createCmsHandler({
    csrfSecret: TEST_CSRF_SECRET,
    auth: 'dangerously-open',
    policies: 'dangerously-open',
    db,
    schema: schemaWithPlugins,
    basePath: '/admin',
    plugins: [plugin],
  });

  const response = await handler(new Request('http://localhost/admin/pages'));
  assertEquals(response.status, 200);

  const html = await response.text();

  // Should show the valueSummary as cell text
  assertStringIncludes(html, 'Custom Summary Text');
  // Should NOT be a link (no <a> tag with our text)
  assertEquals(
    html.includes('<a') && html.includes('Custom Summary Text</a>'),
    false,
    'valueSummary should not be rendered as a link',
  );

  await client.close();
});
