# @hotsauce/ui

HTML generation, form rendering, and view components for the CMS admin interface.

## Installation

```ts
import { editView, html, layout, raw } from '@hotsauce/ui';
```

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                         @hotsauce/ui                              │
├────────────┬────────────┬────────────┬────────────┬──────────────────┤
│  html.ts   │ styles.ts  │   forms/   │   views/   │   components/    │
│            │            │            │            │                  │
│  Template  │  CSS       │  Input     │  Page      │  Layout          │
│  literals  │  stylesheet│  renderers │  templates │  helpers         │
│  + escaping│            │            │            │                  │
└────────────┴────────────┴────────────┴────────────┴──────────────────┘
      ↓            ↓            ↓            ↓            ↓
  XSS-safe    External CSS  Form fields  Full pages   Page chrome
  HTML output (CSP-safe)   (text, select)(list, edit) (nav, alerts)
```

## Design Principles

- **Zero dependencies**: Pure functions returning strings
- **XSS-safe by default**: All interpolated values are escaped
- **Server-rendered**: No client-side JavaScript required
- **HTML5 validation**: Uses native browser validation attributes

## Modules

### `html.ts` - Safe HTML Generation

Tagged template literal with automatic XSS escaping.

| Export                     | Purpose                                  |
| -------------------------- | ---------------------------------------- |
| `html`                     | Tagged template that auto-escapes values |
| `raw(string)`              | Mark trusted HTML (skip escaping)        |
| `escapeHtml(value)`        | Manual HTML escaping                     |
| `attrs(object)`            | Build attribute strings safely           |
| `when(condition, content)` | Conditional rendering helper             |
| `join(items, separator)`   | Join with SafeHtml support               |
| `SafeHtml`                 | Class for pre-escaped content            |

**Example:**

```ts
import { attrs, html, raw } from '@hotsauce/ui';

// Auto-escaping prevents XSS
const userInput = '<script>alert("xss")</script>';
html`
  <p>${userInput}</p>
`;
// → <p>&lt;script&gt;alert("xss")&lt;/script&gt;</p>

// Trusted HTML with raw()
html`
  <div>${raw('<strong>Bold</strong>')}</div>
`;
// → <div><strong>Bold</strong></div>

// Safe attribute building
html`
  <input ${attrs({ type: 'text', value: userInput, disabled: false })} />
`;
// → <input type="text" value="&lt;script&gt;..." />
```

### `styles.ts` - CSS Stylesheet

External CSS stylesheet for strict CSP compliance.

| Export          | Purpose                  |
| --------------- | ------------------------ |
| `cmsStylesheet` | Complete CSS as a string |

The stylesheet is served externally at `{basePath}/styles.css` by the handlers package. This enables strict Content Security Policy (`style-src 'self'`) without requiring nonces.

```ts
import { cmsStylesheet } from '@hotsauce/ui';

// Raw CSS content (useful for custom serving)
console.log(cmsStylesheet.length); // ~8KB
```

### `forms/` - Form Input Renderers

Individual input components for different field types.

| Export                                 | Purpose                      |
| -------------------------------------- | ---------------------------- |
| `textInput(opts)`                      | Text input with maxlength    |
| `textareaInput(opts)`                  | Multi-line text              |
| `numberInput(opts)`                    | Numeric input                |
| `booleanInput(opts)`                   | Checkbox                     |
| `dateInput(opts)`                      | Date picker                  |
| `datetimeInput(opts)`                  | Datetime picker              |
| `selectInput(opts)`                    | Dropdown select              |
| `relationInput(opts)`                  | Foreign key select           |
| `checkboxListInput(opts)`              | Many-to-many checkboxes      |
| `uuidInput(opts)`                      | UUID with pattern validation |
| `jsonInput(opts)`                      | JSON textarea                |
| `fileInput(opts)`                      | File upload input + preview  |
| `hiddenInput(opts)`                    | Hidden field                 |
| `renderFieldInput(field, value, opts)` | Auto-routes to correct input |
| `formField(field, value, opts)`        | Field with label and wrapper |
| `form(opts)`                           | Complete form with fields    |

**Example:**

```ts
import { formField, selectInput, textInput } from '@hotsauce/ui';

// Basic text input
textInput({ name: 'title', value: 'Hello', required: true, maxLength: 200 });

// Select with options
selectInput({
  name: 'status',
  value: 'draft',
  options: [
    { value: 'draft', label: 'Draft' },
    { value: 'published', label: 'Published' },
  ],
});

