---
name: svelte-error-handling
description: Use when designing, implementing, or reviewing how a SvelteKit app signals, exposes, recovers from, or tests failures.
---

# SvelteKit Error Handling

Use this workflow for changes or reviews involving failure behavior.

Read [examples](references/examples.md) when a concrete typed flow will help.

## Workflow

1. **Trace the failure.** Identify its source and surface: load, action, endpoint, hook, client code, or dependency. Classify it as expected or unexpected.
2. **Verify docs.** Check the relevant [official SvelteKit docs](https://svelte.dev/docs/kit) for the APIs involved; check the installed version when behavior may differ. Do not rely on memory.
3. **Choose the signal.** Use [error-handling patterns](references/error-handling-patterns.md) to decide whether to return an HTTP error, a form failure, a redirect, or let an unexpected exception propagate.
4. **Check for anti-patterns.** Review [anti-patterns](references/anti-patterns.md) for swallowed failures, unsafe output, incorrect status handling, and brittle recovery.
5. **Test unhappy paths.** For every failure path introduced or changed, add or update a test at the narrowest useful level. Assert the failure signal/status and safe user-visible outcome; for forms, also assert submitted values and validation errors are preserved. Run the test. In reviews, check that affected paths have coverage. If a path cannot be tested, report why and the remaining gap; do not call it verified.
6. **Report briefly.** Ground findings in paths. State the behavior changed, failure cases covered, and any test or coverage gap.
