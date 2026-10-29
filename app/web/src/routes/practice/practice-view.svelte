<script lang="ts">
  import { resolve } from '$app/paths';
  import { tick } from 'svelte';

  import InlineCode from '#lib/components/inline-code.svelte';
  import { DEFAULT_QUESTION_COUNT, MAX_QUESTION_COUNT } from '#lib/quiz/constants.js';
  import { practiceSourcePath } from '#lib/route-urls.js';

  import { answerPractice, startPractice } from './practice.remote';
  import type { PracticePageData } from './practice.remote';

  let { data }: { data: PracticePageData } = $props();
  let feedbackElement: HTMLDivElement | undefined = $state();
  let clientReady = $state(false);

  const markClientReady = () => {
    clientReady = true;
  };

  const packKey = (pack: (typeof data.packs)[number]) =>
    `${pack.examId}|${pack.packId}|${pack.packVersion}`;

  let selectedPackKey = $state('');
  let selectedDomainIds = $state<string[]>([]);

  let selectedPack = $derived(
    data.packs.find((pack) => packKey(pack) === selectedPackKey) ?? data.packs[0],
  );

  const countEligibleQuestions = (pack: typeof selectedPack, domainIds: string[]): number => {
    if (!pack) {
      return 0;
    }

    if (domainIds.length === 0) {
      return pack.questionCount;
    }

    return pack.domains
      .filter((domain) => domainIds.includes(domain.id))
      .reduce((total, domain) => total + domain.questionCount, 0);
  };

  let eligibleQuestionCount = $derived(countEligibleQuestions(selectedPack, selectedDomainIds));
  let questionLimit = $derived(Math.min(MAX_QUESTION_COUNT, eligibleQuestionCount));

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

  const clampQuestionCount = (
    availableCount: number,
    requestedCount = Number(startPractice.fields.questionCount.value()),
  ) => {
    const requested =
      Number.isInteger(requestedCount) && requestedCount > 0
        ? requestedCount
        : DEFAULT_QUESTION_COUNT;

    startPractice.fields.questionCount.set(
      availableCount === 0 ? 0 : Math.max(1, Math.min(requested, availableCount)),
    );
  };

  const changePack = (event: Event & { currentTarget: HTMLSelectElement }) => {
    selectedPackKey = event.currentTarget.value;
    selectedDomainIds = [];
    startPractice.fields.domainIds.set([]);

    const nextPack = data.packs.find((pack) => packKey(pack) === selectedPackKey);

    clampQuestionCount(nextPack?.questionCount ?? 0);
  };

  const updateDomainSelection = (domainId: string, checked: boolean) => {
    const nextDomainIds = checked
      ? [...selectedDomainIds, domainId]
      : selectedDomainIds.filter((selectedDomainId) => selectedDomainId !== domainId);

    selectedDomainIds = nextDomainIds;
    startPractice.fields.domainIds.set(nextDomainIds);
    clampQuestionCount(countEligibleQuestions(selectedPack, nextDomainIds));
  };

  const updateQuestionCount = (event: Event & { currentTarget: HTMLInputElement }) => {
    clampQuestionCount(questionLimit, event.currentTarget.valueAsNumber);
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
            onchange={changePack}
            value={selectedPackKey || (data.packs[0] ? packKey(data.packs[0]) : '')}
          >
            {#each data.packs as pack (packKey(pack))}
              <option value={packKey(pack)}>
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
            <p class="text-body-muted m-0" id="eligible-count">
              {eligibleQuestionCount} eligible question{eligibleQuestionCount === 1 ? '' : 's'}
              {#if eligibleQuestionCount > MAX_QUESTION_COUNT}
                · Up to {MAX_QUESTION_COUNT} per quiz
              {/if}
            </p>
            {#if eligibleQuestionCount === 0}
              <p class="text-error-text m-0" id="no-eligible-questions" role="status">
                No questions are eligible for this pack and domain selection. Choose another domain
                or pack.
              </p>
            {/if}
            <input
              {...startPractice.fields.questionCount.as(
                'number',
                Math.min(DEFAULT_QUESTION_COUNT, questionLimit),
              )}
              id="question-count"
              class="input app-control-focus min-h-11 w-full"
              aria-describedby="eligible-count"
              disabled={eligibleQuestionCount === 0}
              max={questionLimit}
              min="1"
              onchange={updateQuestionCount}
              required
              type="number"
            />
            {#each startPractice.fields['questionCount'].issues() ?? [] as issue (issue.message)}
              <span class="text-error-text" role="alert">{issue.message}</span>
            {/each}
            <button
              class="btn bg-brand hover:bg-brand-hover focus-visible:outline-focus-gold min-h-11 rounded-lg px-4 font-bold text-white focus-visible:outline-3 focus-visible:outline-offset-3"
              disabled={eligibleQuestionCount === 0}
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
            bind:this={feedbackElement}
            class={[
              'feedback-border-width my-4 rounded-lg p-4',
              latestAnswer.correct
                ? 'border-feedback-positive-border bg-feedback-positive-fill'
                : 'border-feedback-warning-border bg-feedback-warning-fill',
            ]}
            aria-live="polite"
            id="answer-feedback"
            role="status"
            tabindex="-1"
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
                    practiceSourcePath({
                      examId: data.session.examId,
                      packId: data.session.packId,
                      packVersion: data.session.packVersion,
                      path: source.path,
                      questionId: latestAnswer.questionId,
                    }),
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
            <form
              {...answerForm.enhance(async (form) => {
                if (await form.submit()) {
                  await tick();
                  feedbackElement?.focus();
                }
              })}
              class="grid gap-3"
            >
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
