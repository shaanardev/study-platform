<script lang="ts">
  import { resolve } from '$app/paths';

  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();
  const JSON_INDENT_SPACES = 2;
  let selectedPack = $derived(data.pack);
  let feedbackByQuestion = $derived(new Map(data.feedback.map((item) => [item.questionId, item])));

  const reviewAction = (action: 'correct' | 'flag' | 'retire') => {
    if (!selectedPack) {
      return resolve('/review');
    }

    const searchParams = new URLSearchParams({
      examId: selectedPack.exam.id,
      packId: selectedPack.pack.id,
      packVersion: selectedPack.pack.version,
    });

    return `${resolve('/review')}?${searchParams.toString()}&/${action}`;
  };

  const correctionJson = (questionId: string) => {
    const question = selectedPack?.questions.find((item) => item.id === questionId);
    const existing = feedbackByQuestion.get(questionId)?.correction;

    const correction =
      existing ??
      (question
        ? {
            answerIds: question.answerIds,
            domainId: question.domainId,
            explanation: question.explanation,
            options: question.options,
            prompt: question.prompt,
            sources: question.sources,
            type: question.type,
          }
        : {});

    return JSON.stringify(correction, null, JSON_INDENT_SPACES);
  };
</script>

<svelte:head>
  <title>Review imported questions</title>
  <meta
    name="description"
    content="Flag, correct, and retire imported exam questions while preserving their source packs."
  />
</svelte:head>

