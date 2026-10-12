<script lang="ts">
  import { resolve } from '$app/paths';

  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();
  let selectedPackKey = $state('');
  let selectedDomainIds = $state<string[]>([]);
  let selectedPack = $derived(
    data.packs.find(
      (pack) => `${pack.examId}|${pack.packId}|${pack.packVersion}` === selectedPackKey,
    ) ?? data.packs[0],
  );
  let availableQuestionCount = $derived.by(() => {
    if (!selectedPack) {
      return 0;
    }
    if (selectedDomainIds.length === 0) {
      return Math.min(100, selectedPack.questionCount);
    }

    const selectedDomainQuestionCount = selectedPack.domains
      .filter((domain) => selectedDomainIds.includes(domain.id))
      .reduce((total, domain) => total + domain.questionCount, 0);
    return Math.min(100, selectedDomainQuestionCount);
  });
  let activeQuestion = $derived(
    data.session?.questions.find(
      (question) => !data.session?.answers.some((answer) => answer.questionId === question.id),
    ),
  );
  let latestAnswer = $derived(data.session?.answers.at(-1));
  let latestQuestion = $derived(
    data.session?.questions.find((question) => question.id === latestAnswer?.questionId),
  );

  const resetDomains = () => {
    selectedDomainIds = [];
  };

  const packKey = (pack: { examId: string; packId: string; packVersion: string }) =>
    `${pack.examId}|${pack.packId}|${pack.packVersion}`;
</script>

<svelte:head>
  <title>Practice quiz</title>
  <meta name="description" content="Choose an exam pack and resume a saved practice quiz." />
</svelte:head>

