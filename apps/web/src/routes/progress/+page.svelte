<script lang="ts">
  import { resolve } from '$app/paths';

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
  />
</svelte:head>

<main class="min-h-screen bg-app-canvas font-sans text-app-ink">
  <div class="mx-auto content-width-progress py-12 pb-20">
    <header class="mb-10 max-w-162.5">
      <p class="mb-2 text-xs font-bold tracking-eyebrow text-brand-label uppercase">
        Your study history
      </p>
      <h1 class="mb-3 text-page-title-large leading-page-title font-bold tracking-page-title">
        Progress and mistakes
      </h1>
      <p class="mb-0 leading-relaxed text-body-muted">
        Results stay tied to the exam pack version used for each attempt.
      </p>
      <nav class="mt-4 flex flex-wrap gap-x-4 gap-y-3" aria-label="Study navigation">
        <a
          class="font-semibold text-brand underline-offset-4 hover:underline focus-visible:outline-3 focus-visible:outline-focus-amber focus-visible:outline-offset-3"
          href={resolve('/')}>Exam packs</a
        >
        <a
          class="font-semibold text-brand underline-offset-4 hover:underline focus-visible:outline-3 focus-visible:outline-focus-amber focus-visible:outline-offset-3"
          href={resolve('/practice')}>Practice quiz</a
        >
      </nav>
    </header>

    {#if form?.error}
      <p
        class="card mb-8 rounded-2xl border border-card-border bg-white p-5 text-progress-alert"
        role="status"
      >
        {form.error}
      </p>
    {/if}

    <section class="mt-10" aria-labelledby="recent-heading">
      <div class="mb-4">
        <div>
          <p class="mb-2 text-xs font-bold tracking-eyebrow text-brand-label uppercase">Attempts</p>
          <h2 class="m-0 text-section-heading font-semibold" id="recent-heading">
            Recent practice and mock results
          </h2>
        </div>
      </div>
      {#if data.recentAttempts.length === 0}
        <div class="card rounded-2xl border border-card-border bg-white p-5">
          <h3 class="mb-2 font-semibold">No attempts yet</h3>
          <p class="mb-2">
            Complete a practice quiz or mock exam and your results will show up here.
          </p>
          <a
            class="font-semibold text-brand underline-offset-4 hover:underline focus-visible:outline-3 focus-visible:outline-focus-amber focus-visible:outline-offset-3"
            href={resolve('/practice')}>Start a practice quiz</a
          >
        </div>
      {:else}
        <ol class="m-0 grid list-none gap-3 p-0">
          {#each data.recentAttempts as attempt (attempt.id)}
            <li
              class="card flex flex-col items-start justify-between gap-4 rounded-2xl border border-card-border bg-white p-5 progress:flex-row progress:items-center"
            >
              <div>
                <p class="mb-2 text-xs font-bold tracking-eyebrow text-brand-label uppercase">
                  {attempt.examTitle}
                  · exam {attempt.examVersion}
                </p>
                <h3 class="mb-1 font-semibold">
                  {attempt.kind === 'mock' ? 'Timed mock exam' : 'Practice quiz'}
                </h3>
                <p class="mb-0 text-body-muted">{attempt.packTitle} · pack {attempt.packVersion}</p>
              </div>
              <p class="m-0 whitespace-nowrap progress:text-right">
                <strong class="text-xl">{attempt.correctCount}/{attempt.answeredCount}</strong>
                correct
                {#if attempt.status !== 'completed'}
                  <span> · in progress</span>
                {/if}
                <br />
                <small class="text-body-muted"
                  >{attempt.answeredCount}
                  of {attempt.questionCount} answered</small
                >
              </p>
            </li>
          {/each}
        </ol>
      {/if}
    </section>

    <section class="mt-10" aria-labelledby="domains-heading">
      <div class="mb-4">
        <div>
          <p class="mb-2 text-xs font-bold tracking-eyebrow text-brand-label uppercase">Accuracy</p>
          <h2 class="m-0 text-section-heading font-semibold" id="domains-heading">
            Scores by exam domain
          </h2>
        </div>
      </div>
      {#if data.domainScores.length === 0}
        <div class="card rounded-2xl border border-card-border bg-white p-5">
          <p class="mb-2">Domain scores will appear after you answer questions.</p>
        </div>
      {:else}
        <div class="grid gap-3">
          {#each data.domainScores as score (`${score.examId}:${score.packId}:${score.packVersion}:${score.domainId}`)}
            <article
              class="card flex flex-col items-start justify-between gap-4 rounded-2xl border border-card-border bg-white p-5 progress:flex-row progress:items-center"
            >
              <div>
                <p class="mb-2 text-xs font-bold tracking-eyebrow text-brand-label uppercase">
                  {score.examTitle}
                  · {score.packTitle} · pack {score.packVersion}
                </p>
                <h3 class="mb-1 font-semibold">{score.domainTitle}</h3>
                <p class="mb-0 text-body-muted">
                  {score.correctCount}
                  of {score.answeredCount} answered correctly
                </p>
              </div>
              <strong class="text-2xl text-brand">{score.percent}%</strong>
            </article>
          {/each}
        </div>
      {/if}
    </section>

    <section class="mt-10" aria-labelledby="missed-heading">
      <div class="mb-4">
        <div>
          <p class="mb-2 text-xs font-bold tracking-eyebrow text-brand-label uppercase">Review</p>
          <h2 class="m-0 text-section-heading font-semibold" id="missed-heading">
            Missed questions
          </h2>
          <p class="mt-2 mb-0 text-body-muted">
            Select questions to build a focused practice session.
          </p>
        </div>
      </div>
      {#if data.missedQuestions.length === 0}
        <div class="card rounded-2xl border border-card-border bg-white p-5">
          <p class="mb-2">No missed questions to review. Any incorrect answers will appear here.</p>
        </div>
      {:else}
        {#each missedGroups as group (`${group.examId}:${group.packId}:${group.packVersion}`)}
          <form class="mb-5 grid gap-3" method="POST" action={resolve('/progress?/practiceMissed')}>
            <fieldset
              class="card m-0 grid gap-4 rounded-2xl border border-card-border bg-white p-5"
            >
              <legend class="px-1 text-sm font-bold text-brand-label">
                {group.examTitle}
                · {group.packTitle} · pack {group.packVersion}
              </legend>
              {#each group.questions as question (question.questionId)}
                <label class="flex cursor-pointer items-start gap-3">
                  <input
                    class="mt-1 accent-brand"
                    type="checkbox"
                    name="questionIds"
                    value={question.questionId}
                  />
                  <span class="grid gap-1">
                    <strong>{question.prompt}</strong>
                    <small class="text-body-muted"
                      >{question.domainTitle}
                      · missed {question.missCount} time{question.missCount === 1 ? '' : 's'}</small
                    >
                  </span>
                </label>
              {/each}
              <input type="hidden" name="examId" value={group.examId} />
              <input type="hidden" name="packId" value={group.packId} />
              <input type="hidden" name="packVersion" value={group.packVersion} />
            </fieldset>
            <button
              class="btn min-h-11 justify-self-start rounded-lg border-0 bg-brand px-4 py-3 font-bold text-white hover:bg-brand-hover-progress focus-visible:outline-3 focus-visible:outline-focus-amber focus-visible:outline-offset-3"
              type="submit"
            >
              Practice selected missed questions
            </button>
          </form>
        {/each}
      {/if}
    </section>
  </div>
</main>
