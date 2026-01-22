# Plugin System Review - Implementation Checklist

This checklist tracks the implementation of all recommendations from the peer review.

**Last Updated**: 2026-01-22  
**Review Documents**: 
- [PLUGIN_SYSTEM_REVIEW.md](./PLUGIN_SYSTEM_REVIEW.md) - Full technical review
- [REVIEW_SUMMARY.md](./REVIEW_SUMMARY.md) - Executive summary

---

## 🔴 Critical Fixes (Must Do Before Merge)

**Estimated Total Effort**: 6.5 hours

### 1. Configurable Worker Timeouts (2 hours)

- [ ] Add `WorkerExecutorOptions` interface with `timeout` and `maxPendingPerWorker` fields
- [ ] Update `WorkerExecutor` constructor to accept options
- [ ] Replace hardcoded `30000` with configurable `this.options.timeout`
- [ ] Add per-Worker pending request limit check
- [ ] Update error messages to include timeout duration
- [ ] Add tests for timeout behavior
- [ ] Document timeout configuration in README

**Files to Modify**:
- `packages/handlers-workers/executor.ts`
- `packages/handlers-workers/types.ts`
- `packages/handlers-workers/README.md`

**Code Reference**: PLUGIN_SYSTEM_REVIEW.md → "Fix 1: Configurable Timeouts"

**Acceptance Criteria**:
- ✅ Default timeout is 5 seconds (not 30)
- ✅ Timeout is configurable via options
- ✅ Max pending requests per Worker is enforced
- ✅ Clear error messages include timeout value
- ✅ Tests verify timeout behavior

---

### 2. Error Message Sanitization (1 hour)

- [ ] Add `sanitizeError()` private method to `WorkerExecutor`
- [ ] Implement regex patterns to remove sensitive data (passwords, tokens, keys, secrets)
- [ ] Limit error message length (500 chars max)
- [ ] Update `handleWorkerResponse()` to sanitize errors before rejecting
- [ ] Log original errors for debugging (console.error)
- [ ] Add tests for error sanitization
- [ ] Document error handling in README

**Files to Modify**:
- `packages/handlers-workers/executor.ts`
- `packages/handlers-workers/README.md`

**Code Reference**: PLUGIN_SYSTEM_REVIEW.md → "Fix 2: Error Sanitization"

**Acceptance Criteria**:
- ✅ Passwords/tokens/keys/secrets are masked in errors
- ✅ Error messages limited to 500 characters
- ✅ Original errors logged for debugging
- ✅ Tests verify sanitization works
- ✅ User-facing errors don't leak sensitive data

---

### 3. Serialization Validation (3 hours)

- [ ] Add `validateSerializable()` private method to `WorkerExecutor`
- [ ] Implement circular reference detection using `WeakSet`
- [ ] Add size limit check (1MB default)
- [ ] Detect non-serializable types (functions, symbols, RegExp, Map, Set)
- [ ] Call validation in `sendToWorker()` before posting message
- [ ] Add `maxPayloadSize` to `WorkerExecutorOptions`
- [ ] Add comprehensive tests for validation edge cases
- [ ] Document serialization requirements in README

**Files to Modify**:
- `packages/handlers-workers/executor.ts`
- `packages/handlers-workers/types.ts`
- `packages/handlers-workers/README.md`

**Code Reference**: PLUGIN_SYSTEM_REVIEW.md → "Missing Validation for Serializable Data"

**Acceptance Criteria**:
- ✅ Circular references are detected and rejected
- ✅ Functions/symbols are detected and rejected
- ✅ Large payloads (>1MB) are rejected
- ✅ Non-serializable objects (RegExp, Map, Set) are rejected
- ✅ Clear error messages indicate what failed validation
- ✅ Tests cover all edge cases

---

### 4. Filter Error Handling (30 minutes)

- [ ] Wrap filter function calls in try-catch in `PluginService.applyFilter()`
- [ ] Log filter errors with plugin name
- [ ] Fail-safe: return `false` (skip plugin) on filter error
- [ ] Add tests for filter function errors
- [ ] Document filter error behavior in README

**Files to Modify**:
- `packages/handlers/plugins/service.ts`
- `packages/handlers/README.md`

**Code Reference**: PLUGIN_SYSTEM_REVIEW.md → "Fix 3: Filter Error Handling"

