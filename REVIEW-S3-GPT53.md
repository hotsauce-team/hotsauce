# Review: ErrorContext and PluginErrorContext Unification

## Findings

### 1. High: Plugin bridge still bypasses options.onError for plugin-executor errors

- Location: [packages/cms/mod.ts](packages/cms/mod.ts#L843), [packages/cms/mod.ts](packages/cms/mod.ts#L844), [packages/cms/mod.ts](packages/cms/mod.ts#L846)
- Issue: The comment says both plugin error paths call onError with hookContext, but the bridge callback only calls console.error.
- Impact: Fire-and-forget and worker-path plugin failures can bypass the integrator's configured error pipeline.
- Recommendation: In pluginOnError, forward to options.onError first (with plugin metadata populated), then optionally console.error as fallback when no handler exists.

### 2. Medium: hookContext is not consistently populated across worker plugin paths

- Location: [packages/workers/executor.ts](packages/workers/executor.ts#L379), [packages/workers/executor.ts](packages/workers/executor.ts#L432), [packages/workers/executor.ts](packages/workers/executor.ts#L520), [packages/workers/executor.ts](packages/workers/executor.ts#L724), [packages/workers/executor.ts](packages/workers/executor.ts#L285)
- Issue: hookContext exists on PluginErrorContext, but several sendToWorker calls do not pass the hookContext argument.
- Impact: Consumers cannot reliably depend on hookContext being present for diagnostics.
- Recommendation: Pass hookContext for all operations where context exists (beforeSave, afterRead, renderField, route:render), and include it in direct onError calls when response validation fails.

### 3. Medium: Blocking action hook failures remain swallowed at execution boundary

- Location: [packages/workers/executor.ts](packages/workers/executor.ts#L663)
- Issue: Blocking hooks are awaited with Promise.allSettled, which resolves even when a blocking plugin hook fails.
- Impact: Runtime behavior conflicts with blocking semantics, and upstream callers cannot fail the request based on blocking hook errors.
- Recommendation: Use Promise.all for blocking hooks, or inspect allSettled results and throw when any blocking hook rejects.

### 4. Low: plugin field on ErrorContext is under-populated in plugin route catches

- Location: [packages/cms/types.ts](packages/cms/types.ts#L287), [packages/cms/mod.ts](packages/cms/mod.ts#L635), [packages/cms/mod.ts](packages/cms/mod.ts#L654)
- Issue: ErrorContext now includes plugin, but plugin route error catches call options.onError without setting plugin.
- Impact: Logging/alerting cannot reliably attribute route errors to a plugin despite type support.
- Recommendation: Populate plugin in plugin-route catches where plugin.name is already known.

## Open Questions

1. Should blocking action hooks fail the HTTP operation, or should they only log and continue?
2. Is hookContext intended to contain full raw context, or should sensitive fields be redacted before logging?
3. Should plugin bridge errors always include action and operation so error grouping can distinguish action hooks vs UI hooks vs transforms?

## Secondary Summary

- Positive: The commit improves in-process error reporting coverage and adds strong test coverage for hookContext cases in worker executor tests.
- Main gap: The integration bridge in CMS still does not forward plugin executor errors into options.onError, so unification is partial.

## Validation Performed

- Ran: deno test -P packages/workers/executor_test.ts
- Ran: deno test -P packages/cms/tests/handler_test.ts
- Result: Both test files passed in current branch state, including new hookContext tests.
