# Error-handling patterns

Choose the signal that matches the outcome. Check the official docs for current API details.

- **Expected request failure:** Use SvelteKit's `error(status, body)` for expected outcomes such as missing, unauthenticated, forbidden, or malformed requests. Return the real status and a safe body.
- **Correctable form input:** Use `fail(status, data)` in a form action to return field errors and submitted values so the user can correct the form in place. Do not treat ordinary validation as an exception.
- **Navigation:** Use `redirect(status, location)` when the correct outcome is to navigate, such as after success or to sign in. Keep not-found and forbidden outcomes as errors so their status is preserved.
- **Unexpected failure:** Let unclassified exceptions reach the app's unexpected-error handling, such as a configured `handleError`. Keep details out of the response; log useful, redacted diagnostics at the boundary.
- **Domain failure:** Keep domain logic independent of HTTP and UI copy. Map known domain errors to the appropriate HTTP or form result at the route/action boundary; centralize repeated mappings.
- **Caught failures:** Keep `try/catch` narrow. If a catch can intercept framework errors or redirects, preserve their control flow and rethrow unknown failures instead of silently converting them.
- **Dependency failure:** Set a timeout before adding retries. Retry only transient failures for idempotent work, with a cap and backoff. Degrade gracefully only when the result remains correct for the user.
- **Error boundaries:** Add a nested error page when a route subtree should fail independently; use a root boundary when that is enough for the app.

Expose only actionable user-safe copy and, where useful, a stable error code or correlation id. Keep stack traces, SQL, secrets, internal paths, and raw driver messages in redacted diagnostics.
