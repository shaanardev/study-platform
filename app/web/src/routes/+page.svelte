<script lang="ts">
  import { resolve } from '$app/paths';

  import {
    getImportedPacks,
    importPacks,
    importPacksWithApprovedCitations,
    refreshPackCitations,
  } from './packs.remote';

  const packsQuery = getImportedPacks();
  let packs = $derived(await packsQuery);
  let importResult = $derived(importPacks.result?.importResult);

  let approvedImportResult = $derived(
    importPacksWithApprovedCitations.result?.approvedImportResult,
  );

  let refreshResult = $derived(refreshPackCitations.result?.refreshResult);
</script>

<svelte:head>
  <title>Exam pack library</title>
  <meta
    name="description"
    content="Browse locally imported exam question packs and their versions."
  />
</svelte:head>

<main class="app-page">
  <div class="content-width-home mx-auto py-8 sm:py-14 sm:pb-20">
    <header class="mb-10 max-w-165">
      <p class="tracking-eyebrow text-brand mb-2 text-xs font-bold uppercase">
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

    <section
      class="card border-surface-200-800 bg-surface-50-950 mb-12 flex flex-col items-start justify-between gap-6 rounded-2xl border p-6 sm:flex-row sm:items-center"
      aria-labelledby="import-heading"
    >
      <div>
        <p class="tracking-eyebrow text-brand mb-2 text-xs font-bold uppercase">Local import</p>
        <h2 id="import-heading" class="mb-2 text-xl font-semibold tracking-tight">
          Add exam packs
        </h2>
        <p class="text-surface-600-400 mb-2">
          Place versioned JSON packs in
          <code class="bg-surface-200-800 inline-code-size rounded-sm px-1 py-0.5"
            >packs/incoming/</code
          >, then import them here. This reads pack files and sources stored alongside them. It does
          not approve or read any other folder.
        </p>
        <a
          class="text-brand focus-visible:outline-focus-gold font-semibold underline-offset-4 hover:underline focus-visible:outline-3 focus-visible:outline-offset-3"
          href={resolve('/exam-pack.schema.json')}>Read the exam pack JSON schema</a
        >
      </div>
      <form {...importPacks} class="w-full sm:w-auto">
        <button
          class="btn bg-brand hover:bg-brand-hover focus-visible:outline-focus-gold min-h-11 w-full rounded-lg px-4 font-bold whitespace-nowrap text-white focus-visible:outline-3 focus-visible:outline-offset-3 sm:min-w-52"
          type="submit"
        >
          Import packs
        </button>
      </form>
    </section>

    <section
      class="card border-surface-200-800 bg-surface-50-950 mb-6 rounded-2xl border p-6"
      aria-labelledby="approved-import-heading"
    >
      <p class="tracking-eyebrow text-brand mb-2 text-xs font-bold uppercase">
        Optional local file access
      </p>
      <h2 id="approved-import-heading" class="mb-2 text-xl font-semibold tracking-tight">
        Import packs that cite files in another folder
      </h2>
      <p class="text-surface-600-400 mb-4 max-w-180">
        Use this when a new pack has absolute file citations outside its pack folder. The app reads
        only cited files beneath the folder you approve. Their text excerpts are saved locally with
        the imported pack, and the approved folder is recorded with that pack. Ordinary import does
        not approve or read this folder.
      </p>
      <form {...importPacksWithApprovedCitations} class="grid min-w-0 gap-3 sm:max-w-160">
        <label class="text-surface-600-400 block min-w-0 text-sm">
          Local folder for importing cited files
          <input
            {...importPacksWithApprovedCitations.fields.approvedSourceRoot.as('text')}
            class="input app-control-focus mt-1 min-h-11 w-full min-w-0"
            autocomplete="off"
            placeholder="/path/to/source/folder"
          />
          {#each importPacksWithApprovedCitations.fields.approvedSourceRoot.issues() ?? [] as issue (issue.message)}
            <span class="text-error-text mt-1 block" role="alert">{issue.message}</span>
          {/each}
        </label>
        <label class="text-surface-600-400 flex min-w-0 items-start gap-2 text-sm">
          <input
            {...importPacksWithApprovedCitations.fields.approveLocalSourceRoot.as('checkbox')}
            class="checkbox app-control-focus mt-1"
          />
          <span class="min-w-0"
            >I approve reading cited files beneath this folder to import and save excerpts.</span
          >
        </label>
        <button
          class="btn bg-control-fill hover:bg-panel-tint text-brand focus-visible:outline-focus-gold min-h-11 w-full min-w-0 justify-self-start rounded-lg border px-4 font-bold whitespace-normal focus-visible:outline-3 focus-visible:outline-offset-3 sm:w-auto"
          type="submit"
        >
          Import with approved citations
        </button>
      </form>
    </section>

    <section
      class="card border-surface-200-800 bg-surface-50-950 mb-12 rounded-2xl border p-6"
      aria-labelledby="citation-heading"
    >
      <p class="tracking-eyebrow text-brand mb-2 text-xs font-bold uppercase">
        Optional local file access
      </p>
      <h2 id="citation-heading" class="mb-2 text-xl font-semibold tracking-tight">
        Refresh citations from another folder
      </h2>
      <p class="text-surface-600-400 mb-4 max-w-180">
        If an imported pack cites files outside its pack folder, choose and approve the folder that
        contains them. The app reads cited files beneath that folder for matching imported pack
        versions; their text excerpts are saved locally with the pack. The approved folder is
        recorded with each matching pack. Later citation views use the saved excerpts. To import a
        new pack that needs these files, use the approved import form above.
      </p>
      <form {...refreshPackCitations} class="grid min-w-0 gap-3 sm:max-w-160">
        <label class="text-surface-600-400 block min-w-0 text-sm">
          Local folder for refreshing existing pack citations
          <input
            {...refreshPackCitations.fields.approvedSourceRoot.as('text')}
            class="input app-control-focus mt-1 min-h-11 w-full min-w-0"
            autocomplete="off"
            placeholder="/path/to/source/folder"
          />
          {#each refreshPackCitations.fields.approvedSourceRoot.issues() ?? [] as issue (issue.message)}
            <span class="text-error-text mt-1 block" role="alert">{issue.message}</span>
          {/each}
        </label>
        <label class="text-surface-600-400 flex min-w-0 items-start gap-2 text-sm">
          <input
            {...refreshPackCitations.fields.approveLocalSourceRoot.as('checkbox')}
            class="checkbox app-control-focus mt-1"
          />
          <span class="min-w-0"
            >I approve reading cited files beneath this folder to refresh saved excerpts.</span
          >
        </label>
        <button
          class="btn bg-control-fill hover:bg-panel-tint text-brand focus-visible:outline-focus-gold min-h-11 w-full min-w-0 justify-self-start rounded-lg border px-4 font-bold whitespace-normal focus-visible:outline-3 focus-visible:outline-offset-3 sm:w-auto"
          type="submit"
        >
          Refresh approved citations
        </button>
      </form>
    </section>

    {#if approvedImportResult}
      <div
        class="card border-surface-200-800 bg-surface-50-950 -mt-6 mb-10 rounded-2xl border px-4 py-3"
        aria-live="polite"
        role="status"
      >
        {#if approvedImportResult.imported.length > 0}
          <p class="my-1">
            Imported {approvedImportResult.imported.length} pack version(s) with approved citation excerpts
            saved locally. Next, open Practice to start a quiz.
          </p>
        {/if}
        {#if approvedImportResult.refreshed.length > 0}
          <p class="my-1">
            The approved folder's excerpts were refreshed for {approvedImportResult.refreshed
              .length}
            existing pack version(s).
          </p>
        {/if}
        {#if approvedImportResult.unchanged.length > 0}
          <p class="my-1">
            No pack versions changed. Those incoming versions are already in the catalog; choose
            Practice to use one or add a new pack version before importing again.
          </p>
        {/if}
        {#each [...new Set(approvedImportResult.errors)] as message (message)}
          <p class="text-error-text my-1">
            {message} Check the approved folder and incoming pack files, then try again.
          </p>
        {/each}
        {#if approvedImportResult.imported.length === 0 && approvedImportResult.refreshed.length === 0 && approvedImportResult.unchanged.length === 0 && approvedImportResult.errors.length === 0}
          <p class="my-1">
            No pack files were available to import. Add the pack JSON to
            <code>packs/incoming/</code> and try again.
          </p>
        {/if}
      </div>
    {/if}

    {#if importResult}
      <div
        class="card border-card-border -mt-6 mb-10 rounded-2xl border bg-white px-4 py-3"
        aria-live="polite"
        role="status"
      >
        {#if importResult.imported.length > 0}
          <p class="my-1">
            Imported {importResult.imported.length} pack version(s). Next, open Practice to start a quiz.
          </p>
        {/if}
        {#if importResult.unchanged.length > 0}
          <p class="my-1">
            No new pack versions were imported. The incoming versions are already in the catalog;
            choose Practice to use one, or add a new pack version before importing again.
          </p>
        {/if}
        {#each [...new Set(importResult.errors)] as message (message)}
          <p class="text-error-text my-1">
            {message} Check the JSON pack files in <code>packs/incoming/</code>, then import again.
            If a new pack needs files from another folder, use the approved import form below.
          </p>
        {/each}
        {#if importResult.imported.length === 0 && importResult.refreshed.length === 0 && importResult.unchanged.length === 0 && importResult.errors.length === 0}
          <p class="my-1">
            No pack files were available to import. Add the bundled sample or another JSON pack to
            <code>packs/incoming/</code> and try again.
          </p>
        {/if}
      </div>
    {/if}

    {#if refreshResult}
      <div
        class="card border-card-border -mt-6 mb-10 rounded-2xl border bg-white px-4 py-3"
        aria-live="polite"
        role="status"
      >
        {#if refreshResult.refreshed.length > 0}
          <p class="my-1">
            Refreshed citation excerpts for {refreshResult.refreshed.length} imported pack version(s).
            The excerpts are stored locally with each matching pack.
          </p>
        {/if}
        {#if refreshResult.unchanged.length > 0}
          <p class="my-1">
            No citations were refreshed for {refreshResult.unchanged.length} pack file(s). Check that
            the exact pack version is already imported and cites local files beneath the approved folder.
          </p>
        {/if}
        {#each [...new Set(refreshResult.errors)] as message (message)}
          <p class="text-error-text my-1">
            {message} Check the approved folder and imported pack files, then try again.
          </p>
        {/each}
        {#if refreshResult.refreshed.length === 0 && refreshResult.unchanged.length === 0 && refreshResult.errors.length === 0}
          <p class="my-1">
            No pack files were available to refresh. Add the pack file to
            <code>packs/incoming/</code> and confirm its matching version is imported.
          </p>
        {/if}
      </div>
    {/if}

    <section aria-labelledby="catalog-heading">
      <div class="mb-4 flex items-center justify-between gap-4">
        <div>
          <p class="tracking-eyebrow text-brand mb-2 text-xs font-bold uppercase">
            Your local catalog
          </p>
          <h2 id="catalog-heading" class="mb-0 text-xl font-semibold tracking-tight">
            Imported exam packs
          </h2>
        </div>
        <p class="text-surface-600-400 m-0 text-sm">
          {packs.length}
          version{packs.length === 1 ? '' : 's'}
        </p>
      </div>

      {#if packs.length === 0}
        <div class="card border-surface-200-800 bg-surface-50-950 rounded-2xl border p-8">
          <h3 class="mb-2 text-lg font-semibold">No imported packs yet</h3>
          <p>
            The clearly labelled synthetic sample is ready in
            <code
              class="bg-surface-200-800 inline-code-size rounded-sm px-1 py-0.5 break-all whitespace-normal"
              >packs/incoming/sample-learning-pack.json</code
            >. Choose <strong>Import packs</strong> above to add it to this catalog.
          </p>
          <p class="mb-0">
            After import, choose Practice in the navigation to start a quiz. Citation refresh is
            optional and only needed when the pack refers to files in another folder.
          </p>
        </div>
      {:else}
        <div class="pack-card-grid grid gap-4">
          {#each packs as pack (`${pack.examId}:${pack.packId}:${pack.packVersion}`)}
            <article class="card border-card-border rounded-2xl border bg-white p-5">
              <div class="mb-3 flex items-center justify-between gap-4">
                <p class="tracking-eyebrow text-brand mb-0 text-xs font-bold uppercase">
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
                    <span>{domain.title}</span><strong class="text-brand">{domain.weight}%</strong>
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
