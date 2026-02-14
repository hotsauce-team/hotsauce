/**
 * E2E smoke tests for @hotsauce/* npm packages in Node.js
 *
 * Verifies packages import and core functionality works.
 * Not meant to replace Deno unit tests - just validates npm builds.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ─────────────────────────────────────────────────────────────
// @hotsauce/core - Schema introspection
// ─────────────────────────────────────────────────────────────
import { introspectTable, mapColumnsToFields } from '@hotsauce/core';
import * as schema from './schema.js';

describe('@hotsauce/core', () => {
  it('introspects tables and maps fields', () => {
    const table = introspectTable(schema.users);

    assert.equal(table.name, 'users');
    assert.ok(
      table.columns.length > 0,
      `Expected columns but got ${table.columns.length}`,
    );
    assert.deepEqual(table.primaryKey, ['id']);

    const fields = mapColumnsToFields(table.columns);
    assert.ok(fields.length > 0, 'Expected fields from mapColumnsToFields');
  });
});

// ─────────────────────────────────────────────────────────────
// @hotsauce/ui - HTML generation with XSS protection
// ─────────────────────────────────────────────────────────────
import { html, raw } from '@hotsauce/ui';

describe('@hotsauce/ui', () => {
  it('escapes XSS and preserves trusted content', () => {
    const malicious = '<script>alert("xss")</script>';
    const result = html`
      <div>${malicious}</div>
    `;

    assert.ok(!result.includes('<script>'));
    assert.ok(result.includes('&lt;script&gt;'));

    // raw() bypasses escaping for trusted content
    const trusted = html`
      <div>${raw('<b>bold</b>')}</div>
    `;
    assert.ok(trusted.includes('<b>bold</b>'));
  });
});

// ─────────────────────────────────────────────────────────────
// @hotsauce/auth - JWT and password hashing
// ─────────────────────────────────────────────────────────────
import {
  hashPassword,
  signJwt,
  verifyJwt,
  verifyPassword,
} from '@hotsauce/auth';

describe('@hotsauce/auth', () => {
  const secret = 'test-secret-that-is-at-least-32-chars-long';

  it('signs and verifies JWT', async () => {
    const payload = { sub: 'user-123', role: 'admin' };
    const token = await signJwt(payload, secret, { expiresIn: '1h' });

    assert.ok(typeof token === 'string');
    assert.ok(token.split('.').length === 3);

    const verified = await verifyJwt(token, secret);
    assert.equal(verified.sub, 'user-123');
    assert.equal(verified.role, 'admin');
  });

  it('hashes and verifies passwords', async () => {
    const password = 'super-secret-123';
    const hash = await hashPassword(password);

    assert.ok(hash !== password);
    assert.ok(await verifyPassword(password, hash));
    assert.ok(!(await verifyPassword('wrong-password', hash)));
  });
});
