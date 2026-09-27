<script lang="ts">
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();
  let selectedPack = $derived(data.pack);
  let feedbackByQuestion = $derived(new Map(data.feedback.map((item) => [item.questionId, item])));

  function correctionJson(questionId: string) {
    const question = selectedPack?.questions.find((item) => item.id === questionId);
    const existing = feedbackByQuestion.get(questionId)?.correction;
    const correction =
      existing ??
      (question
        ? {
            type: question.type,
            domainId: question.domainId,
            prompt: question.prompt,
            options: question.options,
            answerIds: question.answerIds,
            explanation: question.explanation,
            sources: question.sources,
          }
        : {});
    return JSON.stringify(correction, null, 2);
  }
</script>

<svelte:head>
  <title>Review imported questions · Ordewell</title>
  <meta
    name="description"
    content="Flag, correct, and retire imported exam questions while preserving their source packs."
  >
</svelte:head>

<main class="review">
  <a class="back-link" href="/">← Exam pack library</a>
  <header>
    <p class="eyebrow">Question review</p>
    <h1>Improve your imported questions</h1>
    <p>
      Feedback stays local to this pack version. Imported source packs and completed attempts remain
      unchanged.
    </p>
  </header>

  <nav class="toolbar" aria-label="Review tools">
    <a class="button-link" href="/review/export">Export feedback JSON</a>
    {#if selectedPack}
      <span
        >{selectedPack.exam.title}
        · {selectedPack.pack.title} · pack v{selectedPack.pack.version}</span
      >
    {/if}
  </nav>

  {#if data.packs.length === 0}
    <section class="empty">
      <h2>No imported packs</h2>
      <p>Import an exam pack before reviewing questions.</p>
      <a href="/">Open exam pack library</a>
    </section>
  {:else}
    <section class="picker">
      <label for="pack-version">Exam pack version</label>
      <select
        id="pack-version"
        value={selectedPack ? `${selectedPack.exam.id}|${selectedPack.pack.id}|${selectedPack.pack.version}` : ''}
        onchange={(event) => {
    const pack = data.packs.find(
      (item) => `${item.examId}|${item.packId}|${item.packVersion}` === event.currentTarget.value,
    );
    if (pack)
      window.location.href = `/review?examId=${encodeURIComponent(pack.examId)}&packId=${encodeURIComponent(pack.packId)}&packVersion=${encodeURIComponent(pack.packVersion)}`;
  }}
      >
        {#each data.packs as pack (`${pack.examId}|${pack.packId}|${pack.packVersion}`)}
          <option value={`${pack.examId}|${pack.packId}|${pack.packVersion}`}>
            {pack.examTitle}
            · {pack.packTitle} · v{pack.packVersion}
          </option>
        {/each}
      </select>
    </section>
    {#if form?.message}
      <p class="error" role="alert">{form.message}</p>
    {/if}
    {#if selectedPack}
      <p class="version-note">
        Reviewing immutable pack version <strong>{selectedPack.pack.version}</strong>. Corrections
        apply only to future sessions.
      </p>
      <section class="question-list" aria-label="Imported questions">
        {#each selectedPack.questions as question (question.id)}
          {@const feedback = feedbackByQuestion.get(question.id)}
          <article class:retired={feedback?.retired}>
            <div class="question-heading">
              <div>
                <p class="eyebrow">{question.domainId} · {question.type} · {question.id}</p>
                <h2>{question.prompt}</h2>
              </div>
              {#if feedback?.retired}
                <span class="status">Retired for new sessions</span>
              {/if}
            </div>
            <ul class="options">
              {#each question.options as option (option.id)}
                <li>
                  {option.text}
                  {#if question.answerIds.includes(option.id)}
                    <strong>(current answer)</strong>
                  {/if}
                </li>
              {/each}
            </ul>
            <p class="explanation">{question.explanation}</p>
            <fieldset class="sources">
              <legend>Sources · pack v{selectedPack.pack.version}</legend>
              {#each question.sources as source (source.path)}
                <a
                  href={`/practice/source?examId=${encodeURIComponent(selectedPack.exam.id)}&packId=${encodeURIComponent(selectedPack.pack.id)}&packVersion=${encodeURIComponent(selectedPack.pack.version)}&questionId=${encodeURIComponent(question.id)}&path=${encodeURIComponent(source.path)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  >{source.label} <span aria-hidden="true">↗</span><small>{source.path}</small></a
                >
              {/each}
            </fieldset>
            {#if feedback?.flags.length}
              <ul class="flags" aria-label="Existing flags">
                {#each feedback.flags as flag (flag.reason)}
                  <li>Flagged: {flag.reason}</li>
                {/each}
              </ul>
            {/if}
            <div class="actions">
              <form method="POST" action="?/flag">
                <input type="hidden" name="examId" value={selectedPack.exam.id}>
                <input type="hidden" name="packId" value={selectedPack.pack.id}>
                <input type="hidden" name="packVersion" value={selectedPack.pack.version}>
                <input type="hidden" name="questionId" value={question.id}>
                <label for={`flag-${question.id}`}>Flag this question</label>
                <input
                  id={`flag-${question.id}`}
                  name="reason"
                  placeholder="What needs review?"
                  required
                >
                <button type="submit">Save flag</button>
              </form>
              <form method="POST" action="?/correct">
                <input type="hidden" name="examId" value={selectedPack.exam.id}>
                <input type="hidden" name="packId" value={selectedPack.pack.id}>
                <input type="hidden" name="packVersion" value={selectedPack.pack.version}>
                <input type="hidden" name="questionId" value={question.id}>
                <label for={`correction-${question.id}`}>Correction JSON</label>
                <p class="hint">
                  Edit prompt, type, domainId, options, answerIds, explanation, or sources. Keep at
                  least one citation.
                </p>
                <textarea
                  id={`correction-${question.id}`}
                  name="correction"
                  rows="12"
                  spellcheck="false"
                >{correctionJson(question.id)}</textarea>
                <button type="submit">Save correction</button>
              </form>
              <form method="POST" action="?/retire">
                <input type="hidden" name="examId" value={selectedPack.exam.id}>
                <input type="hidden" name="packId" value={selectedPack.pack.id}>
                <input type="hidden" name="packVersion" value={selectedPack.pack.version}>
                <input type="hidden" name="questionId" value={question.id}>
                <input type="hidden" name="retired" value={feedback?.retired ? 'false' : 'true'}>
                <button class="secondary" type="submit">
                  {feedback?.retired ? 'Restore question' : 'Retire from new sessions'}
                </button>
              </form>
            </div>
          </article>
        {/each}
      </section>
    {/if}
  {/if}
</main>

<style>
  :global(body) {
    margin: 0;
    background: #f4f5f2;
    color: #20251f;
    font-family: Inter, ui-sans-serif, system-ui, sans-serif;
  }
  .review {
    width: min(100% - 2rem, 980px);
    margin: 0 auto;
    padding: 2rem 0 5rem;
  }
  header {
    max-width: 700px;
    margin: 2rem 0;
  }
  h1 {
    margin: 0 0 0.7rem;
    font-size: clamp(2.2rem, 6vw, 3.3rem);
    letter-spacing: -0.045em;
    line-height: 1.05;
  }
  h2,
  p {
    margin-top: 0;
  }
  header > p:last-child,
  .version-note,
  .hint {
    color: #5e665e;
    line-height: 1.55;
  }
  .eyebrow {
    margin-bottom: 0.55rem;
    color: #536c57;
    font-size: 0.75rem;
    font-weight: 750;
    letter-spacing: 0.09em;
    text-transform: uppercase;
  }
  a {
    color: #28553a;
    font-weight: 650;
  }
  .back-link {
    display: inline-block;
  }
  .toolbar,
  .question-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }
  .toolbar {
    margin: 1rem 0;
  }
  .toolbar > span,
  .status {
    color: #5e665e;
    font-size: 0.9rem;
  }
  .picker,
  .empty,
  article {
    margin: 1rem 0;
    border: 1px solid #dce1d9;
    border-radius: 16px;
    background: #fff;
    padding: 1.3rem;
  }
  .picker {
    display: grid;
    gap: 0.6rem;
  }
  select,
  input,
  textarea {
    width: 100%;
    min-height: 44px;
    border: 1px solid #aeb9ad;
    border-radius: 8px;
    background: #fff;
    padding: 0.6rem 0.7rem;
    color: inherit;
    font: inherit;
  }
  textarea {
    min-height: 200px;
    font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
    font-size: 0.86rem;
    line-height: 1.45;
  }
  label {
    font-weight: 700;
  }
  .options {
    padding-left: 1.3rem;
  }
  .explanation {
    color: #5e665e;
  }
  .sources {
    display: flex;
    min-width: 0;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 0.7rem 1.2rem;
    border-top: 1px solid #e2e6df;
    border-right: 0;
    border-bottom: 0;
    border-left: 0;
    padding-top: 0.9rem;
  }
  .sources legend {
    width: 100%;
  }
  .sources a {
    display: grid;
    gap: 0.2rem;
  }
  .sources small {
    color: #687168;
    font-weight: 400;
  }
  .flags {
    color: #84511d;
  }
  .actions {
    display: grid;
    grid-template-columns: minmax(200px, 0.8fr) minmax(360px, 1.5fr) auto;
    align-items: start;
    gap: 1rem;
    margin-top: 1.2rem;
  }
  .actions form {
    display: grid;
    gap: 0.65rem;
  }
  .hint {
    margin: 0;
    font-size: 0.88rem;
  }
  button,
  .button-link {
    display: inline-flex;
    min-height: 44px;
    align-items: center;
    justify-content: center;
    border: 0;
    border-radius: 9px;
    background: #28553a;
    padding: 0.7rem 1rem;
    color: #fff;
    font: inherit;
    font-weight: 700;
    text-decoration: none;
    cursor: pointer;
  }
  button:hover,
  .button-link:hover {
    background: #1e432d;
  }
  button.secondary {
    border: 1px solid #aeb9ad;
    background: #fff;
    color: #28553a;
  }
  :is(button, a, select, input, textarea):focus-visible {
    outline: 3px solid #d29537;
    outline-offset: 3px;
  }
  article.retired {
    border-color: #bd8c78;
    background: #fffaf8;
  }
  .status {
    color: #88412e;
    font-weight: 700;
  }
  .error {
    border-left: 4px solid #9d3028;
    background: #fff0ee;
    padding: 0.8rem;
    color: #9d3028;
  }
  @media (max-width: 760px) {
    .actions {
      grid-template-columns: 1fr;
    }
    .toolbar,
    .question-heading {
      align-items: flex-start;
      flex-direction: column;
    }
  }
</style>
