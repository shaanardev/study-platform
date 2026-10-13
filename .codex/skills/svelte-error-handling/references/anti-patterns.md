# Error-handling anti-patterns

Flag these when they obscure the failure, mislead clients, leak data, or make recovery unsafe. Prefer the smallest fix that restores correct behavior.

- **Catch-all 500:** A broad catch maps not-found, forbidden, and unexpected failures to 500. Preserve known statuses; use 500 for unclassified faults.
- **Swallowed exception:** An empty catch or `return null` hides a failed operation. Handle it deliberately with a reason, or let it propagate.
- **Control flow swallowed by catch:** A broad catch intercepts a framework error or redirect. Narrow the catch or preserve framework control flow.
- **Internal details in responses:** A page or endpoint exposes raw exceptions, stack traces, SQL, paths, secrets, or another user's data. Return safe copy; keep diagnostics server-side.
- **Sensitive logging:** Whole request, response, or error objects can contain credentials or personal data. Log a curated, redacted shape.
- **Validation as an exception:** Invalid form input is thrown or reported as an operational error. Return field errors and preserve submitted values.
- **Redirect used as an error:** A not-found or forbidden case redirects to a generic page. Preserve the actual HTTP status.
- **HTTP 200 for failure:** An endpoint reports failure only in its response body. Use an appropriate failure status so clients and monitoring can detect it.
- **Duplicated domain mapping:** Routes independently translate the same domain failures and drift. Share a small mapping when repetition warrants it.
- **Unsafe retries:** Retries are unbounded, lack backoff, or repeat non-idempotent work. Bound retries to transient failures and protect writes from duplication.
- **Domain and UI copy coupled:** Domain or driver messages are shown directly, or domain code owns presentation text. Map stable error codes to safe UI copy at the boundary.
- **Client boundary trusted for server failures:** A client error page or hook is assumed to protect load, action, or endpoint code. Handle server failures on the server.
- **Outdated API syntax:** Code follows remembered or deprecated SvelteKit behavior. Verify docs for the installed version before changing it.
