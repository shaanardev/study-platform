# HTTP ingestion response handling

Reviewed source digest for the May 2026 practice pack. Use the linked documentation for platform and runtime details.

Pagination and cursor behavior follow the source API contract. HTTP 429 means rate limiting; Retry-After communicates a delay. Use bounded retries and make writes safe to replay.

Primary reference: [https://www.rfc-editor.org/rfc/rfc9110.html](https://www.rfc-editor.org/rfc/rfc9110.html)
