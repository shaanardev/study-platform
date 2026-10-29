<script lang="ts">
  import { resolve } from '$app/paths';

  import InlineCode from '#lib/components/inline-code.svelte';
  import { DEFAULT_QUESTION_COUNT, MAX_QUESTION_COUNT } from '#lib/quiz/constants.js';

  import { answerPractice, startPractice } from './practice.remote';
  import type { PracticePageData } from './practice.remote';

  let { data }: { data: PracticePageData } = $props();
  let clientReady = $state(false);

  const markClientReady = () => {
    clientReady = true;
  };

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
      return Math.min(MAX_QUESTION_COUNT, selectedPack.questionCount);
    }

    const selectedDomainQuestionCount = selectedPack.domains
      .filter((domain) => selectedDomainIds.includes(domain.id))
      .reduce((total, domain) => total + domain.questionCount, 0);

    return Math.min(MAX_QUESTION_COUNT, selectedDomainQuestionCount);
  });

  let activeQuestion = $derived(
    data.session?.questions.find(
      (question) => !data.session?.answers.some((answer) => answer.questionId === question.id),
    ),
  );

  let answerForm = $derived(
    activeQuestion && data.session
      ? answerPractice.for(`${data.session.id}:${activeQuestion.id}`)
      : undefined,
  );

  let latestAnswer = $derived(data.session?.answers.at(-1));

  let latestQuestion = $derived(
    data.session?.questions.find((question) => question.id === latestAnswer?.questionId),
  );

  const resetDomains = () => {
    selectedDomainIds = [];
    startPractice.fields.domainIds.set([]);
  };

  const updateDomainSelection = (domainId: string, checked: boolean) => {
    selectedDomainIds = checked
      ? [...selectedDomainIds, domainId]
      : selectedDomainIds.filter((selectedDomainId) => selectedDomainId !== domainId);
    startPractice.fields.domainIds.set(selectedDomainIds);
  };
</script>

<svelte:head>
  <title>Practice quiz</title>
  <meta name="description" content="Choose an exam pack and resume a saved practice quiz." />
</svelte:head>

<main
  {@attach markClientReady}
  class="app-page px-4 py-8 pb-20 sm:px-6"
  data-client-ready={clientReady ? 'true' : 'false'}
>
  <div class="mx-auto w-full max-w-205">
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
        <form {...startPractice} class="grid gap-3">
          <label class="font-bold" for="pack">Exam pack version</label>
          <select
            id="pack"
            class="select app-control-focus min-h-11 w-full"
            onchange={resetDomains}
            bind:value={selectedPackKey}
          >
            {#each data.packs as pack (`${pack.examId}|${pack.packId}|${pack.packVersion}`)}
              <option value="{pack.examId}|{pack.packId}|{pack.packVersion}">
                {pack.examTitle}
                · {pack.packTitle} · v{pack.packVersion}{pack.synthetic ? ' · synthetic' : ''}
              </option>
            {/each}
          </select>
          <input {...startPractice.fields.examId.as('hidden', selectedPack?.examId ?? '')} />
          <input {...startPractice.fields.packId.as('hidden', selectedPack?.packId ?? '')} />
          <input
            {...startPractice.fields.packVersion.as('hidden', selectedPack?.packVersion ?? '')}
          />

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
                    {...startPractice.fields.domainIds.as('checkbox', domain.id)}
                    class="checkbox app-control-focus mt-0.5"
                    onchange={(event) =>
                      updateDomainSelection(domain.id, event.currentTarget.checked)}
                  />
                  <span>{domain.title}</span><small class="text-meta-muted ml-auto"
                    >{domain.weight}%</small
                  >
                </label>
              {/each}
            </fieldset>
            <label class="font-bold" for="question-count">Number of questions</label>
            <input
              {...startPractice.fields.questionCount.as(
                'number',
                Math.min(DEFAULT_QUESTION_COUNT, availableQuestionCount),
              )}
              id="question-count"
              class="input app-control-focus min-h-11 w-full"
              max={availableQuestionCount}
              min="1"
              required
              type="number"
              value={Math.min(DEFAULT_QUESTION_COUNT, availableQuestionCount)}
            />
            {#each startPractice.fields['questionCount'].issues() ?? [] as issue (issue.message)}
              <span class="text-error-text" role="alert">{issue.message}</span>
            {/each}
            <button
              class="btn bg-brand hover:bg-brand-hover focus-visible:outline-focus-gold min-h-11 rounded-lg px-4 font-bold text-white focus-visible:outline-3 focus-visible:outline-offset-3"
              type="submit"
            >
              Start quiz
            </button>
          {/if}
        </form>
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
              <InlineCode
                text={latestQuestion.options
                  .filter((option) => latestAnswer.answerIdsCorrect.includes(option.id))
                  .map((option) => option.text)
                  .join('; ')}
              />
            </p>
            <p class="mb-4"><InlineCode text={latestAnswer.explanation} /></p>
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

        {#if activeQuestion && answerForm}
          <article class="border-divider mt-6 border-t pt-5">
            <p class="tracking-eyebrow text-brand-label mb-2 text-xs font-bold uppercase">
              {data.session.answers.length + 1}
              of {data.session.questionIds.length} ·
              {data.session.questions.find((question) => question.id === activeQuestion.id)
                ?.domainId}
            </p>
            <h2 id="quiz-heading" class="mb-5 text-xl/relaxed font-semibold">
              <InlineCode text={activeQuestion.prompt} />
            </h2>
            <form {...answerForm} class="grid gap-3">
              <input {...answerForm.fields.sessionId.as('hidden', data.session.id)} />
              <input {...answerForm.fields.questionId.as('hidden', activeQuestion.id)} />
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
                      {...answerForm.fields.answerIds.as('checkbox', option.id)}
                      class={[
                        activeQuestion.type === 'multiple_choice' ? 'checkbox' : 'radio',
                        'app-control-focus mt-0.5',
                      ]}
                      required={activeQuestion.type === 'single_choice'}
                      type={activeQuestion.type === 'multiple_choice' ? 'checkbox' : 'radio'}
                    />
                    <span><InlineCode text={option.text} /></span>
                  </label>
                {/each}
              </fieldset>
              {#each answerForm.fields.answerIds.issues() ?? [] as issue (issue.message)}
                <span class="text-error-text" role="alert">{issue.message}</span>
              {/each}
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