// Full field with label
formField(cmsField, record.title, { relationOptions });
```

#### FormFieldOptions

```typescript
interface FormFieldOptions {
  /** Field value */
  value?: unknown;
  /** Unique ID for the input element */
  id?: string;
  /** Validation error message */
  error?: string;
  /** Help text override */
  helpText?: string;
  /** Force disabled state */
  disabled?: boolean;
  /** Relation options for FK fields */
  relationOptions?: RelationOption[];
  /** UI override from plugin (e.g., link to external editor) */
  override?: FieldUIOverride;
}
```

The `override` option is provided by plugin `renderField` hooks. When present:

- **`link`**: Renders a button linking to an external editor
- **`valueSummary`**: Replaces raw value with human-readable text (e.g., "3 blocks" instead of JSON)

#### File inputs

For fields marked as file fields (via `@hotsauce/core` `$cms({ file: true })` metadata), the UI renders:

- An `<input type="file">` with an `accept` attribute (when available)
- A preview for existing values (data URL or external `url`)
- A “Clear” button that submits a `_clear_<propertyName>` flag so the handlers can remove the file reference on update

### `views/` - Page Templates

Complete page views for CRUD operations.

| Export                         | Purpose                          |
| ------------------------------ | -------------------------------- |
| `listView(opts)`               | Table listing with pagination    |
| `listTable(opts)`              | Just the data table              |
| `fieldsToListColumns(fields)`  | Convert fields to table columns  |
| `detailView(opts)`             | Read-only record view            |
| `detailField(field, value)`    | Single field display             |
| `editView(opts)`               | Edit form for existing record    |
| `createView(opts)`             | Create form for new record       |
| `gridView(opts)`               | Thumbnail grid with detail panel |
| `gridItems(opts)`              | Just the grid thumbnails         |
| `gridDetailPanel(data)`        | RHS detail/edit panel            |
| `viewToggle(current, url)`     | Grid ↔ table toggle buttons      |
| `resolveThumbnailUrl(val)`     | Extract image URL from value     |
| `getGridItemLabel(rec, field)` | Label for a grid thumbnail       |

**Types:**

```ts
interface ListViewOptions {
  title: string;
  columns: ListColumn[];
  records: Record<string, unknown>[];
  primaryKey: string;
  basePath: string;
  tableName: string;
  // pagination, sorting...
}

interface EditViewOptions {
  title: string;
  fields: CMSField[];
  record: Record<string, unknown>;
  action: string;
  errors?: Record<string, string>;
  relationOptions?: Record<string, RelationOption[]>;
  manyToMany?: ManyToManyData[];
}
```

**Example:**

```ts
import { editView, listView } from '@hotsauce/ui';

// List page
const html = listView({
  title: 'Posts',
  columns: [{ key: 'title', label: 'Title' }, {
    key: 'status',
    label: 'Status',
  }],
  records: posts,
  primaryKey: 'id',
  basePath: '/admin',
  tableName: 'posts',
});

// Edit page
const html = editView({
  title: 'Edit Post',
  fields: postFields,
  record: post,
  action: '/admin/posts/1',
});
```

### `components/` - Layout & UI Components

Page chrome and reusable UI elements.

| Export             | Purpose                 |
| ------------------ | ----------------------- |
| `layout(opts)`     | Full HTML page with CSS |
| `nav(items)`       | Sidebar navigation      |
| `alert(message)`   | Flash message display   |
| `pagination(opts)` | Page navigation links   |

**Example:**

```ts
import { alert, layout, nav } from '@hotsauce/ui';

layout({
  title: 'Posts - Admin',
  nav: nav([
    { href: '/admin', label: 'Dashboard' },
    { href: '/admin/posts', label: 'Posts', active: true },
  ]),
  content: '...page content...',
  flash: { type: 'success', message: 'Post saved!' },
});
```

## Types

### `GridViewOptions`

```ts
interface GridViewOptions {
  baseUrl: string; // e.g. "/admin/media"
  primaryKey: string; // PK property name
  thumbnailField: CMSField; // Field with thumbnail: true
  currentView: 'grid' | 'table';
  currentUrl: string; // Current page URL (for toggle links)
  selectedId?: string; // Currently selected record
}
```

### `GridThumbnail`

```ts
interface GridThumbnail {
  id: string | number;
  thumbnailUrl: string | null;
  label: string;
}
```

### `RelationOption`

```ts
interface RelationOption {
  value: string | number;
  label: string;
}
```

### `ManyToManyData`

```ts
interface ManyToManyData {
  name: string; // Relation name (e.g., "categories")
  options: RelationOption[];
  selectedValues: (string | number)[];
}
```

### `NavItem`

```ts
interface NavItem {
  href: string;
  label: string;
  active?: boolean;
}
```

### `FlashMessage`

```ts
interface FlashMessage {
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
}
```

## Best Practices

1. **Always use `html` template** - Never concatenate strings with user input
2. **Use `raw()` sparingly** - Only for HTML you've generated or escaped
3. **Use `attrs()` for attributes** - Handles escaping and boolean attributes
4. **Prefer `renderFieldInput`** - Auto-routes to the correct input type
