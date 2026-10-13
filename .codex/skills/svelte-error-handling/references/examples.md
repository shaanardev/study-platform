# Typed error-handling examples

Use these as shapes to adapt. Keep generated route types and check current SvelteKit docs before copying an API.

## 1. Server failure to error page

An expected missing record becomes a 404. An unexpected loader exception is logged with a request id and reaches the page with safe text. The client hook handles browser errors separately.

```text
src/
├── app.d.ts
├── hooks.server.ts
├── hooks.client.ts
└── routes/
    ├── +error.svelte
    └── reports/[id]/+page.server.ts
```

```ts
// src/app.d.ts
declare global {
  namespace App {
    interface Error { requestId?: string }
    interface Locals { requestId: string }
  }
}

export {};
```

`App.Error` already includes `status` and `message`; add only app-specific fields.

```ts
// src/hooks.server.ts
import type { Handle, HandleServerError } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
  event.locals.requestId = crypto.randomUUID();
  return resolve(event);
};

export const handleError: HandleServerError = ({ error, event, kind }) => {
  if (kind === 'app') return error; // error() bodies must be user-safe

  const requestId = event.locals.requestId;
  if (kind !== 'unknown') return { ...error, requestId };

  return { message: 'Something went wrong.', requestId };
};
```

```ts
// src/routes/reports/[id]/+page.server.ts
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getReport } from '$lib/server/reports';

export const load: PageServerLoad = async ({ params }) => {
  const report = await getReport(params.id); // let unexpected failures propagate
  if (!report) error(404, 'Report not found.');
  return { report };
};
```

```ts
// src/hooks.client.ts
import type { HandleClientError } from '@sveltejs/kit';

export const handleError: HandleClientError = ({ error, kind }) => {
  if (kind === 'app') return error;

  const requestId = crypto.randomUUID();
  if (kind === 'framework') return { ...error, requestId };

  return { message: 'Something went wrong in your browser.', requestId };
};
```

```svelte
<!-- src/routes/+error.svelte -->
<script lang="ts">
  import { page } from '$app/state';
</script>

{#if page.status === 404}
  <h1>Not found</h1>
  <p>{page.error?.message}</p>
{:else}
  <h1>Something went wrong</h1>
  <p>{page.error?.message ?? 'Please try again.'}</p>
{/if}

{#if page.error?.requestId}
  <p>Reference: {page.error.requestId}</p>
{/if}
```

The server hook handles server failures; the client hook handles browser failures. Both return only safe `App.Error` fields. Use an app-owned reporting adapter that redacts secrets and personal data.

## 2. Form validation stays on the form

Return `fail(...)` for correctable input and preserve its value. Let database or programming failures throw into the unexpected-error path.

```ts
// src/routes/settings/email/+page.server.ts
import { fail } from '@sveltejs/kit';
import type { Actions } from './$types';
import { saveEmail } from '$lib/server/account';

export const actions: Actions = {
  default: async ({ request }) => {
    const form = await request.formData();
    const email = String(form.get('email') ?? '').trim();

    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return fail(400, {
        values: { email },
        errors: { email: 'Enter a valid email.' }
      });
    }

    await saveEmail(email); // unexpected failures propagate
    return { saved: true };
  }
};
```

```svelte
<!-- src/routes/settings/email/+page.svelte -->
<script lang="ts">
  import type { PageProps } from './$types';
  let { form }: PageProps = $props();
</script>

<form method="POST">
  <label for="email">Email</label>
  <input id="email" name="email" type="email" value={form?.values?.email ?? ''} />
  {#if form?.errors?.email}<p>{form.errors.email}</p>{/if}
  {#if form?.saved}<p>Email updated.</p>{/if}
  <button>Save</button>
</form>
```
