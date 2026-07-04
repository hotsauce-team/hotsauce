# Security Guide

This document outlines security best practices and considerations when using HotSauce CMS.

## Security Features

HotSauce CMS implements multiple layers of security:

### 1. Authentication (JWT-based)

- **HS256 signing** with HMAC-SHA256
- **8-hour default token expiry** (configurable)
- **HttpOnly cookies** to prevent XSS token theft
- **SameSite=Lax** to prevent CSRF attacks (configurable — see [Cookie SameSite & CSRF posture](#cookie-samesite--csrf-posture))
- **Secure flag** automatically set for HTTPS connections
- **Clock skew tolerance** (60 seconds) for distributed systems

**Best Practices:**

```typescript
// ✅ Use strong secrets (32+ characters)
const jwtSecret = crypto.randomUUID() + crypto.randomUUID();

// ❌ Don't use weak secrets
const jwtSecret = 'secret123';
```

#### Cookie SameSite & CSRF posture

The auth cookie's `SameSite` attribute is the first line of CSRF defense: it
tells the browser when to attach the cookie to requests that originate from
other sites. HotSauce defaults to **`SameSite=Lax`** and lets you opt into
`Strict` via `auth.sameSite`.

```typescript
createCmsHandler({
  db,
  schema,
  auth: {
    provider,
    sameSite: 'Strict', // default is 'Lax'
  },
  policies,
});
```

**Why `Lax` is the default:**

- It blocks the cookie on cross-site **subrequests** (e.g. a hidden form or
  `fetch` from an attacker's page), which is the CSRF vector that matters.
- It still sends the cookie on top-level cross-site **navigation** (clicking a
  link into an admin page), so deep links and bookmarks keep working while the
  user stays logged in.

**When `Strict` is appropriate:** `Strict` never sends the cookie on _any_
cross-site request, including top-level navigation. That is the strongest
posture, but it has a real UX cost — a user who follows an external link to the
admin (from email, chat, another app) arrives **logged out** until they
navigate same-site, because the browser withholds the cookie on that first
request. Choose `Strict` when the admin is never reached via cross-site links
and you want the tightest CSRF boundary; otherwise `Lax` is the better default.

`SameSite=None` is intentionally **not** offered: it disables SameSite CSRF
protection entirely and only makes sense for cross-site embedding, which the
admin UI does not require.

> **SameSite is not a complete CSRF defense.** It is a browser heuristic, not a
> guarantee (older browsers and some edge cases ignore it). HotSauce also issues
> HMAC-signed [CSRF tokens](#2-csrf-protection) on every state-changing request
> and makes logout POST-only — `SameSite` is defense-in-depth on top of those.

**Deployment caveat (reverse proxies & `Secure`):** `SameSite` is only
meaningfully protective alongside the `Secure` flag, which HotSauce adds
automatically when the request is HTTPS. Behind a TLS-terminating proxy the
origin sees plain HTTP, so HotSauce inspects the `X-Forwarded-Proto` header (via
`isSecureRequest()` in `packages/auth/cookies.ts`) to detect the original
scheme. Ensure your proxy sets `X-Forwarded-Proto: https`, otherwise the
`Secure` flag is omitted and the cookie can leak over HTTP. See
[Production Deployment → HTTPS](#https).

### 2. CSRF Protection

- **HMAC-SHA256 signed tokens** with timestamp validation
- **4-hour token expiry** to limit replay window
- **Timing-safe comparison** using Web Crypto API
- **Automatic token injection** in forms

**Best Practices:**

- CSRF tokens are automatically validated on state-changing operations (POST, PUT, DELETE)
- Use different secrets for CSRF and JWT
- Rotate secrets periodically (requires re-authentication)

### 3. Password Security

- **PBKDF2-SHA256** with 600,000 iterations (OWASP recommended as of 2023)
- **16-byte random salt** per password
- **32-byte derived key** length
- **Constant-time comparison** to prevent timing attacks

**Best Practices:**

```typescript
// ✅ Let the CMS handle password hashing
const hash = await hashPassword(userPassword);
await db.insert(users).values({ email, passwordHash: hash });

// Verify on login
const valid = await verifyPassword(password, user.passwordHash);
```

### 4. XSS Prevention

- **Automatic HTML escaping** via tagged template literals
- **Content Security Policy** headers on all HTML responses
- **X-Content-Type-Options: nosniff** to prevent MIME sniffing

**Built-in CSP:**

```
default-src 'self'; 
style-src 'self'; 
script-src 'self'; 
img-src 'self' data:; 
form-action 'self'; 
frame-ancestors 'none'
```

Directives can be extended globally via the `csp` option (e.g., `imgSrc`, `connectSrc`, `styleSrc`). Plugins can also declare route-level CSP overrides for `styleSrc` and `connectSrc`, which are merged with the global policy at startup — only the specific route is relaxed.

**Best Practices:**

```typescript
// ✅ Use html`` template literal (auto-escapes)
import { html } from '@hotsauce/ui';
html`
  <p>User input: ${userInput}</p>
`; // Safe

// ✅ Only use raw() for trusted HTML
html`
  <div>${raw(sanitizedHtml)}</div>
`;

// ❌ Never concatenate user input
`<p>${userInput}</p>`; // Vulnerable to XSS
```

### 5. SQL Injection Prevention

HotSauce CMS uses Drizzle ORM, which provides:

- **Parameterized queries** by default
- **Type-safe query building**
- **No raw SQL concatenation**

**Best Practices:**

```typescript
// ✅ Use Drizzle query builder (always safe)
await db.select().from(users).where(eq(users.email, userEmail));

// ✅ Use sql`` tagged template (parameterized)
await db.execute(sql`SELECT * FROM users WHERE email = ${userEmail}`);

// ❌ Never use string concatenation (not possible with Drizzle)
```

### 6. Row-Level Security (Policies)

Fine-grained authorization for CRUD operations:

```typescript
// Example: Users can only edit their own posts
const policies = {
  posts: async (ctx, action) => {
    if (!ctx.user) return false; // Not authenticated

    if (action === 'list' || action === 'read') {
      return undefined; // Allow all reads
    }

    // Only allow editing own posts
    return eq(posts.authorId, ctx.user.sub);
  },
};
```

**Best Practices:**

- Always implement policies for multi-user systems
- Return `false` to deny access completely
- Return SQL condition to filter records
- Test policies thoroughly for each action type

### 7. Picker Mode (Puck plugin)

When the Puck editor is used, it opens the CMS grid in an iframe so users can pick images or other media. This uses a **source token** to identify the request origin.

**How it works:**

- The server generates a `plugin:puck` source token (HMAC-SHA256, signed with `CMS_CSRF_SECRET`, 4-hour TTL) and injects it into `globalThis.CmsContext.sourceToken` before the Puck editor loads
- `ImagePickerField` opens the grid as a `<dialog>` iframe, appending `?__cms_source=<token>` to the URL
- `handleList` validates the source token before serving picker responses — an invalid or expired token is treated as no token, and row policies that require a specific source will deny the request
- Picker requests also require a valid admin session (JWT cookie) — the source token alone is not sufficient
- The plugin name is read from the **signed** token, not the URL, so tampering with `?__cms_source` cannot switch which plugin's columns are exposed
- Only columns explicitly marked `$cms({ plugins: { puck: { role: 'source' } } })` appear in picker payloads — all other columns, including `thumbnail: true` columns, are excluded

**`CmsContext.sourceToken` is a bearer credential.** It is accessible to all modules in the user's Puck components bundle (via `globalThis`). Treat it accordingly:

- Do not log it or include it in error reports sent to external services
- Access logs will contain it in query strings if `?__cms_source=...` URLs are logged — consider scrubbing query parameters from access logs, or keeping log retention short
- The 4-hour TTL limits the window if a token is captured from logs

**Rotating `CMS_CSRF_SECRET`** invalidates all in-flight source tokens. Users with an open Puck editor tab will get a 403 on their next picker request and need to reload the page. This is expected behaviour given the short TTL.

### 8. Column-Level Permissions

Hide sensitive columns from specific users. Hidden columns:

- **Never sent to the browser** — data stays server-side
- **Automatically excluded from forms** — users can't even attempt to set them
- **Can inject defaults** — auto-fill hidden required columns (e.g., tenantId)

```typescript
// Example: Hide salary from non-admins, auto-inject tenantId
const policies = {
  employees: {
    row: ownedBy(schema.employees, 'managerId'),
    columns: {
      salary: {
        read: (ctx) => ctx.user?.role === 'admin',
        write: (ctx) => ctx.user?.role === 'admin',
      },
      tenantId: {
        read: () => false,
        write: () => false,
        default: (ctx) => ctx.user?.tenantId,
      },
    },
  },
};
```

**Best Practices:**

- Use column policies for PII, financial data, and internal fields
- Always provide `default` for hidden required columns (validated at runtime during create)
- Combine with row policies for defense-in-depth
- Test that restricted columns are truly absent from API responses

### 9. File Storage (fs-storage plugin)

The filesystem storage plugin maps storage keys onto a directory tree under
`rootDir`. Two layers keep a request from reaching a file it shouldn't:

- **Key validation** — every key is checked before it touches disk: absolute
  paths, `..`/`.`/empty segments, backslashes, control characters, and the
  reserved upload-staging directory are all rejected. This blocks _textual_
  path traversal.
- **Symlink containment** (`symlinkContainment`, default **on**) — a key's real
  path is resolved and an operation is refused if a symlink under `rootDir`
  redirects it outside. Reads (`get`/`getStream`) resolve the full key and
  reject any escape. Writes and deletes resolve the parent directory, so an
  escape via an intermediate directory symlink is rejected while a final-segment
  symlink is replaced (`put`) or unlinked (`delete`) in place rather than
  followed — the link is removed, its outside target untouched. Listing skips
  symlinked entries entirely (they are never keys the adapter created). Key
  validation alone can't catch any of this: a symlink is a legitimate path with
  no `..` in it. Containment costs one `realpath` syscall per file operation.

```typescript
createFsStoragePlugin({
  basePath: '/admin',
  rootDir: './uploads',
  // symlinkContainment defaults to true; only disable it if `rootDir` is a
  // directory your app exclusively controls AND you intentionally use
  // symlinks inside it.
  symlinkContainment: false,
});
```

**Best Practices:**

- Point `rootDir` at a directory your application **exclusively controls**. The
  symlink risk only exists if another (untrusted) process can create entries
  under `rootDir` — e.g. a shared or multi-tenant mount.
- Keep `symlinkContainment` on unless you have a specific reason to allow
  symlinks inside `rootDir`. It is **not** TOCTOU-proof: a symlink swapped in
  between the check and the file open still wins. For hard multi-tenant
  isolation, enforce containment at the OS level (a dedicated mount, a
  container, or `openat2(RESOLVE_BENEATH)`) rather than relying on it alone.
- Scope the runtime's filesystem permissions to `rootDir` (e.g. Deno
  `--allow-read`/`--allow-write` scoped to that path) as defense-in-depth —
  though note a symlink under `rootDir` textually resolves within the granted
  scope, so permission scoping does not by itself stop symlink escape.
- Only set `publicBaseUrl` for directories safe to expose: a raw static mount
  serves bytes without the CMS row/column policy checks the `/files/` route
  enforces.

### 10. Object Storage (s3-storage plugin)

The S3 plugin serves downloads two ways, with different exposure:

- **Presigned URLs (default)** — each download is a SigV4-signed URL that
  expires (`expirySeconds`, default 15 min). The `/files/` route enforces
  row/column policy before issuing one, and the short lifetime bounds the
  damage of a leaked link.
- **CDN URLs (`cdnBaseUrl`)** — `${cdnBaseUrl}/${key}`, **unsigned and
  non-expiring**. Faster and cache-friendly, but the URL is permanent and
  guessable, so once issued it bypasses CMS policy on every later fetch.

**Best Practices:**

- Use `cdnBaseUrl` for objects that are safe to serve publicly (published
  media, avatars). For access-controlled files, either keep the presigned
  default, or put the CDN behind access control it enforces itself — e.g.
  **signed cookies** scoped to the session (CloudFront/Cloudflare) or a private
  distribution. The plugin emits a **bare** URL, so a CDN that requires
  per-request **signed URLs** (rather than cookies) is not supported by this
  option.
- A CDN gated by signed cookies enforces access at the CDN's granularity
  (typically path or session), which is **coarser** than the CMS's per-record
  row/column policy — size the cookie scope accordingly.
- Configure SVG / scriptable-file handling at the bucket/CDN (see the
  [s3-storage README](packages/plugins/s3-storage/README.md#svg-and-scriptable-files))
  so a stored `.svg` can't execute scripts in a victim's origin.

## Environment Variables

### Required Secrets

All secrets should be at least **32 characters** of high-entropy random data.

```bash
# Generate secure secrets (Linux/macOS)
openssl rand -base64 32

# Or use Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

| Variable          | Purpose                     | Min Length |
| ----------------- | --------------------------- | ---------- |
| `CMS_2FA_SECRET`  | 2FA challenge token signing | 32 chars   |
| `CMS_CSRF_SECRET` | CSRF token signing          | 32 chars   |
| `CMS_JWT_SECRET`  | JWT token signing           | 32 chars   |

**Best Practices:**

- Use different secrets for CSRF, JWT, and challenge tokens
- Store secrets in environment variables, not in code
- Use secret management services in production (AWS Secrets Manager, etc.)
- Rotate secrets periodically
- Never commit secrets to version control

### .env.example

```bash
# 2FA Challenge Tokens (required if using 2FA with PasswordProvider)
CMS_2FA_SECRET=yet-another-random-32-character-secret

# CSRF Protection (required)
CMS_CSRF_SECRET=your-random-32-character-secret-here

# JWT Authentication (required if using auth)
CMS_JWT_SECRET=your-different-random-32-character-secret
```

## Production Deployment

### HTTPS

**Always use HTTPS in production.** The `Secure` cookie flag is automatically enabled for HTTPS connections.

```typescript
// Cookie will have Secure flag if served over HTTPS
const cookie = createAuthCookie(name, token, maxAge, path, isSecure);
```

### Security Headers

The CMS sets these headers on all HTML responses:

```typescript
{
  'Content-Security-Policy': "default-src 'self'; ...",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin'
}
```

**Additional recommended headers** (set at reverse proxy level):

```nginx
# nginx example
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header Permissions-Policy "geolocation=(), microphone=(), camera=()" always;
```

### Rate Limiting

**Implement rate limiting** at the reverse proxy or application level:

```typescript
// Example with a rate limiting middleware (not included)
app.use(
  '/admin/login',
  rateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 attempts per window
  }),
);
```

**Recommended limits:**

- Login attempts: 5 per 15 minutes per IP
- API requests: 100 per minute per user
- Admin panel: 1000 per hour per user

### Database Security

- Use **separate database user** for the CMS with minimal privileges
- Enable **row-level security** in PostgreSQL
- Use **SSL/TLS** for database connections
- Regular backups with encryption

```sql
-- Example: Minimal PostgreSQL permissions
CREATE USER cms_app WITH PASSWORD 'strong_password';
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO cms_app;
```

## Security Checklist

Before deploying to production:

- [ ] All secrets are at least 32 characters of high-entropy random data
- [ ] Secrets are stored in environment variables, not in code
- [ ] HTTPS is enabled (Secure cookie flag will be automatic)
- [ ] Rate limiting is configured for authentication endpoints
- [ ] Content Security Policy headers are reviewed and appropriate
- [ ] Row-level policies are implemented for multi-user access
- [ ] Database uses minimal privilege user
- [ ] Database connections use SSL/TLS
- [ ] Regular security updates are scheduled
- [ ] Logging and monitoring are configured
- [ ] Error messages don't leak sensitive information
- [ ] File upload validation (if using file uploads)
- [ ] SVG / scriptable file handling configured at bucket level (if using S3-compatible storage — see [s3-storage SVG guidance](packages/plugins/s3-storage/README.md#svg-and-scriptable-files))

## Vulnerability Reporting

If you discover a security vulnerability, please report it through one of these methods:

**Preferred:** Open a [GitHub Security Advisory](https://github.com/hotsauce-team/hotsauce/security/advisories) (requires repository access)

**Alternative:** Open a private security report by going to the [Security tab](https://github.com/hotsauce-team/hotsauce-cms/security) and clicking "Report a vulnerability"

Include in your report:

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

**Please do not open public issues for security vulnerabilities.**

## Security Updates

Stay informed about security updates:

- Watch the GitHub repository for releases
- Review CHANGELOG.md for security fixes
- Subscribe to security advisories (GitHub Security Advisories)

## Compliance

### OWASP Top 10 Coverage

This table shows how HotSauce CMS addresses the OWASP Top 10 security risks:

| Risk                           | Mitigation in HotSauce CMS                                        |
| ------------------------------ | ----------------------------------------------------------------- |
| A01: Broken Access Control     | Row-level policies, JWT authentication                            |
| A02: Cryptographic Failures    | PBKDF2 password hashing, HMAC-SHA256 tokens, HTTPS support        |
| A03: Injection                 | Drizzle ORM with parameterized queries (SQL injection prevention) |
| A04: Insecure Design           | Security-first architecture with defense in depth                 |
| A05: Security Misconfiguration | Secure defaults, comprehensive security headers                   |
| A06: Vulnerable Components     | Zero transitive dependencies, minimal attack surface              |
| A07: Authentication Failures   | JWT with expiry, HttpOnly cookies, rate limiting (recommended)    |
| A08: Data Integrity Failures   | CSRF tokens, input validation with Zod schemas                    |
| A09: Logging Failures          | Error hooks for custom audit logging                              |
| A10: SSRF                      | No external requests in core CMS code                             |

**Note:** While the CMS provides these security features, proper configuration and deployment practices (HTTPS, rate limiting, monitoring) are required for production use. See the [Security Checklist](#security-checklist) above.

### Data Protection (GDPR, etc.)

If you're handling personal data:

- Implement data retention policies
- Provide user data export functionality
- Implement secure deletion
- Document data processing in your privacy policy
- Consider data encryption at rest

## Additional Resources

- [OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/)
- [Web Security Guidelines](https://infosec.mozilla.org/guidelines/web_security)
- [JWT Best Practices](https://tools.ietf.org/html/rfc8725)
- [OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
