<script lang="ts">
  import { resolve } from '$app/paths';

  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();
</script>

<svelte:head>
  <title>Exam pack library</title>
  <meta
    name="description"
    content="Browse locally imported exam question packs and their versions."
  />
</svelte:head>

<main class="preset-filled-surface-100-900 min-h-screen font-sans">
  <div class="content-width-home mx-auto py-8 sm:py-14 sm:pb-20">
    <header class="mb-10 max-w-165">
      <p class="tracking-eyebrow text-primary-700-300 mb-2 text-xs font-bold uppercase">
        Local study library
      </p>
      <h1 class="text-page-title-large leading-page-title tracking-page-title mb-3 font-bold">
        Exam pack library
      </h1>
      <p class="measure-reading text-surface-600-400 mb-0 text-base/relaxed sm:text-lg">
        Browse question packs stored on this device. Packs are imported only when you choose to
        import them.
      </p>
    </header>

    <nav class="mb-8 flex flex-wrap items-center gap-x-4 gap-y-3" aria-label="Study tools">
      <a
        class="btn preset-filled-primary-700-300 focus-visible:outline-focus-amber min-h-11 no-underline focus-visible:outline-3 focus-visible:outline-offset-3"
        href={resolve('/practice')}>Start or resume a practice quiz →</a
      >
      <a
        class="text-primary-700-300 focus-visible:outline-focus-amber font-semibold underline-offset-4 hover:underline focus-visible:outline-3 focus-visible:outline-offset-3"
        href={resolve('/progress')}>Review progress and mistakes →</a
      >
      <a
        class="text-primary-700-300 focus-visible:outline-focus-amber font-semibold underline-offset-4 hover:underline focus-visible:outline-3 focus-visible:outline-offset-3"
        href={resolve('/mock')}>Take a timed mock exam →</a
      >
      <a
        class="text-primary-700-300 focus-visible:outline-focus-amber font-semibold underline-offset-4 hover:underline focus-visible:outline-3 focus-visible:outline-offset-3"
        href={resolve('/review')}>Flag or correct questions →</a
      >
    </nav>

    <section
      class="card border-surface-200-800 bg-surface-50-950 mb-12 flex flex-col items-start justify-between gap-6 rounded-2xl border p-6 sm:flex-row sm:items-center"
      aria-labelledby="import-heading"
    >
      <div>
        <p class="tracking-eyebrow text-primary-700-300 mb-2 text-xs font-bold uppercase">
          Local import
        </p>
        <h2 id="import-heading" class="mb-2 text-xl font-semibold tracking-tight">
          Add exam packs
        </h2>
        <p class="text-surface-600-400 mb-2">
          Place versioned JSON packs in
          <code class="bg-surface-200-800 inline-code-size rounded-sm px-1 py-0.5"
            >packs/incoming/</code
          >, then import them here. Reimport the same pack with its approved source root to refresh
          local citations without changing pack content or progress.
        </p>
        <a
          class="text-primary-700-300 focus-visible:outline-focus-amber font-semibold underline-offset-4 hover:underline focus-visible:outline-3 focus-visible:outline-offset-3"
          href={resolve('/exam-pack.schema.json')}>Read the exam pack JSON schema</a
        >
      </div>
      <form class="w-full sm:w-auto" action={resolve('/?/import')} method="POST">
        <label class="text-surface-600-400 mb-3 block text-sm">
          Approved local source root for absolute file citations
          <input
            name="approvedSourceRoot"
            class="input mt-1 min-h-11 w-full"
            autocomplete="off"
            placeholder="/path/to/source/folder"
            type="text"
          />
        </label>
        <label class="text-surface-600-400 mb-3 flex items-start gap-2 text-sm">
          <input name="approveLocalSourceRoot" class="mt-1" type="checkbox" />
          <span>
            I approve reading cited files beneath this folder during import. Their excerpts will be
            saved with the pack.
          </span>
        </label>
        <button
          class="btn preset-filled-primary-700-300 focus-visible:outline-focus-amber min-h-11 w-full whitespace-nowrap focus-visible:outline-3 focus-visible:outline-offset-3"
          type="submit"
        >
          Import or refresh local citations
        </button>
      </form>
    </section>

    {#if form?.importResult}
      <div
        class="card border-surface-200-800 bg-surface-50-950 -mt-6 mb-10 rounded-2xl border px-4 py-3"
        aria-live="polite"
        role="status"
      >
        {#if form.importResult.imported.length > 0}
          <p class="my-1">Imported {form.importResult.imported.length} pack version(s).</p>
        {/if}
        {#if form.importResult.refreshed.length > 0}
          <p class="my-1">
            Reapproved and refreshed local citations for {form.importResult.refreshed.length}
            existing pack version(s).
          </p>
        {/if}
        {#each form.importResult.errors as message (message)}
          <p class="text-error-700-300 my-1">{message}</p>
        {/each}
        {#if form.importResult.imported.length === 0 && form.importResult.refreshed.length === 0 && form.importResult.errors.length === 0}
          <p class="my-1">No new pack versions were imported.</p>
        {/if}
      </div>
    {/if}

    <section aria-labelledby="catalog-heading">
      <div class="mb-4 flex items-center justify-between gap-4">
        <div>
          <p class="tracking-eyebrow text-primary-700-300 mb-2 text-xs font-bold uppercase">
            Your local catalog
          </p>
          <h2 id="catalog-heading" class="mb-0 text-xl font-semibold tracking-tight">
            Imported exam packs
          </h2>
        </div>
        <p class="text-surface-600-400 m-0 text-sm">
          {data.packs.length}
          version{data.packs.length === 1 ? '' : 's'}
        </p>
      </div>

      {#if data.packs.length === 0}
        <div class="card border-surface-200-800 bg-surface-50-950 rounded-2xl border p-8">
          <h3 class="mb-2 text-lg font-semibold">No imported packs yet</h3>
          <p>
            The clearly labelled synthetic sample is ready in
            <code class="bg-surface-200-800 inline-code-size rounded-sm px-1 py-0.5"
              >packs/incoming/</code
            >.
          </p>
          <p class="mb-0">Use the import button above to add it to this catalog.</p>
        </div>
      {:else}
        <div class="pack-card-grid grid gap-4">
          {#each data.packs as pack (`${pack.examId}:${pack.packId}:${pack.packVersion}`)}
            <article class="card border-surface-200-800 bg-surface-50-950 rounded-2xl border p-5">
              <div class="mb-3 flex items-center justify-between gap-4">
                <p class="tracking-eyebrow text-primary-700-300 mb-0 text-xs font-bold uppercase">
                  {pack.examTitle}
                  · exam {pack.examVersion}
                </p>
                {#if pack.synthetic}
                  <span class="badge preset-tonal-primary whitespace-nowrap">Synthetic sample</span>
                {/if}
              </div>
              <h3 class="mb-1 text-xl font-semibold">{pack.packTitle}</h3>
              <p class="text-surface-600-400 mb-2 text-sm">Pack version {pack.packVersion}</p>
              <p class="text-surface-600-400 mb-2 text-sm">
                {pack.questionCount}
                questions · {pack.domainCount} domains
              </p>
              <ul
                class="border-surface-200-800 mt-4 mb-0 list-none border-t p-0 pt-2"
                aria-label="Exam domains and weights"
              >
                {#each pack.domains as domain (domain.id)}
                  <li class="flex justify-between gap-4 py-1 text-sm">
                    <span>{domain.title}</span><strong class="text-primary-700-300"
                      >{domain.weight}%</strong
                    >
                  </li>
                {/each}
              </ul>
            </article>
          {/each}
        </div>
      {/if}
    </section>
  </div>
</main>
