# Deno Server Example

A simple example of drizzle-cms running on Deno with PGlite (in-process Postgres).

## Prerequisites

- Deno installed

## Setup

1. **Seed the database:**

```bash
deno task seed
```

2. **Run the server:**

```bash
deno task dev
```

3. **Open the CMS:**

Visit http://localhost:3000/admin

## Notes

- Uses PGlite for zero-dependency local Postgres
- Data is persisted to `./data` directory
- No external database required
