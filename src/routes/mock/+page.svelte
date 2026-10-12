<script lang="ts">
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();
  let selectedPackKey = $state('');
  let selectedQuestionCount = $state(0);
  let durationMinutes = $state(30);
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
    new Map(data.attempt?.answers.map((answer) => [answer.questionId, answer.answerIds]) ?? []),
  );

  onMount(() => {
    const timer = window.setInterval(() => {
      now = Date.now();
      if (data.attempt?.status === 'in_progress' && remaining <= 0) window.location.reload();
    }, 1000);
    return () => window.clearInterval(timer);
  });
</script>

<svelte:head>
  <title>Timed mock exam</title>
  <meta name="description" content="Take a timed mock exam from an imported exam pack.">
</svelte:head>

<main class="min-h-screen bg-[#f4f5f2] px-4 pb-20 pt-8 text-[#20251f] sm:px-6">
  <div class="mx-auto w-full max-w-215">
    <a
      class="inline-block font-semibold text-[#28553a] underline-offset-4 hover:underline focus-visible:outline-3 focus-visible:outline-[#d29537] focus-visible:outline-offset-3"
      href={resolve('/')}
      >← Exam pack library</a
    >
    <header class="my-8 max-w-175">
      <p class="mb-2 text-xs font-bold tracking-[0.09em] text-[#536c57] uppercase">Timed mock</p>
      <h1 class="mb-3 text-[clamp(2.2rem,6vw,3.3rem)] leading-[1.05] font-bold tracking-[-0.045em]">
        Mock exam
      </h1>
      <p class="m-0 leading-relaxed text-[#5e665e]">
        Questions follow the imported exam blueprint. Your attempt stays tied to the exact pack
        version you started with.
      </p>
    </header>

    {#if data.attempt?.status === 'in_progress'}
      <section
        class="my-5 flex flex-col justify-between gap-4 rounded-2xl border border-[#dce1d9] bg-[#edf3eb] p-4 sm:flex-row sm:items-center sm:p-6"
        aria-live="polite"
      >
        <div>
          <p class="mb-2 text-xs font-bold tracking-[0.09em] text-[#536c57] uppercase">
            Time remaining
          </p>
          <strong class="text-3xl [font-variant-numeric:tabular-nums]"
            >{Math.floor(remaining / 60_000)}:{String(
              Math.floor((remaining % 60_000) / 1000),
            ).padStart(2, '0')}</strong
          >
        </div>
        <p class="m-0 text-[#536153]">
          {data.attempt.answers.length}
          of {data.attempt.questionIds.length} answers saved ·
          {data.attempt.packId}
          v{data.attempt.packVersion}
        </p>
      </section>
    {/if}

    {#if data.attempt?.status !== 'in_progress'}
      {#if data.packs.length === 0}
        <section class="card my-5 rounded-2xl border border-[#dce1d9] bg-white p-4 sm:p-6">
          <h2 class="mb-3 text-xl font-semibold">No exam packs are available yet</h2>
          <p>Import a pack from the exam pack library to start a mock exam.</p>
          <a
            class="font-semibold text-[#28553a] underline-offset-4 hover:underline focus-visible:outline-3 focus-visible:outline-[#d29537] focus-visible:outline-offset-3"
            href={resolve('/')}
            >Open exam pack library</a
          >
        </section>
      {:else}
        <section
          class="card my-5 rounded-2xl border border-[#dce1d9] bg-white p-4 sm:p-6"
          aria-labelledby="setup-heading"
        >
          <h2 id="setup-heading" class="mb-5 text-xl font-semibold">Choose a mock exam</h2>
          <form
            method="GET"
            action={resolve('/mock')}
            class="grid gap-3 sm:grid-cols-2 sm:items-center"
          >
            <label class="font-bold" for="pack-preview">Exam pack version</label>
            <select
              class="select min-h-12 w-full rounded-lg border border-[#aeb9ad] bg-white px-3 py-2 text-inherit focus-visible:outline-3 focus-visible:outline-[#d29537] focus-visible:outline-offset-3"
              id="pack-preview"
              name="packChoice"
              value={effectivePackKey}
              onchange={(event) => (selectedPackKey = event.currentTarget.value)}
            >
              {#each data.packs as pack (`${pack.examId}|${pack.packId}|${pack.packVersion}`)}
                <option value={`${pack.examId}|${pack.packId}|${pack.packVersion}`}>
                  {pack.examTitle}
                  · {pack.packTitle} · v{pack.packVersion}{pack.synthetic ? ' · synthetic' : ''}
                </option>
              {/each}
            </select>
            <label class="font-bold" for="count-preview">Requested question count</label>
            <input
              class="input min-h-12 w-full rounded-lg border border-[#aeb9ad] bg-white px-3 py-2 text-inherit focus-visible:outline-3 focus-visible:outline-[#d29537] focus-visible:outline-offset-3"
              id="count-preview"
              name="count"
              type="number"
              min="1"
              max="100"
              value={effectiveQuestionCount}
              onchange={(event) => (selectedQuestionCount = Number(event.currentTarget.value))}
              required
            >
            <button
              class="btn inline-flex min-h-12 items-center justify-center rounded-lg border border-[#b8c3b5] bg-[#f4f6f2] px-4 py-3 font-bold text-[#28553a] hover:bg-[#edf3eb] focus-visible:outline-3 focus-visible:outline-[#d29537] focus-visible:outline-offset-3 sm:col-span-2"
              type="submit"
            >
              Check weighted coverage
            </button>
          </form>
          {#if selectedCoverage}
            <div class="my-5 border-t border-[#e2e6df] pt-4" aria-live="polite">
              <h3 class="mb-3 text-base font-semibold">
                Blueprint coverage for {selectedCoverage.questionCount} questions
              </h3>
              <ul class="grid gap-2 pl-5">
                {#each selectedPack?.domains ?? [] as domain (domain.id)}
                  <li class="flex flex-col justify-between gap-1 sm:flex-row sm:gap-4">
                    <span>{domain.title} · {domain.weight}%</span
                    ><span
                      class={[
                        'text-left text-[#536153] sm:text-right',
                        selectedCoverage.gaps.some((item) => item.id === domain.id) &&
                          'text-[#9d3028]',
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
                <p class="mt-4 text-[#9d3028]">
                  This pack cannot cover the requested weighted mock. Import more questions for the
                  domains listed above. Practice quizzes remain available.
                </p>
              {/if}
            </div>
          {/if}
          {#if form?.message}
            <p class="mt-4 text-[#9d3028]" role="alert">{form.message}</p>
          {/if}
          {#if form?.gaps?.length}
            <ul class="mt-4 grid gap-2 pl-5 text-[#9d3028]" role="alert">
              {#each form.gaps as gap (gap.id)}
                <li>
                  {gap.title}: needs {gap.required}, has {gap.available} (missing {gap.missing})
                </li>
              {/each}
            </ul>
          {/if}
          <form
            method="POST"
            action={resolve('/mock?/start')}
            class="mt-5 grid gap-3 border-t border-[#e2e6df] pt-4"
          >
            <input type="hidden" name="examId" value={selectedPack?.examId ?? ''}>
            <input type="hidden" name="packId" value={selectedPack?.packId ?? ''}>
            <input type="hidden" name="packVersion" value={selectedPack?.packVersion ?? ''}>
            <input type="hidden" name="questionCount" value={effectiveQuestionCount}>
            <label class="font-bold" for="duration">Time limit in minutes</label>
            <input
              class="input min-h-12 w-full rounded-lg border border-[#aeb9ad] bg-white px-3 py-2 text-inherit focus-visible:outline-3 focus-visible:outline-[#d29537] focus-visible:outline-offset-3"
              id="duration"
              name="durationMinutes"
              type="number"
              min="1"
              max="600"
              bind:value={durationMinutes}
              required
            >
            <button
              class="btn inline-flex min-h-12 items-center justify-center rounded-lg bg-[#28553a] px-4 py-3 font-bold text-white hover:bg-[#20452f] focus-visible:outline-3 focus-visible:outline-[#d29537] focus-visible:outline-offset-3 disabled:cursor-not-allowed disabled:opacity-50"
              type="submit"
              disabled={!selectedPack || (selectedCoverage?.gaps.length ?? 1) > 0}
            >
              Start timed mock
            </button>
          </form>
        </section>
      {/if}
    {/if}

    {#if data.attempt}
      <section
        class="card my-5 rounded-2xl border border-[#dce1d9] bg-white p-4 sm:p-6"
        aria-label="Mock exam attempt"
      >
        {#if data.attempt.status === 'in_progress'}
          <p class="rounded-lg bg-[#edf3eb] p-4">
            Correct answers and explanations will appear after you submit or the timer expires.
          </p>
        {:else}
          <div
            class="mb-6 rounded-lg border-l-[5px] border-[#34734b] bg-[#edf7ef] p-4"
            role="status"
          >
            <p class="mb-2 text-xs font-bold tracking-[0.09em] text-[#536c57] uppercase">
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
          <article class="mt-6 border-t border-[#e2e6df] pt-5">
            <p class="mb-2 text-xs font-bold tracking-[0.09em] text-[#536c57] uppercase">
              {index + 1}
              of {data.attempt.questions.length} · {question.domainId}
            </p>
            <h2 class="mb-4 text-xl leading-relaxed font-semibold">{question.prompt}</h2>
            {#if data.attempt.status === 'in_progress'}
              <form method="POST" action={resolve('/mock?/answer')} class="grid gap-3">
                <input type="hidden" name="attemptId" value={data.attempt.id}>
                <input type="hidden" name="questionId" value={question.id}>
                <fieldset class="my-2 grid min-w-0 gap-1 rounded-xl border border-[#dce1d9] p-4">
                  <legend class="font-bold">
                    {question.type === 'multiple_choice'
                      ? 'Select all that apply'
                      : 'Select one answer'}
                  </legend>
                  {#each question.options as option (option.id)}
                    <label
                      class="flex items-start gap-3 rounded-md px-1 py-3 font-medium has-checked:bg-[#edf3eb] focus-within:outline-2 focus-within:outline-[#d29537]"
                      ><input
                        type={question.type === 'multiple_choice' ? 'checkbox' : 'radio'}
                        name="answerIds"
                        value={option.id}
                        class="mt-0.5 size-[1.1rem] accent-[#28553a] focus-visible:outline-2 focus-visible:outline-[#d29537]"
                        checked={savedAnswers.get(question.id)?.includes(option.id) ?? false}
                        required={question.type === 'single_choice'}
                      ><span>{option.text}</span></label
                    >
                  {/each}
                </fieldset>
                <button
                  class="btn inline-flex min-h-12 items-center justify-center rounded-lg border border-[#b8c3b5] bg-[#f4f6f2] px-4 py-3 font-bold text-[#28553a] hover:bg-[#edf3eb] focus-visible:outline-3 focus-visible:outline-[#d29537] focus-visible:outline-offset-3"
                  type="submit"
                >
                  Save answer
                </button>
              </form>
            {:else}
              <ul class="grid gap-2 pl-5">
                {#each question.options as option (option.id)}
                  <li
                    class={[
                      'rounded-md p-2',
                      question.answerIds?.includes(option.id) && 'bg-[#edf7ef]',
                      data.attempt.answers
                        .find((item) => item.questionId === question.id)
                        ?.answerIds.includes(option.id) &&
                        !question.answerIds?.includes(option.id) &&
                        'text-[#9d3028]',
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
          <form
            method="POST"
            action={resolve('/mock?/submit')}
            class="mt-8 grid gap-3 border-t border-[#e2e6df] pt-5"
          >
            <input type="hidden" name="attemptId" value={data.attempt.id}>
            <button
              class="btn inline-flex min-h-12 items-center justify-center rounded-lg bg-[#28553a] px-4 py-3 font-bold text-white hover:bg-[#20452f] focus-visible:outline-3 focus-visible:outline-[#d29537] focus-visible:outline-offset-3"
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