**Acceptance Criteria**:
- ✅ Filter errors don't crash the request
- ✅ Errors are logged with plugin name
- ✅ Plugin is skipped when filter throws
- ✅ Tests verify error handling
- ✅ Behavior is documented

---

## 🟡 High Priority (Should Do Soon)

**Estimated Total Effort**: 9 hours

### 5. Worker Integration Tests (4 hours)

- [ ] Create `packages/handlers-workers/tests/` directory
- [ ] Add test Worker fixture (e.g., `fixtures/test-plugin.worker.ts`)
- [ ] Test Worker initialization and message passing
- [ ] Test timeout behavior
- [ ] Test error handling
- [ ] Test concurrent requests
- [ ] Test Worker termination and cleanup
- [ ] Add tests to CI pipeline

**Files to Create**:
- `packages/handlers-workers/tests/integration_test.ts`
- `packages/handlers-workers/tests/fixtures/test-plugin.worker.ts`

**Code Reference**: PLUGIN_SYSTEM_REVIEW.md → "Missing Tests" section

**Acceptance Criteria**:
- ✅ End-to-end tests with real Workers
- ✅ Timeout tests
- ✅ Error handling tests
- ✅ Concurrent request tests
- ✅ Cleanup/termination tests
- ✅ All tests pass in CI

---

### 6. Enhanced Error Context (1 hour)

- [ ] Add `plugin` field to `ErrorContext` interface
- [ ] Include plugin name and `isWorker` flag in context
- [ ] Update error handlers to populate plugin info
- [ ] Update `onError` callback examples in documentation
- [ ] Add tests verifying error context

**Files to Modify**:
- `packages/handlers/types.ts`
- `packages/handlers/plugins/service.ts`
- `packages/handlers/README.md`

**Code Reference**: PLUGIN_SYSTEM_REVIEW.md → "Error Context is Limited"

**Acceptance Criteria**:
- ✅ ErrorContext includes plugin information
- ✅ Plugin name available in error callbacks
- ✅ `isWorker` flag helps distinguish plugin types
- ✅ Documentation updated with examples
- ✅ Tests verify context is populated

---

### 7. Plugin Lifecycle Hooks (2 hours)

