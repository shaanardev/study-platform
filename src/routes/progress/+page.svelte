<script lang="ts">
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();
  let missedGroups = $derived.by(() => {
    const groups: Record<
      string,
      {
        examId: string;
        packId: string;
        packVersion: string;
        examTitle: string;
        packTitle: string;
        questions: typeof data.missedQuestions;
      }
    > = {};
    for (const question of data.missedQuestions) {
      const key = `${question.examId}:${question.packId}:${question.packVersion}`;
      const group = groups[key] ?? { ...question, questions: [] };
      group.questions.push(question);
      groups[key] = group;
    }
    return Object.values(groups);
  });
</script>

<svelte:head>
  <title>Progress and mistakes</title>
  <meta
    name="description"
    content="Review your practice history, exam domain scores, and missed questions."
  >
</svelte:head>

<main class="progress-page">
  <header>
    <p class="eyebrow">Your study history</p>
    <h1>Progress and mistakes</h1>
    <p>Results stay tied to the exam pack version used for each attempt.</p>
    <nav aria-label="Study navigation">
      <a href="/">Exam packs</a>
      <a href="/practice">Practice quiz</a>
    </nav>
  </header>

  {#if form?.error}
    <p class="notice" role="status">{form.error}</p>
  {/if}

  <section aria-labelledby="recent-heading">
    <div class="section-title">
      <div>
        <p class="eyebrow">Attempts</p>
        <h2 id="recent-heading">Recent practice and mock results</h2>
      </div>
    </div>
    {#if data.recentAttempts.length === 0}
      <div class="empty">
        <h3>No attempts yet</h3>
        <p>Complete a practice quiz or mock exam and your results will show up here.</p>
        <a href="/practice">Start a practice quiz</a>
      </div>
    {:else}
      <ol class="attempt-list">
        {#each data.recentAttempts as attempt (attempt.id)}
          <li>
            <div>
              <p class="eyebrow">{attempt.examTitle} · exam {attempt.examVersion}</p>
              <h3>{attempt.kind === 'mock' ? 'Timed mock exam' : 'Practice quiz'}</h3>
              <p>{attempt.packTitle} · pack {attempt.packVersion}</p>
            </div>
            <p class="result">
              <strong>{attempt.correctCount}/{attempt.answeredCount}</strong>
              correct
              {#if attempt.status !== 'completed'}
                <span> · in progress</span>
              {/if}
              <br><small>{attempt.answeredCount} of {attempt.questionCount} answered</small>
            </p>
          </li>
        {/each}
      </ol>
    {/if}
  </section>

  <section aria-labelledby="domains-heading">
    <div class="section-title">
      <div>
        <p class="eyebrow">Accuracy</p>
        <h2 id="domains-heading">Scores by exam domain</h2>
      </div>
    </div>
    {#if data.domainScores.length === 0}
      <div class="empty"><p>Domain scores will appear after you answer questions.</p></div>
    {:else}
      <div class="score-list">
        {#each data.domainScores as score (`${score.examId}:${score.packId}:${score.packVersion}:${score.domainId}`)}
          <article class="score-card">
            <div>
              <p class="eyebrow">{score.examTitle}· {score.packTitle} · pack {score.packVersion}</p>
              <h3>{score.domainTitle}</h3>
              <p>{score.correctCount} of {score.answeredCount} answered correctly</p>
            </div>
            <strong>{score.percent}%</strong>
          </article>
        {/each}
      </div>
    {/if}
  </section>

  <section aria-labelledby="missed-heading">
    <div class="section-title">
      <div>
        <p class="eyebrow">Review</p>
        <h2 id="missed-heading">Missed questions</h2>
        <p>Select questions to build a focused practice session.</p>
      </div>
    </div>
    {#if data.missedQuestions.length === 0}
      <div class="empty">
        <p>No missed questions to review. Any incorrect answers will appear here.</p>
      </div>
    {:else}
      {#each missedGroups as group (`${group.examId}:${group.packId}:${group.packVersion}`)}
        <form method="POST" action="?/practiceMissed">
          <fieldset class="missed-card">
            <legend>{group.examTitle} · {group.packTitle} · pack {group.packVersion}</legend>
            {#each group.questions as question (question.questionId)}
              <label
                ><input type="checkbox" name="questionIds" value={question.questionId}>
                <span
                  ><strong>{question.prompt}</strong
                  ><small
                    >{question.domainTitle}
                    · missed {question.missCount} time{question.missCount === 1 ? '' : 's'}</small
                  ></span
                >
              </label>
            {/each}
            <input type="hidden" name="examId" value={group.examId}>
            <input type="hidden" name="packId" value={group.packId}>
            <input type="hidden" name="packVersion" value={group.packVersion}>
          </fieldset>
          <button type="submit">Practice selected missed questions</button>
        </form>
      {/each}
    {/if}
  </section>
</main>

<style>
  :global(body) {
    margin: 0;
    background: #f4f5f2;
    color: #20251f;
    font-family: Inter, ui-sans-serif, system-ui, sans-serif;
  }
  .progress-page {
    width: min(100% - 2rem, 900px);
    margin: 0 auto;
    padding: 3rem 0 5rem;
  }
  header {
    max-width: 650px;
    margin-bottom: 2.5rem;
  }
  h1 {
    margin: 0 0 0.65rem;
    font-size: clamp(2.25rem, 6vw, 3.5rem);
    letter-spacing: -0.045em;
    line-height: 1.05;
  }
  h2 {
    margin: 0;
    font-size: 1.35rem;
  }
  h3,
  p {
    margin-top: 0;
  }
  header > p:not(.eyebrow) {
    color: #5e665e;
    line-height: 1.6;
  }
  .eyebrow {
    margin: 0 0 0.55rem;
    color: #536c57;
    font-size: 0.75rem;
    font-weight: 750;
    letter-spacing: 0.09em;
    text-transform: uppercase;
  }
  nav {
    display: flex;
    gap: 1rem;
  }
  a {
    color: #28553a;
    font-weight: 650;
  }
  section {
    margin-top: 2.5rem;
  }
  .section-title {
    margin-bottom: 1rem;
  }
  .section-title > div > p:last-child {
    margin: 0.5rem 0 0;
    color: #5e665e;
  }
  .empty,
  .attempt-list li,
  .score-card,
  .missed-card,
  .notice {
    border: 1px solid #dce1d9;
    border-radius: 14px;
    background: #fff;
    padding: 1.2rem;
  }
  .empty h3,
  .empty p {
    margin-bottom: 0.5rem;
  }
  .attempt-list {
    display: grid;
    gap: 0.75rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .attempt-list li,
  .score-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }
  .attempt-list h3,
  .score-card h3 {
    margin-bottom: 0.35rem;
  }
  .attempt-list p:not(.eyebrow),
  .score-card p:not(.eyebrow) {
    margin-bottom: 0;
    color: #5e665e;
  }
  .result {
    text-align: right;
    white-space: nowrap;
  }
  .result strong {
    font-size: 1.2rem;
  }
  .result small {
    color: #5e665e;
  }
  .score-list {
    display: grid;
    gap: 0.75rem;
  }
  .score-card > strong {
    color: #28553a;
    font-size: 1.5rem;
  }
  form {
    display: grid;
    gap: 0.75rem;
  }
  .missed-card {
    margin: 0;
  }
  .missed-card legend {
    padding: 0 0.25rem;
    color: #536c57;
    font-size: 0.8rem;
    font-weight: 700;
  }
  .missed-card label {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    cursor: pointer;
  }
  .missed-card input[type="checkbox"] {
    margin-top: 0.2rem;
    accent-color: #28553a;
  }
  .missed-card span {
    display: grid;
    gap: 0.4rem;
  }
  .missed-card small {
    color: #5e665e;
  }
  input[type="hidden"] {
    display: none;
  }
  button {
    justify-self: start;
    border: 0;
    border-radius: 8px;
    background: #28553a;
    padding: 0.8rem 1rem;
    color: #fff;
    font: inherit;
    font-weight: 700;
    cursor: pointer;
  }
  .notice {
    color: #8a321f;
  }
  @media (max-width: 560px) {
    .attempt-list li,
    .score-card {
      align-items: flex-start;
      flex-direction: column;
    }
    .result {
      text-align: left;
    }
  }
</style>
