<script lang="ts">
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { onMount } from 'svelte';

  import {
    DEFAULT_MOCK_DURATION_MINUTES,
    MILLISECONDS_PER_MINUTE,
    MILLISECONDS_PER_SECOND,
    TIME_COMPONENT_WIDTH,
  } from '#lib/quiz/constants.js';

  import {
    getMockPage,
    saveMockAnswer as saveMockAnswerForm,
    startMock,
    submitMock,
  } from './mock.remote';

  let queryArguments = $derived({
    attemptId: page.url.searchParams.get('attempt') ?? undefined,
    count: page.url.searchParams.get('count') ?? undefined,
    packChoice: page.url.searchParams.get('packChoice') ?? undefined,
  });

  let data = $derived(await getMockPage(queryArguments));
  let selectedPackKey = $state('');
  let selectedQuestionCount = $state(0);
  let durationMinutes = $state(DEFAULT_MOCK_DURATION_MINUTES);
  let now = $state(Date.now());
  let effectivePackKey = $derived(selectedPackKey || data.selectedPackKey);
  let effectiveQuestionCount = $derived(selectedQuestionCount || data.questionCount);

  let selectedPack = $derived(
    data.packs.find(
      (pack) => `${pack.examId}|${pack.packId}|${pack.packVersion}` === effectivePackKey,
    ) ?? data.packs[0],
  );

  let selectedCoverage = $derived(
    selectedPack
      ? data.coverages[`${selectedPack.examId}|${selectedPack.packId}|${selectedPack.packVersion}`]
      : undefined,
  );

  let remaining = $derived(data.attempt ? Math.max(0, data.attempt.deadline - now) : 0);

  let savedAnswers = $derived(
    new Map(data.attempt?.answers.map((answer) => [answer.questionId, answer.answerIds])),
  );

  onMount(() => {
    const timer = window.setInterval(() => {
      now = Date.now();

      if (data.attempt?.status === 'in_progress' && remaining <= 0) {
        window.location.reload();
      }
    }, MILLISECONDS_PER_SECOND);

    return () => window.clearInterval(timer);
  });
</script>

<svelte:head>
  <title>Timed mock exam</title>
  <meta name="description" content="Take a timed mock exam from an imported exam pack." />
</svelte:head>

