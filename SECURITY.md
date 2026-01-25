# Security Guide

This document outlines security best practices and considerations when using Drizzle CMS.

## Security Features

Drizzle CMS implements multiple layers of security:

### 1. Authentication (JWT-based)

- **HS256 signing** with HMAC-SHA256
- **8-hour default token expiry** (configurable)
- **HttpOnly cookies** to prevent XSS token theft
- **SameSite=Lax** to prevent CSRF attacks
- **Secure flag** automatically set for HTTPS connections
- **Clock skew tolerance** (60 seconds) for distributed systems

**Best Practices:**

```typescript
// ✅ Use strong secrets (32+ characters)
const jwtSecret = crypto.randomUUID() + crypto.randomUUID();

// ❌ Don't use weak secrets
const jwtSecret = 'secret123';
```

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

**Best Practices:**

```typescript
// ✅ Use html`` template literal (auto-escapes)
import { html } from '@drizzle-cms/ui';
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

Drizzle CMS uses Drizzle ORM, which provides:

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

### 7. Column-Level Permissions

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
- Always provide `default` for hidden required columns (validated at startup)
- Combine with row policies for defense-in-depth
- Test that restricted columns are truly absent from API responses

## Environment Variables

### Required Secrets

All secrets should be at least **32 characters** of high-entropy random data.

```bash
# Generate secure secrets (Linux/macOS)
openssl rand -base64 32

# Or use Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

| Variable          | Purpose            | Min Length |
| ----------------- | ------------------ | ---------- |
| `CMS_CSRF_SECRET` | CSRF token signing | 32 chars   |
| `CMS_JWT_SECRET`  | JWT token signing  | 32 chars   |

**Best Practices:**

- Use different secrets for CSRF and JWT
- Store secrets in environment variables, not in code
- Use secret management services in production (AWS Secrets Manager, etc.)
- Rotate secrets periodically
- Never commit secrets to version control

### .env.example

```bash
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
- [ ] File upload validation (if using file upload plugin)

## Vulnerability Reporting

If you discover a security vulnerability, please report it through one of these methods:

**Preferred:** Open a [GitHub Security Advisory](https://github.com/earthlingdavey/drizzle-cms/security/advisories) (requires repository access)

**Alternative:** Open a private security report by going to the [Security tab](https://github.com/earthlingdavey/drizzle-cms/security) and clicking "Report a vulnerability"

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

This table shows how Drizzle CMS addresses the OWASP Top 10 security risks:

| Risk                           | Mitigation in Drizzle CMS                                         |
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
