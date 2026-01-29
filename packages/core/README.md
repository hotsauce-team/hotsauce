# @drizzle-cms/core

Schema introspection, field mapping, and validation for Drizzle ORM.

## Installation

```ts
import { introspectFullSchema, mapColumnToField } from '@drizzle-cms/core';
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    @drizzle-cms/core                        │
├─────────────────┬─────────────────┬─────────────────────────┤
│   schema/       │   fields/       │   validation/           │
│                 │                 │                         │
│  Drizzle Table  │  Introspected   │  Zod Schemas            │
│       ↓         │    Column       │  (from drizzle-zod)     │
│  introspect()   │       ↓         │                         │
│       ↓         │  mapToField()   │  createInsertSchema()   │
│  IntrospectedTable  │       ↓     │  createSelectSchema()   │
│                 │   CMSField      │                         │
└─────────────────┴─────────────────┴─────────────────────────┘
        ↓                 ↓                   ↓
   Used by handlers    Used by UI        Used by handlers
   for routing         for rendering     for validation
```

## Modules

### `schema/` - Schema Introspection

Extract metadata from Drizzle tables (columns, types, relations, foreign keys).
Works with any Drizzle dialect (Postgres, MySQL, SQLite).

> **Tested with both Postgres and SQLite schemas** — see `tests/fixtures/` for examples.

| Export                         | Purpose                                        |
| ------------------------------ | ---------------------------------------------- |
| `introspectTable(table)`       | Get metadata for a single table                |
| `introspectSchema(schema)`     | Get metadata for all tables in a schema module |
| `introspectRelations(schema)`  | Extract relation definitions                   |
| `introspectFullSchema(schema)` | Combined tables + relations + junctions        |
| `detectJunctionTables(tables)` | Find many-to-many link tables                  |

**Example:**

```ts
import { introspectTable } from '@drizzle-cms/core';
import { users } from './schema';

const meta = introspectTable(users);
console.log(meta.name); // 'users'
console.log(meta.primaryKey); // ['id']
console.log(meta.columns); // [{name: 'id', dataType: 'number', ...}, ...]
```

### `fields/` - Field Mapping

Map database columns to CMS UI field types.

| Export                         | Purpose                                                  |
| ------------------------------ | -------------------------------------------------------- |
| `mapColumnToFieldType(column)` | Column → field type (`text`, `number`, `relation`, etc.) |
| `mapColumnToField(column)`     | Full field definition with label, hints                  |
| `mapColumnsToFields(columns)`  | Batch conversion for all columns                         |
| `propertyNameToLabel(name)`    | `authorId` → `"Author Id"`                               |

**Field Types:**

| CMSFieldType | Used For                 |
| ------------ | ------------------------ |
| `text`       | Short strings (varchar)  |
| `textarea`   | Long text (text columns) |
| `number`     | Integers, decimals       |
| `boolean`    | Boolean columns          |
| `date`       | Date-only columns        |
| `datetime`   | Timestamp columns        |
| `select`     | Enum columns             |
| `relation`   | Foreign key references   |
| `json`       | JSON/JSONB columns       |
| `uuid`       | UUID columns             |
| `array`      | Array columns (Postgres) |

**Example:**

```ts
import { mapColumnToField } from '@drizzle-cms/core';

const field = mapColumnToField(meta.columns[0]);
console.log(field.fieldType); // 'text'
console.log(field.label); // 'Email'
console.log(field.column); // Original column metadata
```

### `extend/` - Column Metadata (`$cms()`)

Optionally patch Drizzle column builders to attach CMS-specific metadata to columns.
This enables schema-authored hints (like file fields) to flow into introspection and field mapping.

**Usage:**

```ts
import '@drizzle-cms/core/extend';
import { jsonb, pgTable } from 'drizzle-orm/pg-core';

const users = pgTable('users', {
  avatar: jsonb('avatar').$cms({ file: true }),
});
```

Notes:

- Importing `@drizzle-cms/core/extend` patches Drizzle builder prototypes (a global side effect).
- Metadata is stored on the Drizzle column config and is available as `IntrospectedColumn.cmsOptions`.

#### File fields

To model file uploads, mark a JSON/JSONB column with `$cms({ file: true })`.

`CmsColumnOptions` supports:

- `file?: boolean` — marks the column as a file field
- `accept?: string` — MIME accept pattern(s) (e.g. `image/*`, `image/*,application/pdf`)
- `maxSize?: number` — maximum size in bytes

The default constraints are:

- `accept`: `image/*`
- `maxSize`: `200_000` (200KB)

File values are stored as a JSON object:

```ts
export type FileReference = {
  filename: string;
  contentType: string;
  size: number;
  data?: string; // base64
  url?: string; // external URL
};
```

For runtime checks, `isValidFileReference(value)` is exported from `@drizzle-cms/core`.

### `validation/` - Zod Schema Generation

Re-exports from `drizzle-zod` for form validation.

| Export                      | Purpose                         |
| --------------------------- | ------------------------------- |
| `createInsertSchema(table)` | Zod schema for creating records |
| `createSelectSchema(table)` | Zod schema for reading records  |

**Example:**

```ts
import { createInsertSchema } from '@drizzle-cms/core';
import { users } from './schema';

const insertSchema = createInsertSchema(users);
const result = insertSchema.safeParse(formData);
```

## Types

### `IntrospectedColumn`

```ts
interface IntrospectedColumn {
  name: string; // Database column name (snake_case)
  propertyName: string; // Drizzle property name (camelCase)
  columnType: string; // e.g., 'PgVarchar', 'SQLiteInteger'
  dataType: string; // e.g., 'string', 'number', 'boolean'
  notNull: boolean;
  hasDefault: boolean;
  isPrimaryKey: boolean;
  isUnique: boolean;
  maxLength?: number;
  enumValues?: readonly string[];
  isArray?: boolean;
  references?: { table: string; column: string };
}
```

### `IntrospectedTable`

```ts
interface IntrospectedTable {
  name: string;
  columns: IntrospectedColumn[];
  primaryKey: string[];
  table: unknown; // Original Drizzle table reference
  isJunction?: boolean; // True for many-to-many link tables
}
```

### `CMSField`

```ts
interface CMSField {
  column: IntrospectedColumn;
  fieldType: CMSFieldType;
  label: string;
  placeholder?: string;
  helpText?: string;
  hidden?: boolean;
  readOnly?: boolean;
}
```

## Design Principles

- **Database-agnostic**: Core introspection works with Postgres, MySQL, and SQLite
- **Zero runtime dependencies**: Only uses `drizzle-orm` types at runtime
- **Pure functions**: No side effects, easy to test
- **Explicit types**: All public APIs have TypeScript definitions

## TODO

- [ ] **Custom validation refinements**: SQLite stores UUIDs as plain text, so `drizzle-zod` doesn't automatically validate UUID format. Need a way to attach custom Zod refinements to columns (e.g., via `$withMeta()` or a separate config) that get applied when generating validation schemas.
