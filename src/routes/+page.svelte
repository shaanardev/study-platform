<script lang="ts">
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

<main class="library">
  <header class="masthead">
    <p class="eyebrow">Ordewell · local study library</p>
    <h1>Exam pack library</h1>
    <p class="intro">
      Browse question packs stored on this device. Packs are imported only when you choose to
      import them.
    </p>
  </header>

  <p><a class="practice-link" href="/practice">Start or resume a practice quiz →</a></p>

  <section class="import-panel" aria-labelledby="import-heading">
    <div>
      <p class="eyebrow">Local import</p>
      <h2 id="import-heading">Add exam packs</h2>
      <p>Place versioned JSON packs in <code>packs/incoming/</code>, then import them here.</p>
      <a href="/exam-pack.schema.json">Read the exam pack JSON schema</a>
    </div>
    <form method="POST" action="?/import">
      <button type="submit">Import packs from local folder</button>
    </form>
  </section>

  {#if form?.importResult}
    <div class="notice" role="status" aria-live="polite">
      {#if form.importResult.imported.length > 0}
        <p>Imported {form.importResult.imported.length} pack version(s).</p>
      {/if}
      {#each form.importResult.errors as message (message)}
        <p class="error">{message}</p>
      {/each}
      {#if form.importResult.imported.length === 0 && form.importResult.errors.length === 0}
        <p>No new pack versions were imported.</p>
      {/if}
    </div>
  {/if}

  <section aria-labelledby="catalog-heading">
    <div class="section-heading">
      <div>
        <p class="eyebrow">Your local catalog</p>
        <h2 id="catalog-heading">Imported exam packs</h2>
      </div>
      <p class="count">{data.packs.length} version{data.packs.length === 1 ? '' : 's'}</p>
    </div>

    {#if data.packs.length === 0}
      <div class="empty-state">
        <h3>No imported packs yet</h3>
        <p>The clearly labelled synthetic sample is ready in <code>packs/incoming/</code>.</p>
        <p>Use the import button above to add it to this catalog.</p>
      </div>
    {:else}
      <div class="pack-list">
        {#each data.packs as pack (`${pack.examId}:${pack.packId}:${pack.packVersion}`)}
          <article class="pack-card">
            <div class="card-topline">
              <p class="eyebrow">{pack.examTitle} · exam {pack.examVersion}</p>
              {#if pack.synthetic}<span class="badge">Synthetic sample</span>{/if}
            </div>
            <h3>{pack.packTitle}</h3>
            <p class="version">Pack version {pack.packVersion}</p>
            <p class="stats">{pack.questionCount} questions · {pack.domainCount} domains</p>
            <ul class="domains" aria-label="Exam domains and weights">
              {#each pack.domains as domain (domain.id)}
                <li><span>{domain.title}</span><strong>{domain.weight}%</strong></li>
              {/each}
            </ul>
          </article>
        {/each}
      </div>
    {/if}
  </section>
</main>

<style>
  :global(body) {
    margin: 0;
    background: #f4f5f2;
    color: #20251f;
    font-family: Inter, ui-sans-serif, system-ui, sans-serif;
  }

  .library {
    width: min(100% - 2rem, 960px);
    margin: 0 auto;
    padding: 3.5rem 0 5rem;
  }

  .masthead {
    max-width: 660px;
    margin-bottom: 2.5rem;
  }

  .eyebrow {
    margin: 0 0 0.65rem;
    color: #536c57;
    font-size: 0.75rem;
    font-weight: 750;
    letter-spacing: 0.09em;
    text-transform: uppercase;
  }

  h1,
  h2,
  h3,
  p {
    margin-top: 0;
  }

  h1 {
    margin-bottom: 0.65rem;
    font-size: clamp(2.25rem, 6vw, 3.5rem);
    letter-spacing: -0.045em;
    line-height: 1.05;
  }

  h2 {
    margin-bottom: 0.45rem;
    font-size: 1.3rem;
    letter-spacing: -0.02em;
  }

  .intro {
    max-width: 54ch;
    margin-bottom: 0;
    color: #5e665e;
    font-size: 1.05rem;
    line-height: 1.65;
  }

  .import-panel,
  .empty-state,
  .pack-card,
  .notice {
    border: 1px solid #dce1d9;
    border-radius: 16px;
    background: #fff;
  }

  .import-panel {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1.5rem;
    margin-bottom: 3rem;
    padding: 1.5rem;
  }

  .import-panel p:not(.eyebrow) {
    margin-bottom: 0.55rem;
    color: #5e665e;
  }

  a {
    color: #28553a;
    font-weight: 650;
  }

  .practice-link {
    display: inline-flex;
    border-radius: 8px;
    background: #28553a;
    padding: 0.8rem 1rem;
    color: #fff;
    text-decoration: none;
  }

  code {
    border-radius: 4px;
    background: #eef2eb;
    padding: 0.12rem 0.32rem;
    font-size: 0.9em;
  }

  button {
    min-height: 46px;
    border: 0;
    border-radius: 9px;
    background: #28553a;
    padding: 0.75rem 1rem;
    color: #fff;
    font: inherit;
    font-weight: 700;
    white-space: nowrap;
    cursor: pointer;
  }

  button:hover {
    background: #1e432d;
  }

  button:focus-visible,
  a:focus-visible {
    outline: 3px solid #d29537;
    outline-offset: 3px;
  }

  .notice {
    margin: -1.5rem 0 2.5rem;
    padding: 0.8rem 1.1rem;
  }

  .notice p {
    margin: 0.3rem 0;
  }

  .error {
    color: #9d3028;
  }

  .section-heading,
  .card-topline {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .section-heading {
    margin-bottom: 1.1rem;
  }

  .section-heading .eyebrow,
  .card-topline .eyebrow {
    margin-bottom: 0.45rem;
  }

  .count,
  .version,
  .stats {
    color: #687168;
    font-size: 0.9rem;
  }

  .count {
    margin: 0;
  }

  .empty-state {
    padding: 2rem;
  }

  .empty-state h3 {
    margin-bottom: 0.5rem;
  }

  .empty-state p:last-child {
    margin-bottom: 0;
  }

  .pack-list {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 340px), 1fr));
    gap: 1rem;
  }

  .pack-card {
    padding: 1.35rem;
  }

  .pack-card h3 {
    margin-bottom: 0.25rem;
    font-size: 1.2rem;
  }

  .version,
  .stats {
    margin-bottom: 0.45rem;
  }

  .badge {
    border-radius: 99px;
    background: #edf4e9;
    padding: 0.35rem 0.6rem;
    color: #315a3e;
    font-size: 0.74rem;
    font-weight: 750;
    white-space: nowrap;
  }

  .domains {
    margin: 1rem 0 0;
    border-top: 1px solid #e7eae5;
    padding: 0.55rem 0 0;
    list-style: none;
  }

  .domains li {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.35rem 0;
    font-size: 0.9rem;
  }

  .domains strong {
    color: #405747;
  }

  @media (max-width: 680px) {
    .library {
      padding-top: 2rem;
    }

    .import-panel {
      align-items: flex-start;
      flex-direction: column;
    }

    button {
      width: 100%;
    }
  }
</style>
