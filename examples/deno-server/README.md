# Deno Server Example

A simple example of hotsauce-cms running on Deno with PGlite (in-process Postgres) and JWT authentication.

## Prerequisites

- Deno installed

## Setup

1. **Seed the database:**

```bash
deno task seed
```

This creates the tables and an admin user with:

- **Email:** `admin@example.com`
- **Password:** `admin123`

2. **Run the server:**

```bash
deno task dev
```

3. **Open the CMS:**

Visit http://localhost:3000/admin and log in with the admin credentials.

## Authentication

This example demonstrates JWT-based authentication using the `auth` option:

- **Login page** at `/admin/login`
- **Logout** at `/admin/logout`
- **JWT tokens** stored in HttpOnly cookies
- **Password hashing** using PBKDF2-SHA256

### Key files:

- `schema.ts` - Includes `admin_users` table for storing credentials
- `main.ts` - Configures `auth` option with `PasswordProvider`
- `seed.ts` - Creates admin user with hashed password

## Row-Level Security (Policies)

The example includes commented-out policy configuration showing how to:

- **Restrict by ownership:** Users can only see/edit their own posts
- **Read-only tables:** Anyone can view but no one can modify
- **Admin bypass:** Admins can access everything

Uncomment the `auth.policies` section in `main.ts` to enable. See the CMS docs: [Row-Level Security (Policies)](../../packages/cms/README.md#row-level-security-policies).

## Notes

- Uses PGlite for zero-dependency local Postgres
- Data is persisted to `./data` directory
- No external database required
- **Important:** In production, use a secure JWT secret from environment variables