<main class="bg-app-canvas text-app-ink min-h-screen px-4 py-8 pb-20 font-sans sm:px-6">
  <div class="mx-auto w-full max-w-205">
    <a
      class="text-brand inline-block font-semibold underline-offset-4 hover:underline"
      href={resolve('/')}>← Exam pack library</a
    >
    <header class="my-8 max-w-162.5">
      <p class="tracking-eyebrow text-brand-label mb-2 text-xs font-bold uppercase">Practice</p>
      <h1 class="text-page-title-medium leading-page-title tracking-page-title mb-3 font-bold">
        Build your exam confidence
      </h1>
      <p class="text-body-muted leading-relaxed">
        Choose an imported exam pack, focus on domains, and your answers will be saved as you go.
      </p>
    </header>

    {#if data.session?.status === 'in_progress'}
      <section
        class="border-card-border bg-panel-tint my-5 flex flex-col items-start justify-between gap-4 rounded-2xl border p-5 sm:flex-row sm:items-center"
        aria-label="Saved practice session"
      >
        <div>
          <p class="tracking-eyebrow text-brand-label mb-2 text-xs font-bold uppercase">
            Saved session
          </p>
          <h2 class="mb-2 text-xl font-semibold">
            {data.packs.find(
              (pack) =>
                pack.examId === data.session?.examId &&
                pack.packId === data.session?.packId &&
                pack.packVersion === data.session?.packVersion,
            )?.packTitle ?? 'Practice quiz'}
          </h2>
          <p class="text-body-muted mb-0.5 leading-relaxed">
            {data.session.answers.length}
            of {data.session.questionIds.length} answered · Pack version {data.session.packVersion}
          </p>
        </div>
        <a
          class="btn bg-brand hover:bg-brand-hover focus-visible:outline-focus-gold min-h-11 rounded-lg px-4 font-bold text-white focus-visible:outline-3 focus-visible:outline-offset-3"
          href={resolve(`/practice?session=${encodeURIComponent(data.session.id)}`)}>Resume quiz</a
        >
      </section>
    {/if}

    {#if data.packs.length === 0}
      <section class="border-card-border my-5 rounded-2xl border bg-white p-5 sm:p-6">
        <h2 class="mb-3 text-xl font-semibold">No exam packs are available yet</h2>
        <p class="text-body-muted mb-4">
          Import a pack from the exam pack library to begin a practice quiz.
        </p>
        <a class="text-brand font-semibold underline-offset-4 hover:underline" href={resolve('/')}
          >Open exam pack library</a
        >
      </section>
    {:else}
      <section
        class="border-card-border my-5 rounded-2xl border bg-white p-5 sm:p-6"
        aria-labelledby="setup-heading"
      >
        <h2 id="setup-heading" class="mb-5 text-xl font-semibold">Start a practice quiz</h2>
        <form class="grid gap-3" action={resolve('/practice?/start')} method="POST">
          <label class="font-bold" for="pack">Exam pack version</label>
          <select
            id="pack"
            name="packChoice"
            class="select focus-visible:outline-focus-gold min-h-11 w-full focus-visible:outline-3 focus-visible:outline-offset-3"
            onchange={resetDomains}
            bind:value={selectedPackKey}
          >
            {#each data.packs as pack (packKey(pack))}
              <option value="{pack.examId}|{pack.packId}|{pack.packVersion}">
                {pack.examTitle}
                · {pack.packTitle} · v{pack.packVersion}{pack.synthetic ? ' · synthetic' : ''}
              </option>
            {/each}
          </select>
          <input name="examId" type="hidden" value={selectedPack?.examId ?? ''} />
          <input name="packId" type="hidden" value={selectedPack?.packId ?? ''} />
          <input name="packVersion" type="hidden" value={selectedPack?.packVersion ?? ''} />

          {#if selectedPack}
            <fieldset class="border-card-border my-2 min-w-0 rounded-xl border p-4">
              <legend class="px-1 font-bold">
                Domains
                <span class="text-meta-muted font-normal"
                  >(leave all unchecked to include every domain)</span
                >
              </legend>
              {#each selectedPack.domains as domain (domain.id)}
                <label
                  class="hover:bg-control-fill flex items-start gap-3 rounded-lg px-1 py-3 font-medium"
                >
                  <input
                    name="domainIds"
                    class="accent-brand mt-0.5 size-4"
                    type="checkbox"
                    value={domain.id}
                    bind:group={selectedDomainIds}
                  />
                  <span>{domain.title}</span><small class="text-meta-muted ml-auto"
                    >{domain.weight}%</small
                  >
                </label>
              {/each}
            </fieldset>
            <label class="font-bold" for="question-count">Number of questions</label>
            <input
              id="question-count"
              name="questionCount"
              class="input focus-visible:outline-focus-gold min-h-11 w-full focus-visible:outline-3 focus-visible:outline-offset-3"
              max={availableQuestionCount}
              min="1"
              required
              type="number"
              value={Math.min(10, availableQuestionCount)}
            />
            <button
              class="btn bg-brand hover:bg-brand-hover focus-visible:outline-focus-gold min-h-11 rounded-lg px-4 font-bold text-white focus-visible:outline-3 focus-visible:outline-offset-3"
              type="submit"
            >
              Start quiz
            </button>
          {/if}
        </form>
        {#if form?.message}
          <p class="text-error-text" role="alert">{form.message}</p>
        {/if}
      </section>
    {/if}

    {#if data.session}
      <section
        class="border-card-border my-5 rounded-2xl border bg-white p-5 sm:p-6"
        aria-labelledby="quiz-heading"
      >
        <p class="tracking-eyebrow text-brand-label mb-2 text-xs font-bold uppercase">
          {data.session.answers.length}
          / {data.session.questionIds.length} answered ·
          {data.session.packId}
          v{data.session.packVersion}
        </p>
        {#if latestAnswer && latestQuestion}
          <div
            class={[
              'feedback-border-width my-4 rounded-lg p-4',
              latestAnswer.correct
                ? 'border-feedback-positive-border bg-feedback-positive-fill'
                : 'border-feedback-warning-border bg-feedback-warning-fill',
            ]}
            aria-live="polite"
            role="status"
          >
            <h2 class="mb-2 text-xl font-semibold">
              {latestAnswer.correct ? 'Correct' : 'Not quite'}
            </h2>
            <p class="mb-3">
              <strong>Correct answer:</strong>
              {latestQuestion.options
                .filter((option) => latestAnswer.answerIdsCorrect.includes(option.id))
                .map((option) => option.text)
                .join('; ')}
            </p>
            <p class="mb-4">{latestAnswer.explanation}</p>
            <div class="flex flex-wrap gap-x-5 gap-y-3">
              {#each latestAnswer.sources as source (source.path)}
                <a
                  class="text-brand font-semibold underline-offset-4 hover:underline"
                  href={resolve(
                    `/practice/source?examId=${encodeURIComponent(data.session.examId)}&packId=${encodeURIComponent(data.session.packId)}&packVersion=${encodeURIComponent(data.session.packVersion)}&questionId=${encodeURIComponent(latestAnswer.questionId)}&path=${encodeURIComponent(source.path)}`,
                  )}
                  rel="noopener noreferrer"
                  target="_blank">{source.label} <span aria-hidden="true">↗</span></a
                >
              {/each}
            </div>
          </div>
        {/if}

        {#if activeQuestion}
          <article class="border-divider mt-6 border-t pt-5">
            <p class="tracking-eyebrow text-brand-label mb-2 text-xs font-bold uppercase">
              {data.session.answers.length + 1}
              of {data.session.questionIds.length} ·
              {data.session.questions.find((question) => question.id === activeQuestion.id)
                ?.domainId}
            </p>
            <h2 id="quiz-heading" class="mb-5 text-xl/relaxed font-semibold">
              {activeQuestion.prompt}
            </h2>
            <form class="grid gap-3" action={resolve('/practice?/answer')} method="POST">
              <input name="sessionId" type="hidden" value={data.session.id} />
              <input name="questionId" type="hidden" value={activeQuestion.id} />
              <fieldset class="grid gap-1">
                <legend class="mb-2 font-bold">
                  {activeQuestion.type === 'multiple_choice'
                    ? 'Select all that apply'
                    : 'Select one answer'}
                </legend>
                {#each activeQuestion.options as option (option.id)}
                  <label
                    class="hover:bg-control-fill flex items-start gap-3 rounded-lg px-2 py-3 font-medium"
                  >
                    <input
                      name="answerIds"
                      class="accent-brand mt-0.5 size-4"
                      required={activeQuestion.type === 'single_choice'}
                      type={activeQuestion.type === 'multiple_choice' ? 'checkbox' : 'radio'}
                      value={option.id}
                    />
                    <span>{option.text}</span>
                  </label>
                {/each}
              </fieldset>
              <button
                class="btn bg-brand hover:bg-brand-hover focus-visible:outline-focus-gold min-h-11 rounded-lg px-4 font-bold text-white focus-visible:outline-3 focus-visible:outline-offset-3"
                type="submit"
              >
                Submit answer
              </button>
            </form>
          </article>
        {:else if data.session.status === 'completed'}
          <div
            class="feedback-border-width border-feedback-positive-border bg-feedback-positive-fill my-4 rounded-lg p-4"
            role="status"
          >
            <h2 class="mb-2 text-xl font-semibold">Quiz complete</h2>
            <p class="mb-3">
              You answered {data.session.answers.filter((answer) => answer.correct).length} of
              {data.session.questionIds.length}
              correctly.
            </p>
            <p class="mb-0">
              Your completed attempt is saved with pack version {data.session.packVersion}.
            </p>
          </div>
        {/if}
      </section>
    {/if}
  </div>
</main>
