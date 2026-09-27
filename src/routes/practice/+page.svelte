<script lang="ts">
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();
  let selectedPackKey = $state('');
  let selectedDomainIds = $state<string[]>([]);
  let selectedPack = $derived(
    data.packs.find(
      (pack) => `${pack.examId}|${pack.packId}|${pack.packVersion}` === selectedPackKey,
    ) ?? data.packs[0],
  );
  let availableQuestionCount = $derived(
    Math.min(
      100,
      selectedPack
        ? selectedDomainIds.length > 0
          ? selectedPack.domains
              .filter((domain) => selectedDomainIds.includes(domain.id))
              .reduce((total, domain) => total + domain.questionCount, 0)
          : selectedPack.questionCount
        : 0,
    ),
  );
  let activeQuestion = $derived(
    data.session?.questions.find(
      (question) => !data.session?.answers.some((answer) => answer.questionId === question.id),
    ),
  );
  let latestAnswer = $derived(data.session?.answers.at(-1));
  let latestQuestion = $derived(
    data.session?.questions.find((question) => question.id === latestAnswer?.questionId),
  );
</script>

<svelte:head>
  <title>Practice quiz · Ordewell</title>
  <meta name="description" content="Choose an exam pack and resume a saved practice quiz.">
</svelte:head>

