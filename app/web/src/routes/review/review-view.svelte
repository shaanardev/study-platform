<script lang="ts">
  import { resolve } from '$app/paths';
  import { page } from '$app/state';

  import InlineCode from '#lib/components/inline-code.svelte';

  import { filterReviewQuestions } from './review-filters';
  import { correctReviewQuestion, flagReviewQuestion, retireReviewQuestion } from './review.remote';
  import type { ReviewData } from './review.remote';

  let { data }: { data: ReviewData } = $props();

  const JSON_INDENT_SPACES = 2;
  let selectedPack = $derived(data.pack);
  let feedbackByQuestion = $derived(new Map(data.feedback.map((item) => [item.questionId, item])));

  let filters = $derived({
    domainId: page.url.searchParams.get('domain') ?? '',
    flagged: page.url.searchParams.get('flagged') === '1',
    retired: page.url.searchParams.get('retired') === '1',
    search: page.url.searchParams.get('q') ?? '',
  });

  let filteredQuestions = $derived(
    selectedPack ? filterReviewQuestions(selectedPack.questions, data.feedback, filters) : [],
  );

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
      <section class="card border-surface-200-800 bg-surface-50-950 my-4 rounded-2xl border p-5">
        <form class="grid gap-4" action={resolve('/review')} method="GET">
          <div class="grid gap-2">
            <label class="font-semibold" for="pack-version">Exam pack version</label>
            <select
              id="pack-version"
              name="packChoice"
              class="select focus-visible:outline-warning-500 min-h-11 w-full focus-visible:outline-3 focus-visible:outline-offset-2"
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
          </div>
          <div class="grid gap-4 sm:grid-cols-2">
            <div class="grid gap-2">
              <label class="font-semibold" for="question-search">Prompt or question ID</label>
              <input
                id="question-search"
                class="input focus-visible:outline-warning-500 min-h-11 w-full focus-visible:outline-3 focus-visible:outline-offset-2"
                name="q"
                type="search"
                value={filters.search}
                placeholder="Search this pack version"
              />
            </div>
            <div class="grid gap-2">
              <label class="font-semibold" for="question-domain">Domain</label>
              <select
                id="question-domain"
                class="select focus-visible:outline-warning-500 min-h-11 w-full focus-visible:outline-3 focus-visible:outline-offset-2"
                name="domain"
                value={filters.domainId}
              >
                <option value="">All domains</option>
                {#each selectedPack?.domains ?? [] as domain (domain.id)}
                  <option value={domain.id}>{domain.title}</option>
                {/each}
              </select>
            </div>
          </div>
          <fieldset class="flex flex-wrap gap-x-6 gap-y-3 border-0 p-0">
            <legend class="sr-only">Additional filters</legend>
            <label class="flex min-h-11 items-center gap-2 font-medium">
              <input
                class="checkbox"
                type="checkbox"
                name="flagged"
                value="1"
                checked={filters.flagged}
              />
              Flagged questions
            </label>
            <label class="flex min-h-11 items-center gap-2 font-medium">
              <input
                class="checkbox"
                type="checkbox"
                name="retired"
                value="1"
                checked={filters.retired}
              />
              Retired questions
            </label>
          </fieldset>
          <div class="flex flex-wrap items-center gap-4">
            <button
              class="btn preset-filled-primary-700-300 focus-visible:outline-warning-500 min-h-11 focus-visible:outline-3 focus-visible:outline-offset-2"
              type="submit"
            >
              Apply filters
            </button>
            {#if selectedPack}
              <a
                class="text-primary-700-300 focus-visible:outline-warning-500 font-semibold underline-offset-4 hover:underline focus-visible:outline-3 focus-visible:outline-offset-2"
                href={resolve(
                  `/review?packChoice=${encodeURIComponent(`${selectedPack.exam.id}|${selectedPack.pack.id}|${selectedPack.pack.version}`)}`,
                )}>Clear filters</a
              >
            {/if}
          </div>
        </form>
      </section>
      {#if selectedPack}
        <p class="text-surface-600-400 my-4 leading-relaxed">
          Reviewing immutable pack version <strong>{selectedPack.pack.version}</strong>. Corrections
          apply only to future sessions.
        </p>
        <p class="text-surface-600-400 my-4" role="status" aria-live="polite">
          Showing {filteredQuestions.length} of {selectedPack.questions.length} questions for
          {selectedPack.exam.title} · {selectedPack.pack.title} · pack v{selectedPack.pack.version}.
        </p>
        {#if selectedPack.questions.length === 0}
          <section
            class="card border-surface-200-800 bg-surface-50-950 my-4 rounded-2xl border p-6"
          >
            <h2 class="mb-2 text-xl font-semibold">No questions in this pack version</h2>
            <p>This imported pack version does not contain any questions to review.</p>
          </section>
        {:else if filteredQuestions.length === 0}
          <section
            class="card border-surface-200-800 bg-surface-50-950 my-4 rounded-2xl border p-6"
          >
            <h2 class="mb-2 text-xl font-semibold">No questions match these filters</h2>
            <p>Try a different prompt or ID, choose another domain, or clear one of the filters.</p>
            <a
              class="text-primary-700-300 focus-visible:outline-warning-500 font-semibold underline-offset-4 hover:underline focus-visible:outline-3 focus-visible:outline-offset-2"
              href={resolve(
                `/review?packChoice=${encodeURIComponent(`${selectedPack.exam.id}|${selectedPack.pack.id}|${selectedPack.pack.version}`)}`,
              )}>Clear filters</a
            >
          </section>
        {/if}
        <section
          class="grid gap-5"
          aria-label="Filtered imported questions"
          aria-hidden={filteredQuestions.length === 0}
        >
          {#each filteredQuestions as question (question.id)}
            {const flagForm = $derived(flagReviewQuestion.for(question.id))}
            {const correctionForm = $derived(correctReviewQuestion.for(question.id))}
            {const retirementForm = $derived(retireReviewQuestion.for(question.id))}
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
                    <InlineCode text={question.prompt} />
                  </h2>
                </div>
                {#if feedbackByQuestion.get(question.id)?.retired}
                  <span class="text-error-700-300 text-sm font-bold">Retired for new sessions</span>
                {/if}
              </div>
              <ul class="mb-4 list-disc space-y-2 pl-6 text-sm/relaxed">
                {#each question.options as option (option.id)}
                  <li>
                    <InlineCode text={option.text} />
                    {#if question.answerIds.includes(option.id)}
                      <strong>(current answer)</strong>
                    {/if}
                  </li>
                {/each}
              </ul>
              <p class="text-surface-600-400 mb-5 text-sm/relaxed">
                <InlineCode text={question.explanation} />
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
                    target="_blank">{source.label} <span aria-hidden="true">↗</span></a
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
                <form {...flagForm} class="grid gap-3">
                  <input {...flagForm.fields.examId.as('hidden', selectedPack.exam.id)} />
                  <input {...flagForm.fields.packId.as('hidden', selectedPack.pack.id)} />
                  <input {...flagForm.fields.packVersion.as('hidden', selectedPack.pack.version)} />
                  <input {...flagForm.fields.questionId.as('hidden', question.id)} />
                  <label class="font-semibold" for="flag-{question.id}">Flag this question</label>
                  <input
                    {...flagForm.fields.reason.as('text')}
                    id="flag-{question.id}"
                    class="input focus-visible:outline-warning-500 w-full focus-visible:outline-3 focus-visible:outline-offset-2"
                    placeholder="What needs review?"
                    required
                  />
                  {#if flagForm.fields.allIssues()?.length}
                    <p
                      class="border-error-500 bg-error-50-950 text-error-700-300 my-2 border-l-4 p-3"
                      role="alert"
                    >
                      {flagForm.fields
                        .allIssues()
                        ?.map((item) => item.message)
                        .join(' ')}
                    </p>
                  {/if}
                  <button
                    class="btn preset-filled-primary-700-300 focus-visible:outline-warning-500 min-h-11 focus-visible:outline-3 focus-visible:outline-offset-2"
                    type="submit"
                  >
                    Save flag
                  </button>
                </form>
                <form {...correctionForm} class="grid gap-3">
                  <input {...correctionForm.fields.examId.as('hidden', selectedPack.exam.id)} />
                  <input {...correctionForm.fields.packId.as('hidden', selectedPack.pack.id)} />
                  <input
                    {...correctionForm.fields.packVersion.as('hidden', selectedPack.pack.version)}
                  />
                  <input {...correctionForm.fields.questionId.as('hidden', question.id)} />
                  <label class="font-semibold" for="correction-{question.id}">Correction JSON</label
                  >
                  <p class="text-surface-600-400 m-0 text-sm/relaxed">
                    Edit prompt, type, domainId, options, answerIds, explanation, or sources. Keep
                    at least one citation.
                  </p>
                  <textarea
                    {...correctionForm.fields.correction.as('text', correctionJson(question.id))}
                    id="correction-{question.id}"
                    class="textarea focus-visible:outline-warning-500 min-h-52 w-full font-mono text-sm/relaxed focus-visible:outline-3 focus-visible:outline-offset-2"
                    rows="12"
                    oninput={(event) =>
                      correctionForm.fields.correction.set(event.currentTarget.value)}
                    spellcheck="false"></textarea>
                  {#if correctionForm.fields.allIssues()?.length}
                    <p
                      class="border-error-500 bg-error-50-950 text-error-700-300 my-2 border-l-4 p-3"
                      role="alert"
                    >
                      {correctionForm.fields
                        .allIssues()
                        ?.map((item) => item.message)
                        .join(' ')}
                    </p>
                  {/if}
                  <button
                    class="btn preset-filled-primary-700-300 focus-visible:outline-warning-500 min-h-11 focus-visible:outline-3 focus-visible:outline-offset-2"
                    type="submit"
                  >
                    Save correction
                  </button>
                </form>
                <form {...retirementForm} class="grid gap-3 lg:pt-8">
                  <input {...retirementForm.fields.examId.as('hidden', selectedPack.exam.id)} />
                  <input {...retirementForm.fields.packId.as('hidden', selectedPack.pack.id)} />
                  <input
                    {...retirementForm.fields.packVersion.as('hidden', selectedPack.pack.version)}
                  />
                  <input {...retirementForm.fields.questionId.as('hidden', question.id)} />
                  <input
                    {...retirementForm.fields.retired.as(
                      'hidden',
                      feedbackByQuestion.get(question.id)?.retired ? 'false' : 'true',
                    )}
                  />
                  {#if retirementForm.fields.allIssues()?.length}
                    <p
                      class="border-error-500 bg-error-50-950 text-error-700-300 my-2 border-l-4 p-3"
                      role="alert"
                    >
                      {retirementForm.fields
                        .allIssues()
                        ?.map((item) => item.message)
                        .join(' ')}
                    </p>
                  {/if}
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
