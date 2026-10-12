<script lang="ts">
  import { resolve } from '$app/paths';
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
  <title>Review imported questions</title>
  <meta
    name="description"
    content="Flag, correct, and retire imported exam questions while preserving their source packs."
  >
</svelte:head>

<main class="min-h-screen bg-surface-100-900 font-sans text-surface-900-50">
  <div class="mx-auto w-[min(100%-2rem,980px)] py-8 pb-20">
    <a
      class="font-semibold text-primary-700-300 underline-offset-4 hover:underline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-warning-500"
      href={resolve('/')}
      >← Exam pack library</a
    >
    <header class="my-8 max-w-175">
      <p class="mb-2 text-xs font-bold tracking-[0.09em] text-primary-700-300 uppercase">
        Question review
      </p>
      <h1 class="mb-3 text-4xl leading-tight font-bold tracking-tight sm:text-5xl">
        Improve your imported questions
      </h1>
      <p class="leading-relaxed text-surface-600-400">
        Feedback stays local to this pack version. Imported source packs and completed attempts
        remain unchanged.
      </p>
    </header>

    <nav
      class="my-4 flex flex-col justify-between gap-4 sm:flex-row sm:items-center"
      aria-label="Review tools"
    >
      <a
        class="btn preset-filled-primary-700-300 min-h-11 no-underline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-warning-500"
        href={resolve('/review/export')}
        >Export feedback JSON</a
      >
      {#if selectedPack}
        <span class="text-sm text-surface-600-400"
          >{selectedPack.exam.title}
          · {selectedPack.pack.title} · pack v{selectedPack.pack.version}</span
        >
      {/if}
    </nav>

    {#if data.packs.length === 0}
      <section class="card my-4 rounded-2xl border border-surface-200-800 bg-surface-50-950 p-6">
        <h2 class="mb-2 text-xl font-semibold">No imported packs</h2>
        <p>Import an exam pack before reviewing questions.</p>
        <a
          class="font-semibold text-primary-700-300 underline-offset-4 hover:underline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-warning-500"
          href={resolve('/')}
          >Open exam pack library</a
        >
      </section>
    {:else}
      <section
        class="card my-4 grid gap-3 rounded-2xl border border-surface-200-800 bg-surface-50-950 p-5"
      >
        <label class="font-semibold" for="pack-version">Exam pack version</label>
        <select
          class="select w-full focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-warning-500"
          id="pack-version"
          value={selectedPack
            ? `${selectedPack.exam.id}|${selectedPack.pack.id}|${selectedPack.pack.version}`
            : ''}
          onchange={(event) => {
            const pack = data.packs.find(
              (item) =>
                `${item.examId}|${item.packId}|${item.packVersion}` === event.currentTarget.value,
            );
            if (pack)
              window.location.href = resolve(
                `/review?examId=${encodeURIComponent(pack.examId)}&packId=${encodeURIComponent(pack.packId)}&packVersion=${encodeURIComponent(pack.packVersion)}`,
              );
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
        <p
          class="my-4 border-l-4 border-error-500 bg-error-50-900 p-3 text-error-700-300"
          role="alert"
        >
          {form.message}
        </p>
      {/if}
      {#if selectedPack}
        <p class="my-4 leading-relaxed text-surface-600-400">
          Reviewing immutable pack version <strong>{selectedPack.pack.version}</strong>. Corrections
          apply only to future sessions.
        </p>
        <section class="grid gap-5" aria-label="Imported questions">
          {#each selectedPack.questions as question (question.id)}
            <article
              class="card rounded-2xl border border-surface-200-800 bg-surface-50-950 p-5 sm:p-6"
              class:border-error-300={feedbackByQuestion.get(question.id)?.retired}
              class:bg-error-50-950={feedbackByQuestion.get(question.id)?.retired}
            >
              <div class="mb-4 flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                <div>
                  <p
                    class="mb-2 text-xs font-bold tracking-[0.09em] text-primary-700-300 uppercase"
                  >
                    {question.domainId}
                    · {question.type} · {question.id}
                  </p>
                  <h2 class="mb-0 text-xl leading-snug font-semibold sm:text-2xl">
                    {question.prompt}
                  </h2>
                </div>
                {#if feedbackByQuestion.get(question.id)?.retired}
                  <span class="text-sm font-bold text-error-700-300">Retired for new sessions</span>
                {/if}
              </div>
              <ul class="mb-4 list-disc space-y-2 pl-6 text-sm leading-relaxed">
                {#each question.options as option (option.id)}
                  <li>
                    {option.text}
                    {#if question.answerIds.includes(option.id)}
                      <strong>(current answer)</strong>
                    {/if}
                  </li>
                {/each}
              </ul>
              <p class="mb-5 text-sm leading-relaxed text-surface-600-400">
                {question.explanation}
              </p>
              <fieldset
                class="flex min-w-0 flex-wrap items-start gap-x-5 gap-y-3 border-0 border-t border-surface-200-800 p-0 pt-4"
              >
                <legend class="mb-3 w-full font-semibold">
                  Sources · pack v{selectedPack.pack.version}
                </legend>
                {#each question.sources as source (source.path)}
                  <a
                    href={resolve(
                      `/practice/source?examId=${encodeURIComponent(selectedPack.exam.id)}&packId=${encodeURIComponent(selectedPack.pack.id)}&packVersion=${encodeURIComponent(selectedPack.pack.version)}&questionId=${encodeURIComponent(question.id)}&path=${encodeURIComponent(source.path)}`,
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="grid gap-1 font-semibold text-primary-700-300 underline-offset-4 hover:underline"
                    >{source.label} <span aria-hidden="true">↗</span
                    ><small class="break-all font-normal text-surface-600-400"
                      >{source.path}</small
                    ></a
                  >
                {/each}
              </fieldset>
              {#if feedbackByQuestion.get(question.id)?.flags.length}
                <ul class="my-4 space-y-1 text-sm text-warning-700-300" aria-label="Existing flags">
                  {#each feedbackByQuestion.get(question.id)?.flags ?? [] as flag (flag.reason)}
                    <li>Flagged: {flag.reason}</li>
                  {/each}
                </ul>
              {/if}
              <div
                class="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(200px,0.8fr)_minmax(360px,1.5fr)_auto]"
              >
                <form class="grid gap-3" method="POST" action={resolve('/review?/flag')}>
                  <input type="hidden" name="examId" value={selectedPack.exam.id}>
                  <input type="hidden" name="packId" value={selectedPack.pack.id}>
                  <input type="hidden" name="packVersion" value={selectedPack.pack.version}>
                  <input type="hidden" name="questionId" value={question.id}>
                  <label class="font-semibold" for={`flag-${question.id}`}
                    >Flag this question</label
                  >
                  <input
                    id={`flag-${question.id}`}
                    name="reason"
                    class="input w-full focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-warning-500"
                    placeholder="What needs review?"
                    required
                  >
                  <button
                    class="btn preset-filled-primary-700-300 min-h-11 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-warning-500"
                    type="submit"
                  >
                    Save flag
                  </button>
                </form>
                <form class="grid gap-3" method="POST" action={resolve('/review?/correct')}>
                  <input type="hidden" name="examId" value={selectedPack.exam.id}>
                  <input type="hidden" name="packId" value={selectedPack.pack.id}>
                  <input type="hidden" name="packVersion" value={selectedPack.pack.version}>
                  <input type="hidden" name="questionId" value={question.id}>
                  <label class="font-semibold" for={`correction-${question.id}`}
                    >Correction JSON</label
                  >
                  <p class="m-0 text-sm leading-relaxed text-surface-600-400">
                    Edit prompt, type, domainId, options, answerIds, explanation, or sources. Keep
                    at least one citation.
                  </p>
                  <textarea
                    class="textarea min-h-52 w-full font-mono text-sm leading-relaxed focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-warning-500"
                    id={`correction-${question.id}`}
                    name="correction"
                    rows="12"
                    spellcheck="false"
                  >{correctionJson(question.id)}</textarea>
                  <button
                    class="btn preset-filled-primary-700-300 min-h-11 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-warning-500"
                    type="submit"
                  >
                    Save correction
                  </button>
                </form>
                <form class="grid gap-3 lg:pt-8" method="POST" action={resolve('/review?/retire')}>
                  <input type="hidden" name="examId" value={selectedPack.exam.id}>
                  <input type="hidden" name="packId" value={selectedPack.pack.id}>
                  <input type="hidden" name="packVersion" value={selectedPack.pack.version}>
                  <input type="hidden" name="questionId" value={question.id}>
                  <input
                    type="hidden"
                    name="retired"
                    value={feedbackByQuestion.get(question.id)?.retired ? 'false' : 'true'}
                  >
                  <button
                    class="btn preset-outlined-primary-700-300 min-h-11 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-warning-500"
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