<main class="bg-app-canvas text-app-ink min-h-screen px-4 pt-8 pb-20 sm:px-6">
  <div class="mx-auto w-full max-w-215">
    <a
      class="text-brand focus-visible:outline-focus-gold inline-block font-semibold underline-offset-4 hover:underline focus-visible:outline-3 focus-visible:outline-offset-3"
      href={resolve('/')}>← Exam pack library</a
    >
    <header class="my-8 max-w-175">
      <p class="tracking-eyebrow text-brand-label mb-2 text-xs font-bold uppercase">Timed mock</p>
      <h1 class="text-page-title-medium leading-page-title tracking-page-title mb-3 font-bold">
        Mock exam
      </h1>
      <p class="text-body-muted m-0 leading-relaxed">
        Questions follow the imported exam blueprint. Your attempt stays tied to the exact pack
        version you started with.
      </p>
    </header>

    {#if data.attempt?.status === 'in_progress'}
      <section
        class="border-card-border bg-panel-tint my-5 flex flex-col justify-between gap-4 rounded-2xl border p-4 sm:flex-row sm:items-center sm:p-6"
        aria-live="polite"
      >
        <div>
          <p class="tracking-eyebrow text-brand-label mb-2 text-xs font-bold uppercase">
            Time remaining
          </p>
          <strong class="text-3xl tabular-nums"
            >{Math.floor(remaining / MILLISECONDS_PER_MINUTE)}:{String(
              Math.floor((remaining % MILLISECONDS_PER_MINUTE) / MILLISECONDS_PER_SECOND),
            ).padStart(TIME_COMPONENT_WIDTH, '0')}</strong
          >
        </div>
        <p class="text-mock-muted m-0">
          {data.attempt.answers.length}
          of {data.attempt.questionIds.length} answers saved ·
          {data.attempt.packId}
          v{data.attempt.packVersion}
        </p>
      </section>
    {/if}

    {#if data.attempt?.status !== 'in_progress'}
      {#if data.packs.length === 0}
        <section class="card border-card-border my-5 rounded-2xl border bg-white p-4 sm:p-6">
          <h2 class="mb-3 text-xl font-semibold">No exam packs are available yet</h2>
          <p>Import a pack from the exam pack library to start a mock exam.</p>
          <a
            class="text-brand focus-visible:outline-focus-gold font-semibold underline-offset-4 hover:underline focus-visible:outline-3 focus-visible:outline-offset-3"
            href={resolve('/')}>Open exam pack library</a
          >
        </section>
      {:else}
        <section
          class="card border-card-border my-5 rounded-2xl border bg-white p-4 sm:p-6"
          aria-labelledby="setup-heading"
        >
          <h2 id="setup-heading" class="mb-5 text-xl font-semibold">Choose a mock exam</h2>
          <form
            class="grid gap-3 sm:grid-cols-2 sm:items-center"
            action={resolve('/mock')}
            method="GET"
          >
            <label class="font-bold" for="pack-preview">Exam pack version</label>
            <select
              id="pack-preview"
              name="packChoice"
              class="select border-control-border focus-visible:outline-focus-gold min-h-12 w-full rounded-lg border bg-white px-3 py-2 text-inherit focus-visible:outline-3 focus-visible:outline-offset-3"
              onchange={(event) => (selectedPackKey = event.currentTarget.value)}
              value={effectivePackKey}
            >
              {#each data.packs as pack (`${pack.examId}|${pack.packId}|${pack.packVersion}`)}
                <option value="{pack.examId}|{pack.packId}|{pack.packVersion}">
                  {pack.examTitle}
                  · {pack.packTitle} · v{pack.packVersion}{pack.synthetic ? ' · synthetic' : ''}
                </option>
              {/each}
            </select>
            <label class="font-bold" for="count-preview">Requested question count</label>
            <input
              id="count-preview"
              name="count"
              class="input border-control-border focus-visible:outline-focus-gold min-h-12 w-full rounded-lg border bg-white px-3 py-2 text-inherit focus-visible:outline-3 focus-visible:outline-offset-3"
              max="100"
              min="1"
              onchange={(event) => (selectedQuestionCount = Number(event.currentTarget.value))}
              required
              type="number"
              value={effectiveQuestionCount}
            />
            <button
              class="btn border-control-muted bg-control-fill text-brand hover:bg-panel-tint focus-visible:outline-focus-gold inline-flex min-h-12 items-center justify-center rounded-lg border px-4 py-3 font-bold focus-visible:outline-3 focus-visible:outline-offset-3 sm:col-span-2"
              type="submit"
            >
              Check weighted coverage
            </button>
          </form>
          {#if selectedCoverage}
            <div class="border-divider my-5 border-t pt-4" aria-live="polite">
              <h3 class="mb-3 text-base font-semibold">
                Blueprint coverage for {selectedCoverage.questionCount} questions
              </h3>
              <ul class="grid gap-2 pl-5">
                {#each selectedPack?.domains ?? [] as domain (domain.id)}
                  <li class="flex flex-col justify-between gap-1 sm:flex-row sm:gap-4">
                    <span>{domain.title} · {domain.weight}%</span><span
                      class={[
                        'text-left sm:text-right',
                        selectedCoverage.gaps.some((item) => item.id === domain.id)
                          ? 'text-error-text'
                          : 'text-mock-muted',
                      ]}
                      >{domain.questionCount}
                      available /
                      {selectedCoverage.allocations[domain.id] ?? 0}
                      needed{selectedCoverage.gaps.find((item) => item.id === domain.id)
                        ? ` · short by ${selectedCoverage.gaps.find((item) => item.id === domain.id)?.missing}`
                        : ''}</span
                    >
                  </li>
                {/each}
              </ul>
              {#if selectedCoverage.gaps.length}
                <p class="text-error-text mt-4">
                  This pack cannot cover the requested weighted mock. Import more questions for the
                  domains listed above. Practice quizzes remain available.
                </p>
              {/if}
            </div>
          {/if}
          <form {...startMock} class="border-divider mt-5 grid gap-3 border-t pt-4">
            <input {...startMock.fields.examId.as('hidden', selectedPack?.examId ?? '')} />
            <input {...startMock.fields.packId.as('hidden', selectedPack?.packId ?? '')} />
            <input
              {...startMock.fields.packVersion.as('hidden', selectedPack?.packVersion ?? '')}
            />
            <input
              {...startMock.fields.questionCount.as('hidden', String(effectiveQuestionCount))}
            />
            <label class="font-bold" for="duration">Time limit in minutes</label>
            <input
              {...startMock.fields.durationMinutes.as('text')}
              id="duration"
              class="input border-control-border focus-visible:outline-focus-gold min-h-12 w-full rounded-lg border bg-white px-3 py-2 text-inherit focus-visible:outline-3 focus-visible:outline-offset-3"
              max="600"
              min="1"
              required
              type="number"
              bind:value={durationMinutes}
            />
            <button
              class="btn bg-brand hover:bg-brand-hover-deep focus-visible:outline-focus-gold inline-flex min-h-12 items-center justify-center rounded-lg px-4 py-3 font-bold text-white focus-visible:outline-3 focus-visible:outline-offset-3 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!selectedPack || (selectedCoverage?.gaps.length ?? 1) > 0}
              type="submit"
            >
              Start timed mock
            </button>
          </form>
          {#each startMock.fields.questionCount.issues() ?? [] as issue (issue.message)}
            <p class="text-error-text mt-4" role="alert">{issue.message}</p>
          {/each}
          {#each startMock.fields.durationMinutes.issues() ?? [] as issue (issue.message)}
            <p class="text-error-text mt-4" role="alert">{issue.message}</p>
          {/each}
        </section>
      {/if}
    {/if}

    {#if data.attempt}
      <section
        class="card border-card-border my-5 rounded-2xl border bg-white p-4 sm:p-6"
        aria-label="Mock exam attempt"
      >
        {#if data.attempt.status === 'in_progress'}
          <p class="bg-panel-tint rounded-lg p-4">
            Correct answers and explanations will appear after you submit or the timer expires.
          </p>
        {:else}
          <div
            class="feedback-border-width border-feedback-positive-border bg-feedback-positive-fill mb-6 rounded-lg p-4"
            role="status"
          >
            <p class="tracking-eyebrow text-brand-label mb-2 text-xs font-bold uppercase">
              {data.attempt.status === 'expired' ? 'Time expired' : 'Submitted'}
              · {data.attempt.packId} v{data.attempt.packVersion}
            </p>
            <h2 class="mb-3 text-xl font-semibold">Mock exam results</h2>
            <p class="text-2xl font-bold">
              {data.attempt.score?.correct}
              / {data.attempt.score?.total} correct · {data.attempt.score?.percent}%
            </p>
            {#if data.attempt.score?.passingThreshold !== undefined}
              <p>
                {data.attempt.score.passed ? 'Pass' : 'Fail'}
                against the pack threshold of {data.attempt.score.passingThreshold}%. This is a
                practice result, not an official certification result.
              </p>
            {:else}
              <p>This is a practice result, not an official certification result.</p>
            {/if}
            <h3 class="mb-3 font-semibold">Domain breakdown</h3>
            <ul class="grid gap-2 pl-5">
              {#each data.attempt.score?.domains ?? [] as domain (domain.id)}
                <li>{domain.title}: {domain.correct}/{domain.total} ({domain.percent}%)</li>
              {/each}
            </ul>
          </div>
        {/if}
        {#each data.attempt.questions as question, index (question.id)}
          <article class="border-divider mt-6 border-t pt-5">
            <p class="tracking-eyebrow text-brand-label mb-2 text-xs font-bold uppercase">
              {index + 1}
              of {data.attempt.questions.length} · {question.domainId}
            </p>
            <h2 class="mb-4 text-xl/relaxed font-semibold">{question.prompt}</h2>
            {#if data.attempt.status === 'in_progress'}
              {const answerForm = $derived(saveMockAnswerForm.for(question.id))}
              <form {...answerForm} class="grid gap-3">
                <input {...answerForm.fields.attemptId.as('hidden', data.attempt.id)} />
                <input {...answerForm.fields.questionId.as('hidden', question.id)} />
                <fieldset class="border-card-border my-2 grid min-w-0 gap-1 rounded-xl border p-4">
                  <legend class="font-bold">
                    {question.type === 'multiple_choice'
                      ? 'Select all that apply'
                      : 'Select one answer'}
                  </legend>
                  {#each question.options as option (option.id)}
                    <label
                      class="has-checked:bg-panel-tint focus-within:outline-focus-gold flex items-start gap-3 rounded-md px-1 py-3 font-medium focus-within:outline-2"
                    >
                      {#if question.type === 'multiple_choice'}
                        <input
                          {...answerForm.fields['answerIds'].as(
                            'checkbox',
                            option.id,
                            savedAnswers.get(question.id)?.includes(option.id) ?? false,
                          )}
                          class="size-answer-control accent-brand focus-visible:outline-focus-gold mt-0.5 focus-visible:outline-2"
                        />
                      {:else}
                        <input
                          {...answerForm.fields['answerId'].as(
                            'radio',
                            option.id,
                            savedAnswers.get(question.id)?.includes(option.id) ?? false,
                          )}
                          class="size-answer-control accent-brand focus-visible:outline-focus-gold mt-0.5 focus-visible:outline-2"
                          required
                        />
                      {/if}
                      <span>{option.text}</span>
                    </label>
                  {/each}
                </fieldset>
                <button
                  class="btn border-control-muted bg-control-fill text-brand hover:bg-panel-tint focus-visible:outline-focus-gold inline-flex min-h-12 items-center justify-center rounded-lg border px-4 py-3 font-bold focus-visible:outline-3 focus-visible:outline-offset-3"
                  type="submit"
                >
                  Save answer
                </button>
                {#each answerForm.fields['answerIds'].issues() ?? [] as issue (issue.message)}
                  <p class="text-error-text" role="alert">{issue.message}</p>
                {/each}
              </form>
            {:else}
              <ul class="grid gap-2 pl-5">
                {#each question.options as option (option.id)}
                  <li
                    class={[
                      'rounded-md p-2',
                      question.answerIds?.includes(option.id) && 'bg-feedback-positive-fill',
                      data.attempt.answers
                        .find((item) => item.questionId === question.id)
                        ?.answerIds.includes(option.id) &&
                        !question.answerIds?.includes(option.id) &&
                        'text-error-text',
                    ]}
                  >
                    {option.text}
                    {#if question.answerIds?.includes(option.id)}
                      <strong>Correct answer</strong>
                    {/if}
                    {#if data.attempt.answers
                      .find((item) => item.questionId === question.id)
                      ?.answerIds.includes(option.id)}
                      <span>(your answer)</span>
                    {/if}
                  </li>
                {/each}
              </ul>
              <p class="mt-4">{question.explanation}</p>
            {/if}
          </article>
        {/each}
        {#if data.attempt.status === 'in_progress'}
          <form {...submitMock} class="border-divider mt-8 grid gap-3 border-t pt-5">
            <input {...submitMock.fields.attemptId.as('hidden', data.attempt.id)} />
            <button
              class="btn bg-brand hover:bg-brand-hover-deep focus-visible:outline-focus-gold inline-flex min-h-12 items-center justify-center rounded-lg px-4 py-3 font-bold text-white focus-visible:outline-3 focus-visible:outline-offset-3"
              type="submit"
            >
              Submit mock exam
            </button>
          </form>
        {/if}
      </section>
    {/if}
  </div>
</main>
