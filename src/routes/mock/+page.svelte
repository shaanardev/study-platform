<script lang="ts">
  import { onMount } from 'svelte';
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
  <title>Timed mock exam · Ordewell</title>
  <meta name="description" content="Take a timed mock exam from an imported exam pack.">
</svelte:head>

<main class="mock">
  <a class="back-link" href="/">← Exam pack library</a>
  <header>
    <p class="eyebrow">Timed mock</p>
    <h1>Mock exam</h1>
    <p>
      Questions follow the imported exam blueprint. Your attempt stays tied to the exact pack
      version you started with.
    </p>
  </header>

  {#if data.attempt?.status === 'in_progress'}
    <section class="timer" aria-live="polite">
      <div>
        <p class="eyebrow">Time remaining</p>
        <strong
          >{Math.floor(remaining / 60_000)}:{String(Math.floor((remaining % 60_000) / 1000)).padStart(2, '0')}</strong
        >
      </div>
      <p>
        {data.attempt.answers.length}
        of {data.attempt.questionIds.length} answers saved ·
        {data.attempt.packId}
        v{data.attempt.packVersion}
      </p>
    </section>
  {/if}

  {#if !data.attempt || data.attempt.status !== 'in_progress'}
    {#if data.packs.length === 0}
      <section class="panel">
        <h2>No exam packs are available yet</h2>
        <p>Import a pack from the exam pack library to start a mock exam.</p>
        <a href="/">Open exam pack library</a>
      </section>
    {:else}
      <section class="panel" aria-labelledby="setup-heading">
        <h2 id="setup-heading">Choose a mock exam</h2>
        <form method="GET" action="/mock" class="preview-form">
          <label for="pack-preview">Exam pack version</label>
          <select
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
          <label for="count-preview">Requested question count</label>
          <input
            id="count-preview"
            name="count"
            type="number"
            min="1"
            max="100"
            value={effectiveQuestionCount}
            onchange={(event) => (selectedQuestionCount = Number(event.currentTarget.value))}
            required
          >
          <button class="secondary" type="submit">Check weighted coverage</button>
        </form>
        {#if selectedCoverage}
          <div class="coverage" aria-live="polite">
            <h3>Blueprint coverage for {selectedCoverage.questionCount} questions</h3>
            <ul>
              {#each selectedPack?.domains ?? [] as domain (domain.id)}
                {@const (allocation = selectedCoverage.allocations[domain.id] ?? 0)}
                {@const (gap = selectedCoverage.gaps.find((item) => item.id === domain.id))}
                <li class:missing={gap}>
                  <span>{domain.title} · {domain.weight}%</span
                  ><span
                    >{domain.questionCount}
                    available / {allocation} needed{gap ? ` · short by ${gap.missing}` : ''}</span
                  >
                </li>
              {/each}
            </ul>
            {#if selectedCoverage.gaps.length}
              <p class="error">
                This pack cannot cover the requested weighted mock. Import more questions for the
                domains listed above. Practice quizzes remain available.
              </p>
            {/if}
          </div>
        {/if}
        {#if form?.message}
          <p class="error" role="alert">{form.message}</p>
        {/if}
        {#if form?.gaps?.length}
          <ul class="error" role="alert">
            {#each form.gaps as gap (gap.id)}
              <li>
                {gap.title}: needs {gap.required}, has {gap.available} (missing {gap.missing})
              </li>
            {/each}
          </ul>
        {/if}
        <form method="POST" action="?/start" class="start-form">
          <input type="hidden" name="examId" value={selectedPack?.examId ?? ''}>
          <input type="hidden" name="packId" value={selectedPack?.packId ?? ''}>
          <input type="hidden" name="packVersion" value={selectedPack?.packVersion ?? ''}>
          <input type="hidden" name="questionCount" value={effectiveQuestionCount}>
          <label for="duration">Time limit in minutes</label>
          <input
            id="duration"
            name="durationMinutes"
            type="number"
            min="1"
            max="600"
            bind:value={durationMinutes}
            required
          >
          <button
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
    <section class="attempt" aria-label="Mock exam attempt">
      {#if data.attempt.status === 'in_progress'}
        <p class="notice">
          Correct answers and explanations will appear after you submit or the timer expires.
        </p>
      {:else}
        <div class="results" role="status">
          <p class="eyebrow">
            {data.attempt.status === 'expired' ? 'Time expired' : 'Submitted'}
            · {data.attempt.packId} v{data.attempt.packVersion}
          </p>
          <h2>Mock exam results</h2>
          <p class="score">
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
          <h3>Domain breakdown</h3>
          <ul>
            {#each data.attempt.score?.domains ?? [] as domain (domain.id)}
              <li>{domain.title}: {domain.correct}/{domain.total} ({domain.percent}%)</li>
            {/each}
          </ul>
        </div>
      {/if}
      {#each data.attempt.questions as question, index (question.id)}
        {@const (answer = data.attempt.answers.find((item) => item.questionId === question.id))}
        <article class="question">
          <p class="eyebrow">
            {index + 1}
            of {data.attempt.questions.length} · {question.domainId}
          </p>
          <h2>{question.prompt}</h2>
          {#if data.attempt.status === 'in_progress'}
            <form method="POST" action="?/answer">
              <input type="hidden" name="attemptId" value={data.attempt.id}>
              <input type="hidden" name="questionId" value={question.id}>
              <fieldset>
                <legend>
                  {question.type === 'multiple_choice' ? 'Select all that apply' : 'Select one answer'}
                </legend>
                {#each question.options as option (option.id)}
                  <label class="option"
                    ><input
                      type={question.type === 'multiple_choice' ? 'checkbox' : 'radio'}
                      name="answerIds"
                      value={option.id}
                      checked={savedAnswers.get(question.id)?.includes(option.id) ?? false}
                      required={question.type === 'single_choice'}
                    ><span>{option.text}</span></label
                  >
                {/each}
              </fieldset>
              <button class="secondary" type="submit">Save answer</button>
            </form>
          {:else}
            <ul class="options">
              {#each question.options as option (option.id)}
                <li
                  class:correct={question.answerIds?.includes(option.id)}
                  class:selected={answer?.answerIds.includes(option.id)}
                >
                  {option.text}
                  {#if question.answerIds?.includes(option.id)}
                    <strong>Correct answer</strong>
                  {/if}
                  {#if answer?.answerIds.includes(option.id)}
                    <span>(your answer)</span>
                  {/if}
                </li>
              {/each}
            </ul>
            <p>{question.explanation}</p>
          {/if}
        </article>
      {/each}
      {#if data.attempt.status === 'in_progress'}
        <form method="POST" action="?/submit" class="submit-form">
          <input type="hidden" name="attemptId" value={data.attempt.id}>
          <button type="submit">Submit mock exam</button>
        </form>
      {/if}
    </section>
  {/if}
</main>

<style>
  :global(body) {
    margin: 0;
    background: #f4f5f2;
    color: #20251f;
    font-family: Inter, ui-sans-serif, system-ui, sans-serif;
  }
  .mock {
    width: min(100% - 2rem, 860px);
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
  h3,
  p {
    margin-top: 0;
  }
  header > p:last-child {
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
  .panel,
  .attempt,
  .timer {
    margin: 1.2rem 0;
    border: 1px solid #dce1d9;
    border-radius: 16px;
    background: #fff;
    padding: 1.4rem;
  }
  .timer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    background: #edf3eb;
  }
  .timer p {
    margin: 0;
    color: #536153;
  }
  .timer strong {
    font-variant-numeric: tabular-nums;
    font-size: 2rem;
  }
  form {
    display: grid;
    gap: 0.8rem;
  }
  label,
  legend {
    font-weight: 700;
  }
  select,
  input[type="number"] {
    width: 100%;
    min-height: 46px;
    border: 1px solid #aeb9ad;
    border-radius: 8px;
    background: #fff;
    padding: 0.6rem 0.7rem;
    color: inherit;
    font: inherit;
  }
  button {
    display: inline-flex;
    min-height: 46px;
    align-items: center;
    justify-content: center;
    border: 0;
    border-radius: 9px;
    background: #28553a;
    padding: 0.75rem 1rem;
    color: #fff;
    font: inherit;
    font-weight: 700;
    cursor: pointer;
  }
  button:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
  button.secondary {
    border: 1px solid #b8c3b5;
    background: #f4f6f2;
    color: #28553a;
  }
  :is(button, a, select, input):focus-visible {
    outline: 3px solid #d29537;
    outline-offset: 3px;
  }
  .preview-form {
    grid-template-columns: 1fr 1fr;
    align-items: center;
  }
  .preview-form button {
    grid-column: 1 / -1;
  }
  .coverage {
    margin: 1.2rem 0;
    border-top: 1px solid #e2e6df;
    padding-top: 1rem;
  }
  .coverage h3 {
    font-size: 1rem;
  }
  .coverage ul,
  .results ul {
    display: grid;
    gap: 0.55rem;
    padding-left: 1.2rem;
  }
  .coverage li {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
  }
  .coverage li span:last-child {
    color: #536153;
    text-align: right;
  }
  .coverage li.missing span:last-child,
  .error {
    color: #9d3028;
  }
  .start-form {
    border-top: 1px solid #e2e6df;
    padding-top: 1rem;
  }
  .notice {
    border-radius: 8px;
    background: #edf3eb;
    padding: 0.9rem 1rem;
  }
  .results {
    margin-bottom: 1.5rem;
    border-left: 5px solid #34734b;
    border-radius: 8px;
    background: #edf7ef;
    padding: 1rem 1.1rem;
  }
  .score {
    font-size: 1.5rem;
    font-weight: 750;
  }
  .question {
    margin-top: 1.5rem;
    border-top: 1px solid #e2e6df;
    padding-top: 1.4rem;
  }
  .question h2 {
    line-height: 1.4;
  }
  fieldset {
    display: grid;
    gap: 0.3rem;
    min-width: 0;
    margin: 0.5rem 0;
    border: 1px solid #dce1d9;
    border-radius: 10px;
    padding: 1rem;
  }
  .option {
    display: flex;
    align-items: flex-start;
    gap: 0.7rem;
    padding: 0.7rem 0.3rem;
    font-weight: 500;
  }
  input[type="checkbox"],
  input[type="radio"] {
    width: 1.1rem;
    height: 1.1rem;
    accent-color: #28553a;
  }
  .options {
    display: grid;
    gap: 0.6rem;
    padding-left: 1.3rem;
  }
  .options li {
    border-radius: 6px;
    padding: 0.35rem;
  }
  .options li.correct {
    background: #edf7ef;
  }
  .options li.selected:not(.correct) {
    color: #9d3028;
  }
  .submit-form {
    margin-top: 2rem;
    border-top: 1px solid #e2e6df;
    padding-top: 1.4rem;
  }
  @media (max-width: 600px) {
    .preview-form {
      grid-template-columns: 1fr;
    }
    .preview-form button {
      grid-column: auto;
    }
    .timer,
    .coverage li {
      align-items: flex-start;
      flex-direction: column;
    }
    .panel,
    .attempt,
    .timer {
      padding: 1rem;
    }
  }
</style>