<main class="preset-filled-surface-100-900 min-h-screen font-sans">
  <div class="content-width-review mx-auto py-8 pb-20">
    <a
      class="text-primary-700-300 focus-visible:outline-warning-500 font-semibold underline-offset-4 hover:underline focus-visible:outline-3 focus-visible:outline-offset-2"
      href={resolve('/')}>← Exam pack library</a
    >
    <header class="my-8 max-w-175">
      <p class="tracking-eyebrow text-primary-700-300 mb-2 text-xs font-bold uppercase">
        Question review
      </p>
      <h1 class="mb-3 text-4xl/tight font-bold tracking-tight sm:text-5xl">
        Improve your imported questions
      </h1>
      <p class="text-surface-600-400 leading-relaxed">
        Feedback stays local to this pack version. Imported source packs and completed attempts
        remain unchanged.
      </p>
    </header>

    <nav
      class="my-4 flex flex-col justify-between gap-4 sm:flex-row sm:items-center"
      aria-label="Review tools"
    >
      <a
        class="btn preset-filled-primary-700-300 focus-visible:outline-warning-500 min-h-11 no-underline focus-visible:outline-3 focus-visible:outline-offset-2"
        href={resolve('/review/export')}>Export feedback JSON</a
      >
      {#if selectedPack}
        <span class="text-surface-600-400 text-sm"
          >{selectedPack.exam.title}
          · {selectedPack.pack.title} · pack v{selectedPack.pack.version}</span
        >
      {/if}
    </nav>

    {#if data.packs.length === 0}
      <section class="card border-surface-200-800 bg-surface-50-950 my-4 rounded-2xl border p-6">
        <h2 class="mb-2 text-xl font-semibold">No imported packs</h2>
        <p>Import an exam pack before reviewing questions.</p>
        <a
          class="text-primary-700-300 focus-visible:outline-warning-500 font-semibold underline-offset-4 hover:underline focus-visible:outline-3 focus-visible:outline-offset-2"
          href={resolve('/')}>Open exam pack library</a
        >
      </section>
    {:else}
      <section
        class="card border-surface-200-800 bg-surface-50-950 my-4 grid gap-3 rounded-2xl border p-5"
      >
        <label class="font-semibold" for="pack-version">Exam pack version</label>
        <select
          id="pack-version"
          class="select focus-visible:outline-warning-500 w-full focus-visible:outline-3 focus-visible:outline-offset-2"
          onchange={(event) => {
            const pack = data.packs.find(
              (item) =>
                `${item.examId}|${item.packId}|${item.packVersion}` === event.currentTarget.value,
            );
            if (pack) {
              window.location.href = resolve(
                `/review?examId=${encodeURIComponent(pack.examId)}&packId=${encodeURIComponent(pack.packId)}&packVersion=${encodeURIComponent(pack.packVersion)}`,
              );
            }
          }}
          value={selectedPack
            ? `${selectedPack.exam.id}|${selectedPack.pack.id}|${selectedPack.pack.version}`
            : ''}
        >
          {#each data.packs as pack (`${pack.examId}|${pack.packId}|${pack.packVersion}`)}
            <option value="{pack.examId}|{pack.packId}|{pack.packVersion}">
              {pack.examTitle}
              · {pack.packTitle} · v{pack.packVersion}
            </option>
          {/each}
        </select>
      </section>
      {#if form?.message}
        <p
          class="border-error-500 bg-error-50-950 text-error-700-300 my-4 border-l-4 p-3"
          role="alert"
        >
          {form.message}
        </p>
      {/if}
      {#if selectedPack}
        <p class="text-surface-600-400 my-4 leading-relaxed">
          Reviewing immutable pack version <strong>{selectedPack.pack.version}</strong>. Corrections
          apply only to future sessions.
        </p>
        <section class="grid gap-5" aria-label="Imported questions">
          {#each selectedPack.questions as question (question.id)}
            <article
              class={[
                'card rounded-2xl border p-5 sm:p-6',
                feedbackByQuestion.get(question.id)?.retired
                  ? 'border-error-300 bg-error-50-950'
                  : 'border-surface-200-800 bg-surface-50-950',
              ]}
            >
              <div class="mb-4 flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                <div>
                  <p class="tracking-eyebrow text-primary-700-300 mb-2 text-xs font-bold uppercase">
                    {question.domainId}
                    · {question.type} · {question.id}
                  </p>
                  <h2 class="mb-0 text-xl/snug font-semibold sm:text-2xl">
                    {question.prompt}
                  </h2>
                </div>
                {#if feedbackByQuestion.get(question.id)?.retired}
                  <span class="text-error-700-300 text-sm font-bold">Retired for new sessions</span>
                {/if}
              </div>
              <ul class="mb-4 list-disc space-y-2 pl-6 text-sm/relaxed">
                {#each question.options as option (option.id)}
                  <li>
                    {option.text}
                    {#if question.answerIds.includes(option.id)}
                      <strong>(current answer)</strong>
                    {/if}
                  </li>
                {/each}
              </ul>
              <p class="text-surface-600-400 mb-5 text-sm/relaxed">
                {question.explanation}
              </p>
              <fieldset
                class="border-surface-200-800 flex min-w-0 flex-wrap items-start gap-x-5 gap-y-3 border-0 border-t p-0 pt-4"
              >
                <legend class="mb-3 w-full font-semibold">
                  Sources · pack v{selectedPack.pack.version}
                </legend>
                {#each question.sources as source (source.path)}
                  <a
                    class="text-primary-700-300 grid gap-1 font-semibold underline-offset-4 hover:underline"
                    href={resolve(
                      `/practice/source?examId=${encodeURIComponent(selectedPack.exam.id)}&packId=${encodeURIComponent(selectedPack.pack.id)}&packVersion=${encodeURIComponent(selectedPack.pack.version)}&questionId=${encodeURIComponent(question.id)}&path=${encodeURIComponent(source.path)}`,
                    )}
                    rel="noopener noreferrer"
                    target="_blank"
                    >{source.label} <span aria-hidden="true">↗</span><small
                      class="text-surface-600-400 font-normal break-all">{source.path}</small
                    ></a
                  >
                {/each}
              </fieldset>
              {#if feedbackByQuestion.get(question.id)?.flags.length}
                <ul class="text-warning-700-300 my-4 space-y-1 text-sm" aria-label="Existing flags">
                  {#each feedbackByQuestion.get(question.id)?.flags ?? [] as flag (flag.reason)}
                    <li>Flagged: {flag.reason}</li>
                  {/each}
                </ul>
              {/if}
              <div class="lg:grid-cols-review-question-grid mt-5 grid items-start gap-5">
                <form class="grid gap-3" action={reviewAction('flag')} method="POST">
                  <input name="examId" type="hidden" value={selectedPack.exam.id} />
                  <input name="packId" type="hidden" value={selectedPack.pack.id} />
                  <input name="packVersion" type="hidden" value={selectedPack.pack.version} />
                  <input name="questionId" type="hidden" value={question.id} />
                  <label class="font-semibold" for="flag-{question.id}">Flag this question</label>
                  <input
                    id="flag-{question.id}"
                    name="reason"
                    class="input focus-visible:outline-warning-500 w-full focus-visible:outline-3 focus-visible:outline-offset-2"
                    placeholder="What needs review?"
                    required
                  />
                  <button
                    class="btn preset-filled-primary-700-300 focus-visible:outline-warning-500 min-h-11 focus-visible:outline-3 focus-visible:outline-offset-2"
                    type="submit"
                  >
                    Save flag
                  </button>
                </form>
                <form class="grid gap-3" action={reviewAction('correct')} method="POST">
                  <input name="examId" type="hidden" value={selectedPack.exam.id} />
                  <input name="packId" type="hidden" value={selectedPack.pack.id} />
                  <input name="packVersion" type="hidden" value={selectedPack.pack.version} />
                  <input name="questionId" type="hidden" value={question.id} />
                  <label class="font-semibold" for="correction-{question.id}">Correction JSON</label
                  >
                  <p class="text-surface-600-400 m-0 text-sm/relaxed">
                    Edit prompt, type, domainId, options, answerIds, explanation, or sources. Keep
                    at least one citation.
                  </p>
                  <textarea
                    id="correction-{question.id}"
                    name="correction"
                    class="textarea focus-visible:outline-warning-500 min-h-52 w-full font-mono text-sm/relaxed focus-visible:outline-3 focus-visible:outline-offset-2"
                    rows="12"
                    spellcheck="false">{correctionJson(question.id)}</textarea
                  >
                  <button
                    class="btn preset-filled-primary-700-300 focus-visible:outline-warning-500 min-h-11 focus-visible:outline-3 focus-visible:outline-offset-2"
                    type="submit"
                  >
                    Save correction
                  </button>
                </form>
                <form class="grid gap-3 lg:pt-8" action={reviewAction('retire')} method="POST">
                  <input name="examId" type="hidden" value={selectedPack.exam.id} />
                  <input name="packId" type="hidden" value={selectedPack.pack.id} />
                  <input name="packVersion" type="hidden" value={selectedPack.pack.version} />
                  <input name="questionId" type="hidden" value={question.id} />
                  <input
                    name="retired"
                    type="hidden"
                    value={feedbackByQuestion.get(question.id)?.retired ? 'false' : 'true'}
                  />
                  <button
                    class="btn preset-outlined-primary-700-300 focus-visible:outline-warning-500 min-h-11 focus-visible:outline-3 focus-visible:outline-offset-2"
                    type="submit"
                  >
                    {feedbackByQuestion.get(question.id)?.retired
                      ? 'Restore question'
                      : 'Retire from new sessions'}
                  </button>
                </form>
              </div>
            </article>
          {/each}
        </section>
      {/if}
    {/if}
  </div>
</main>
