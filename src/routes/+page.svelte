<script lang="ts">
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();
</script>

<svelte:head>
  <title>Exam pack library</title>
  <meta
    name="description"
    content="Browse locally imported exam question packs and their versions."
  >
</svelte:head>

<main class="min-h-screen bg-surface-100-900 font-sans text-surface-900-50">
  <div class="mx-auto w-[min(100%-2rem,960px)] py-8 sm:py-14 sm:pb-20">
    <header class="mb-10 max-w-165">
      <p class="mb-2 text-xs font-bold tracking-[0.09em] text-primary-700-300 uppercase">
        Ordewell · local study library
      </p>
      <h1
        class="mb-3 text-[clamp(2.25rem,6vw,3.5rem)] leading-[1.05] font-bold tracking-[-0.045em]"
      >
        Exam pack library
      </h1>
      <p class="mb-0 max-w-[54ch] text-base leading-relaxed text-surface-600-400 sm:text-lg">
        Browse question packs stored on this device. Packs are imported only when you choose to
        import them.
      </p>
    </header>

    <nav class="mb-8 flex flex-wrap items-center gap-x-4 gap-y-3" aria-label="Study tools">
      <a
        class="btn preset-filled-primary-700-300 min-h-11 no-underline focus-visible:outline-3 focus-visible:outline-amber-500 focus-visible:outline-offset-3"
        href="/practice"
        >Start or resume a practice quiz →</a
      >
      <a
        class="font-semibold text-primary-700-300 underline-offset-4 hover:underline focus-visible:outline-3 focus-visible:outline-amber-500 focus-visible:outline-offset-3"
        href="/progress"
        >Review progress and mistakes →</a
      >
      <a
        class="font-semibold text-primary-700-300 underline-offset-4 hover:underline focus-visible:outline-3 focus-visible:outline-amber-500 focus-visible:outline-offset-3"
        href="/mock"
        >Take a timed mock exam →</a
      >
      <a
        class="font-semibold text-primary-700-300 underline-offset-4 hover:underline focus-visible:outline-3 focus-visible:outline-amber-500 focus-visible:outline-offset-3"
        href="/review"
        >Flag or correct questions →</a
      >
    </nav>

    <section
      class="card mb-12 flex flex-col items-start justify-between gap-6 rounded-2xl border border-surface-200-800 bg-surface-50-950 p-6 sm:flex-row sm:items-center"
      aria-labelledby="import-heading"
    >
      <div>
        <p class="mb-2 text-xs font-bold tracking-[0.09em] text-primary-700-300 uppercase">
          Local import
        </p>
        <h2 id="import-heading" class="mb-2 text-xl font-semibold tracking-tight">
          Add exam packs
        </h2>
        <p class="mb-2 text-surface-600-400">
          Place versioned JSON packs in
          <code class="rounded bg-surface-200-800 px-1 py-0.5 text-[0.9em]">packs/incoming/</code>,
          then import them here.
        </p>
        <a
          class="font-semibold text-primary-700-300 underline-offset-4 hover:underline focus-visible:outline-3 focus-visible:outline-amber-500 focus-visible:outline-offset-3"
          href="/exam-pack.schema.json"
          >Read the exam pack JSON schema</a
        >
      </div>
      <form method="POST" action="?/import" class="w-full sm:w-auto">
        <button
          class="btn preset-filled-primary-700-300 min-h-11 w-full whitespace-nowrap focus-visible:outline-3 focus-visible:outline-amber-500 focus-visible:outline-offset-3 sm:w-auto"
          type="submit"
        >
          Import packs from local folder
        </button>
      </form>
    </section>

    {#if form?.importResult}
      <div
        class="card -mt-6 mb-10 rounded-2xl border border-surface-200-800 bg-surface-50-950 px-4 py-3"
        role="status"
        aria-live="polite"
      >
        {#if form.importResult.imported.length > 0}
          <p class="my-1">Imported {form.importResult.imported.length} pack version(s).</p>
        {/if}
        {#each form.importResult.errors as message (message)}
          <p class="my-1 text-error-700-300">{message}</p>
        {/each}
        {#if form.importResult.imported.length === 0 && form.importResult.errors.length === 0}
          <p class="my-1">No new pack versions were imported.</p>
        {/if}
      </div>
    {/if}

    <section aria-labelledby="catalog-heading">
      <div class="mb-4 flex items-center justify-between gap-4">
        <div>
          <p class="mb-2 text-xs font-bold tracking-[0.09em] text-primary-700-300 uppercase">
            Your local catalog
          </p>
          <h2 id="catalog-heading" class="mb-0 text-xl font-semibold tracking-tight">
            Imported exam packs
          </h2>
        </div>
        <p class="m-0 text-sm text-surface-600-400">
          {data.packs.length}
          version{data.packs.length === 1 ? '' : 's'}
        </p>
      </div>

      {#if data.packs.length === 0}
        <div class="card rounded-2xl border border-surface-200-800 bg-surface-50-950 p-8">
          <h3 class="mb-2 text-lg font-semibold">No imported packs yet</h3>
          <p>
            The clearly labelled synthetic sample is ready in
            <code class="rounded bg-surface-200-800 px-1 py-0.5 text-[0.9em]">packs/incoming/</code
            >.
          </p>
          <p class="mb-0">Use the import button above to add it to this catalog.</p>
        </div>
      {:else}
        <div class="grid grid-cols-[repeat(auto-fit,minmax(min(100%,340px),1fr))] gap-4">
          {#each data.packs as pack (`${pack.examId}:${pack.packId}:${pack.packVersion}`)}
            <article class="card rounded-2xl border border-surface-200-800 bg-surface-50-950 p-5">
              <div class="mb-3 flex items-center justify-between gap-4">
                <p class="mb-0 text-xs font-bold tracking-[0.09em] text-primary-700-300 uppercase">
                  {pack.examTitle}
                  · exam {pack.examVersion}
                </p>
                {#if pack.synthetic}
                  <span class="badge preset-tonal-primary whitespace-nowrap">Synthetic sample</span>
                {/if}
              </div>
              <h3 class="mb-1 text-xl font-semibold">{pack.packTitle}</h3>
              <p class="mb-2 text-sm text-surface-600-400">Pack version {pack.packVersion}</p>
              <p class="mb-2 text-sm text-surface-600-400">
                {pack.questionCount}
                questions · {pack.domainCount} domains
              </p>
              <ul
                class="mt-4 mb-0 list-none border-t border-surface-200-800 p-0 pt-2"
                aria-label="Exam domains and weights"
              >
                {#each pack.domains as domain (domain.id)}
                  <li class="flex justify-between gap-4 py-1 text-sm">
                    <span>{domain.title}</span
                    ><strong class="text-primary-700-300">{domain.weight}%</strong>
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
