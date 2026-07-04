// Micro-benchmarks: HTML escaping and view rendering — pure string building
// that dominates response bodies. Run with: deno task bench

import { introspectTable, mapColumnsToFields } from '@hotsauce/core';
import { uploads } from '../../core/tests/fixtures/schema-pg.ts';
import { escapeHtml, html } from '../html.ts';
import { listTable } from '../views/list.ts';
import type { ListColumn, ListViewOptions } from '../views/list.ts';
import { gridItems } from '../views/grid.ts';
import type { GridThumbnail, GridViewOptions } from '../views/grid.ts';

const mixedText =
  'Hello <world> & "friends" — text with <b>markup</b> to escape';

Deno.bench('escapeHtml: 60-char mixed string', () => {
  escapeHtml(mixedText);
});

Deno.bench('html tagged template: small fragment', () => {
  html`
    <div class="card">
      <h2>${'Title & <tag>'}</h2>
      <p>${mixedText}</p>
    </div>
  `;
});

// Full list-view table render at increasing row counts.
const listColumns: ListColumn[] = [
  { key: 'id', label: 'Id' },
  { key: 'title', label: 'Title' },
  { key: 'status', label: 'Status' },
  { key: 'published', label: 'Published' },
  { key: 'createdAt', label: 'Created At' },
];

function makeRecords(count: number): Record<string, unknown>[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    title: `Post ${i} <with> markup & entities in the title text`,
    status: i % 3 === 0 ? 'draft' : 'published',
    published: i % 2 === 0,
    createdAt: new Date(2026, 0, 1 + (i % 28)),
  }));
}

const listOptions: ListViewOptions = {
  baseUrl: '/admin/posts',
  showEdit: true,
  showDelete: true,
  showView: true,
  csrfToken: 'bench-csrf-token',
};

const rows25 = makeRecords(25);
const rows100 = makeRecords(100);
const rows1000 = makeRecords(1000);

Deno.bench(
  'listTable: 25 rows × 5 columns',
  { group: 'list view render', baseline: true },
  () => {
    listTable(listColumns, rows25, listOptions);
  },
);

Deno.bench('listTable: 100 rows × 5 columns', {
  group: 'list view render',
}, () => {
  listTable(listColumns, rows100, listOptions);
});

Deno.bench('listTable: 1,000 rows × 5 columns', {
  group: 'list view render',
}, () => {
  listTable(listColumns, rows1000, listOptions);
});

// Grid view with image thumbnails (media-library style page).
const uploadFields = mapColumnsToFields(introspectTable(uploads).columns);
const thumbnailField = uploadFields[0]!;

const gridOptions: GridViewOptions = {
  baseUrl: '/admin/uploads',
  thumbnailField,
  currentView: 'grid',
  currentUrl: '/admin/uploads?view=grid',
};

const gridRecords = makeRecords(100);
const thumbnails: GridThumbnail[] = gridRecords.map((r, i) => ({
  id: r.id as number,
  thumbnailUrl: i % 4 === 0 ? null : `/files/upload-${i}.jpg`,
  label: `upload-${i}.jpg`,
}));

Deno.bench('gridItems: 100 thumbnails', () => {
  gridItems(gridRecords, thumbnails, gridOptions);
});