<main class="practice">
  <a class="back-link" href="/">← Exam pack library</a>
  <header>
    <p class="eyebrow">Practice</p>
    <h1>Build your exam confidence</h1>
    <p>Choose an imported exam pack, focus on domains, and your answers will be saved as you go.</p>
  </header>

  {#if data.session?.status === 'in_progress'}
    <section class="resume" aria-label="Saved practice session">
      <div>
        <p class="eyebrow">Saved session</p>
        <h2>
          {data.packs.find(
    (pack) =>
      pack.examId === data.session?.examId &&
      pack.packId === data.session?.packId &&
      pack.packVersion === data.session?.packVersion,
  )?.packTitle ?? 'Practice quiz'}
        </h2>
        <p>
          {data.session.answers.length}
          of {data.session.questionIds.length} answered · Pack version {data.session.packVersion}
        </p>
      </div>
      <a class="button-link" href={`/practice?session=${encodeURIComponent(data.session.id)}`}
        >Resume quiz</a
      >
    </section>
  {/if}

  {#if data.packs.length === 0}
    <section class="empty">
      <h2>No exam packs are available yet</h2>
      <p>Import a pack from the exam pack library to begin a practice quiz.</p>
      <a href="/">Open exam pack library</a>
    </section>
  {:else}
    <section class="setup" aria-labelledby="setup-heading">
      <h2 id="setup-heading">Start a practice quiz</h2>
      <form method="POST" action="?/start">
        <label for="pack">Exam pack version</label>
        <select
          id="pack"
          name="packChoice"
          bind:value={selectedPackKey}
          onchange={() => (selectedDomainIds = [])}
        >
          {#each data.packs as pack (`${pack.examId}|${pack.packId}|${pack.packVersion}`)}
            <option value={`${pack.examId}|${pack.packId}|${pack.packVersion}`}>
              {pack.examTitle}
              · {pack.packTitle} · v{pack.packVersion}{pack.synthetic ? ' · synthetic' : ''}
            </option>
          {/each}
        </select>
        <input type="hidden" name="examId" value={selectedPack?.examId ?? ''}>
        <input type="hidden" name="packId" value={selectedPack?.packId ?? ''}>
        <input type="hidden" name="packVersion" value={selectedPack?.packVersion ?? ''}>

        {#if selectedPack}
          <fieldset>
            <legend>Domains <span>(leave all unchecked to include every domain)</span></legend>
            {#each selectedPack.domains as domain (domain.id)}
              <label class="check-option">
                <input
                  type="checkbox"
                  name="domainIds"
                  value={domain.id}
                  bind:group={selectedDomainIds}
                >
                <span>{domain.title}</span><small>{domain.weight}%</small>
              </label>
            {/each}
          </fieldset>
          <label for="question-count">Number of questions</label>
          <input
            id="question-count"
            name="questionCount"
            type="number"
            min="1"
            max={availableQuestionCount}
            value={Math.min(10, availableQuestionCount)}
            required
          >
          <button type="submit">Start quiz</button>
        {/if}
      </form>
      {#if form?.message}
        <p class="error" role="alert">{form.message}</p>
      {/if}
    </section>
  {/if}

  {#if data.session}
    <section class="quiz" aria-labelledby="quiz-heading">
      <p class="eyebrow">
        {data.session.answers.length}
        / {data.session.questionIds.length} answered ·
        {data.session.packId}
        v{data.session.packVersion}
      </p>
      {#if latestAnswer && latestQuestion}
        <div class:correct={latestAnswer.correct} class="feedback" role="status" aria-live="polite">
          <h2>{latestAnswer.correct ? 'Correct' : 'Not quite'}</h2>
          <p>
            <strong>Correct answer:</strong>
            {latestQuestion.options
    .filter((option) => latestAnswer.answerIdsCorrect.includes(option.id))
    .map((option) => option.text)
    .join('; ')}
          </p>
          <p>{latestAnswer.explanation}</p>
          <div class="sources">
            {#each latestAnswer.sources as source (source.path)}
              <a
                href={`/practice/source?examId=${encodeURIComponent(data.session.examId)}&packId=${encodeURIComponent(data.session.packId)}&packVersion=${encodeURIComponent(data.session.packVersion)}&questionId=${encodeURIComponent(latestAnswer.questionId)}&path=${encodeURIComponent(source.path)}`}
                target="_blank"
                rel="noopener"
                >{source.label} <span aria-hidden="true">↗</span></a
              >
            {/each}
          </div>
        </div>
      {/if}

      {#if activeQuestion}
        <article>
          <p class="eyebrow">
            {data.session.answers.length + 1}
            of {data.session.questionIds.length} ·
            {data.session.questions.find((question) => question.id === activeQuestion.id)?.domainId}
          </p>
          <h2 id="quiz-heading">{activeQuestion.prompt}</h2>
          <form method="POST" action="?/answer">
            <input type="hidden" name="sessionId" value={data.session.id}>
            <input type="hidden" name="questionId" value={activeQuestion.id}>
            <fieldset class="options">
              <legend>
                {activeQuestion.type === 'multiple_choice' ? 'Select all that apply' : 'Select one answer'}
              </legend>
              {#each activeQuestion.options as option (option.id)}
                <label class="option">
                  <input
                    type={activeQuestion.type === 'multiple_choice' ? 'checkbox' : 'radio'}
                    name="answerIds"
                    value={option.id}
                    required={activeQuestion.type === 'single_choice'}
                  >
                  <span>{option.text}</span>
                </label>
              {/each}
            </fieldset>
            <button type="submit">Submit answer</button>
          </form>
        </article>
      {:else if data.session.status === 'completed'}
        <div class="complete" role="status">
          <h2>Quiz complete</h2>
          <p>
            You answered {data.session.answers.filter((answer) => answer.correct).length} of
            {data.session.questionIds.length}
            correctly.
          </p>
          <p>Your completed attempt is saved with pack version {data.session.packVersion}.</p>
        </div>
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
  .practice {
    width: min(100% - 2rem, 820px);
    margin: 0 auto;
    padding: 2rem 0 5rem;
  }
  header {
    max-width: 650px;
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
  .resume p:last-child {
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
  .setup,
  .resume,
  .quiz,
  .empty {
    margin: 1.2rem 0;
    border: 1px solid #dce1d9;
    border-radius: 16px;
    background: #fff;
    padding: 1.4rem;
  }
  .resume {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    background: #edf3eb;
  }
  .resume h2,
  .resume p {
    margin-bottom: 0.35rem;
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
  fieldset {
    min-width: 0;
    margin: 0.5rem 0;
    border: 1px solid #dce1d9;
    border-radius: 10px;
    padding: 1rem;
  }
  legend span {
    color: #687168;
    font-size: 0.88rem;
    font-weight: 400;
  }
  .check-option,
  .option {
    display: flex;
    align-items: flex-start;
    gap: 0.7rem;
    padding: 0.7rem 0.3rem;
    font-weight: 500;
  }
  .check-option small {
    margin-left: auto;
    color: #687168;
  }
  input[type="checkbox"],
  input[type="radio"] {
    width: 1.1rem;
    height: 1.1rem;
    accent-color: #28553a;
  }
  button,
  .button-link {
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
    text-decoration: none;
    cursor: pointer;
  }
  button:hover,
  .button-link:hover {
    background: #1e432d;
  }
  :is(button, a, select, input):focus-visible {
    outline: 3px solid #d29537;
    outline-offset: 3px;
  }
  .quiz article {
    margin-top: 1.5rem;
    border-top: 1px solid #e2e6df;
    padding-top: 1.4rem;
  }
  .quiz article h2 {
    line-height: 1.4;
  }
  .options {
    display: grid;
    gap: 0.3rem;
  }
  .option {
    border-radius: 8px;
  }
  .option:hover {
    background: #f4f6f2;
  }
  .feedback,
  .complete {
    margin: 1rem 0;
    border-left: 5px solid #ad7726;
    border-radius: 8px;
    background: #fff7e8;
    padding: 1rem 1.1rem;
  }
  .feedback.correct {
    border-color: #34734b;
    background: #edf7ef;
  }
  .feedback h2,
  .complete h2 {
    margin-bottom: 0.6rem;
  }
  .sources {
    display: flex;
    flex-wrap: wrap;
    gap: 0.7rem 1.2rem;
  }
  .error {
    color: #9d3028;
  }
  @media (max-width: 560px) {
    .resume {
      align-items: flex-start;
      flex-direction: column;
    }
    .setup,
    .resume,
    .quiz,
    .empty {
      padding: 1rem;
    }
  }
</style>