- [ ] Add `onStartup` and `onShutdown` to `PluginHooks` interface
- [ ] Update Worker message protocol to support 'startup' and 'shutdown' messages
- [ ] Call `onStartup` after plugin initialization
- [ ] Call `onShutdown` before Worker termination
- [ ] Add timeout for shutdown (don't block forever)
- [ ] Update audit-log plugin to demonstrate usage
- [ ] Add tests for lifecycle hooks
- [ ] Document in README

**Files to Modify**:
- `packages/handlers-workers/types.ts`
- `packages/handlers-workers/executor.ts`
- `packages/plugins/audit-log/worker.ts` (example)
- `packages/handlers/README.md`

**Code Reference**: PLUGIN_SYSTEM_REVIEW.md → "Missing Plugin Lifecycle Hooks"

**Acceptance Criteria**:
- ✅ `onStartup` called after initialization
- ✅ `onShutdown` called before termination
- ✅ Shutdown has timeout (don't block forever)
- ✅ Example plugin demonstrates usage
- ✅ Tests verify lifecycle
- ✅ Documented with use cases

---

### 8. Security Best Practices Guide (2 hours)

- [ ] Create "Security Best Practices" section in handlers/README.md
- [ ] Document Worker permission patterns (Deno & Node)
- [ ] Explain filter function security use cases
- [ ] Document configuration validation patterns
- [ ] Add examples of secure vs insecure configurations
- [ ] Document attack vectors and mitigations
- [ ] Cross-reference from plugins/README.md

**Files to Modify**:
- `packages/handlers/README.md`
- `packages/plugins/README.md`

**Code Reference**: PLUGIN_SYSTEM_REVIEW.md → "Security Best Practices" section

**Acceptance Criteria**:
- ✅ Clear dos and don'ts
- ✅ Permission examples for Deno and Node
- ✅ Filter function security patterns
- ✅ Config validation examples
- ✅ Attack vector explanations
- ✅ Referenced from multiple places

---

## 🔵 Nice to Have (Backlog)

**Estimated Total Effort**: 10 hours

### 9. Helper Factory Functions (3 hours)

- [ ] Add `createAuditLogPlugin()` factory to `plugins/audit-log/mod.ts`
- [ ] Encapsulate Worker creation in factory
- [ ] Handle runtime detection (Deno vs Node)
- [ ] Apply sensible defaults (filter, config)
- [ ] Update example to use factory
- [ ] Update documentation

**Files to Modify**:
- `packages/plugins/audit-log/mod.ts`
- `examples/deno-server/plugins.ts`
- `packages/plugins/README.md`

**Code Reference**: PLUGIN_SYSTEM_REVIEW.md → "Worker Creation Ergonomics"

**Acceptance Criteria**:
- ✅ Simple API: `createAuditLogPlugin(config)`
- ✅ Worker creation hidden
- ✅ Runtime-specific logic handled
- ✅ Example demonstrates usage
- ✅ Better DX than manual Worker creation

---

### 10. Plugin Execution Telemetry (4 hours)

- [ ] Add `PluginTelemetry` interface
- [ ] Add `onPluginExecuted` callback to options
- [ ] Wrap plugin executions with timing
- [ ] Include plugin name, hook type, duration, success/error
- [ ] Add telemetry example to documentation
- [ ] Add tests

**Files to Modify**:
- `packages/handlers-workers/executor.ts`
- `packages/handlers-workers/types.ts`
- `packages/handlers/README.md`

**Code Reference**: PLUGIN_SYSTEM_REVIEW.md → "No Plugin Metrics/Telemetry"

**Acceptance Criteria**:
- ✅ Telemetry callback receives execution events
- ✅ Events include duration, success, errors
- ✅ Example shows integration with metrics service
- ✅ Minimal performance overhead
- ✅ Tests verify telemetry

---

### 11. Extended Filter Context (1 hour)

- [ ] Add `method`, `path`, `headers` to `FilterContext`
- [ ] Populate from request in CRUD handlers
- [ ] Update filter examples in documentation
- [ ] Add tests for extended context

**Files to Modify**:
- `packages/handlers/plugins/types.ts`
- `packages/handlers/crud.ts`
- `packages/handlers/README.md`

**Code Reference**: PLUGIN_SYSTEM_REVIEW.md → "Filter Context Could Include More Info"

**Acceptance Criteria**:
- ✅ Filter can access HTTP method
- ✅ Filter can access URL path
- ✅ Filter can access safe headers
- ✅ Examples demonstrate advanced filtering
- ✅ Tests verify context is populated

---

### 12. Performance Optimization Guide (2 hours)

- [ ] Create "Performance" section in handlers/README.md
- [ ] Document transform blocking behavior
- [ ] Explain fire-and-forget for side effects
- [ ] Document Worker message overhead
- [ ] Provide filter optimization tips
- [ ] Add performance benchmarking example
- [ ] Document when to use in-process vs Worker

**Files to Modify**:
- `packages/handlers/README.md`
- `packages/plugins/README.md`

**Code Reference**: PLUGIN_SYSTEM_REVIEW.md → "Performance Guide"

**Acceptance Criteria**:
- ✅ Clear performance implications
- ✅ Transform latency explained
- ✅ Fire-and-forget best practices
- ✅ Filter optimization tips
- ✅ Benchmarking guidance
- ✅ Architecture decision guide

---

## Progress Tracking

### Overall Progress

- [ ] Critical Fixes (0/4 completed)
- [ ] High Priority (0/4 completed)
- [ ] Nice to Have (0/4 completed)

### By Category

**Security**: 0/4 ⬜⬜⬜⬜  
**Testing**: 0/2 ⬜⬜  
**Documentation**: 0/3 ⬜⬜⬜  
**DX**: 0/3 ⬜⬜⬜  

---

## Review Sign-off

Once all critical fixes are implemented:

- [ ] All 4 critical fixes verified
- [ ] Tests added and passing
- [ ] Documentation updated
- [ ] Code review approved
- [ ] Ready to merge

**Reviewed By**: _____________  
**Date**: _____________  
**Sign-off**: _____________

---

## Notes

- This checklist is derived from the comprehensive peer review
- Each item links back to specific sections in PLUGIN_SYSTEM_REVIEW.md
- Effort estimates are approximate and may vary
- Items can be completed in any order, but critical fixes should be prioritized
- Tests should be added for all changes
- Documentation should be updated for user-facing changes

---

**Generated from**: Plugin System Peer Review (2026-01-22)  
**Review Documents**: 
- [PLUGIN_SYSTEM_REVIEW.md](./PLUGIN_SYSTEM_REVIEW.md)
- [REVIEW_SUMMARY.md](./REVIEW_SUMMARY.md)
