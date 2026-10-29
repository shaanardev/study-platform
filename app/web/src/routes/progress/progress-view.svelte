<script lang="ts">
  import { resolve } from '$app/paths';

  import {
    practiceRecommendedDomain,
    practiceRecommendedQuestion,
    practiceMissed,
  } from './progress.remote';
  import type { ProgressData } from './progress.remote';

  let { data }: { data: ProgressData } = $props();
  let nextStudyAction = $derived(data.nextStudyAction);

  interface MissedQuestionGroup {
    examId: string;
    packId: string;
    packVersion: string;
    examTitle: string;
    packTitle: string;
    questions: ProgressData['missedQuestions'];
  }

  const groupMissedQuestions = (questions: ProgressData['missedQuestions']) =>
    Object.values(
      questions.reduce<Record<string, MissedQuestionGroup>>((groups, question) => {
        const key = `${question.examId}:${question.packId}:${question.packVersion}`;
        const group = groups[key] ?? { ...question, questions: [] };
        group.questions.push(question);
        groups[key] = group;

        return groups;
      }, {}),
    );

  let nextMissedForm = $derived.by(() => {
    const action = nextStudyAction;

    return action.kind === 'missed_question'
      ? practiceRecommendedQuestion.for(
          `${action.examId}:${action.packId}:${action.packVersion}:${action.questionId}`,
        )
      : undefined;
  });

  let nextDomainForm = $derived.by(() => {
    const action = nextStudyAction;

    return action.kind === 'domain'
      ? practiceRecommendedDomain.for(
          `${action.examId}:${action.packId}:${action.packVersion}:${action.domainId}`,
        )
      : undefined;
  });
</script>

<svelte:head>
  <title>Progress and mistakes</title>
  <meta
    name="description"
    content="Review your practice history, exam domain scores, and missed questions."
  />
</svelte:head>

<main class="app-page">
  <div class="content-width-progress mx-auto py-12 pb-20">
    <header class="mb-10 max-w-162.5">
      <p class="tracking-eyebrow text-brand-label mb-2 text-xs font-bold uppercase">
        Your study history
      </p>
      <h1 class="text-page-title-large leading-page-title tracking-page-title mb-3 font-bold">
        Progress and mistakes
      </h1>
      <p class="text-body-muted mb-0 leading-relaxed">
        Results stay tied to the exam pack version used for each attempt.
      </p>
    </header>

    <section
      class="card border-card-border rounded-2xl border bg-white p-5"
      aria-labelledby="next-study-heading"
    >
      <p class="tracking-eyebrow text-brand-label mb-2 text-xs font-bold uppercase">
        Suggested next step
      </p>
      <h2 id="next-study-heading" class="text-section-heading mb-2 font-semibold">
        What to study next
      </h2>
      {#if nextStudyAction.kind === 'missed_question' && nextMissedForm}
        <p class="text-body-muted mb-4">
          <strong>{nextStudyAction.prompt}</strong> You missed it
          {nextStudyAction.missCount} times in
          {nextStudyAction.packTitle} · pack {nextStudyAction.packVersion}. Revisit it to check what
          you remember.
        </p>
        <form {...nextMissedForm} class="grid justify-items-start gap-2">
          <input {...nextMissedForm.fields.examId.as('hidden', nextStudyAction.examId)} />
          <input {...nextMissedForm.fields.packId.as('hidden', nextStudyAction.packId)} />
          <input {...nextMissedForm.fields.packVersion.as('hidden', nextStudyAction.packVersion)} />
          <input {...nextMissedForm.fields.questionId.as('hidden', nextStudyAction.questionId)} />
          {#if nextMissedForm.fields.questionId.issues()?.[0]}
            <p class="text-progress-alert m-0" role="alert">
              {nextMissedForm.fields.questionId.issues()?.[0]?.message}
            </p>
          {/if}
          <button
            class="btn bg-brand hover:bg-brand-hover-progress focus-visible:outline-focus-amber min-h-11 rounded-lg border-0 px-4 py-3 font-bold text-white focus-visible:outline-3 focus-visible:outline-offset-3"
            type="submit"
          >
            Practice this question again
          </button>
        </form>
      {:else if nextStudyAction.kind === 'domain' && nextDomainForm}
        <p class="text-body-muted mb-4">
          You answered {nextStudyAction.correctCount} of
          {nextStudyAction.answeredCount} questions correctly in
          {nextStudyAction.domainTitle} ({nextStudyAction.percent}%) for
          {nextStudyAction.packTitle} · pack {nextStudyAction.packVersion}. Practice this domain
          next.
        </p>
        <form {...nextDomainForm} class="grid justify-items-start gap-2">
          <input {...nextDomainForm.fields.examId.as('hidden', nextStudyAction.examId)} />
          <input {...nextDomainForm.fields.packId.as('hidden', nextStudyAction.packId)} />
          <input {...nextDomainForm.fields.packVersion.as('hidden', nextStudyAction.packVersion)} />
          <input {...nextDomainForm.fields.domainId.as('hidden', nextStudyAction.domainId)} />
          {#if nextDomainForm.fields.domainId.issues()?.[0]}
            <p class="text-progress-alert m-0" role="alert">
              {nextDomainForm.fields.domainId.issues()?.[0]?.message}
            </p>
          {/if}
          <button
            class="btn bg-brand hover:bg-brand-hover-progress focus-visible:outline-focus-amber min-h-11 rounded-lg border-0 px-4 py-3 font-bold text-white focus-visible:outline-3 focus-visible:outline-offset-3"
            type="submit"
          >
            Practice {nextStudyAction.domainTitle}
          </button>
        </form>
      {:else}
        <p class="text-body-muted mb-4">
          Start a short practice quiz from an imported pack. Your answers will create your first
          progress snapshot and help identify what to review next.
        </p>
        <a
          class="btn bg-brand hover:bg-brand-hover-progress focus-visible:outline-focus-amber inline-flex min-h-11 items-center rounded-lg px-4 py-3 font-bold text-white focus-visible:outline-3 focus-visible:outline-offset-3"
          href={resolve('/practice')}>Start a practice quiz</a
        >
      {/if}
    </section>

    <section class="mt-10" aria-labelledby="recent-heading">
      <div class="mb-4">
        <div>
          <p class="tracking-eyebrow text-brand-label mb-2 text-xs font-bold uppercase">Attempts</p>
          <h2 id="recent-heading" class="text-section-heading m-0 font-semibold">
            Recent practice and mock results
          </h2>
        </div>
      </div>
      {#if data.recentAttempts.length === 0}
        <div class="card border-card-border rounded-2xl border bg-white p-5">
          <h3 class="mb-2 font-semibold">No attempts yet</h3>
          <p class="mb-2">
            Complete a practice quiz or mock exam and your results will show up here.
          </p>
          <a
            class="text-brand focus-visible:outline-focus-amber font-semibold underline-offset-4 hover:underline focus-visible:outline-3 focus-visible:outline-offset-3"
            href={resolve('/practice')}>Start a practice quiz</a
          >
        </div>
      {:else}
        <ol class="m-0 grid list-none gap-3 p-0">
          {#each data.recentAttempts as attempt (attempt.id)}
            <li
              class="card border-card-border progress:flex-row progress:items-center flex flex-col items-start justify-between gap-4 rounded-2xl border bg-white p-5"
            >
              <div>
                <p class="tracking-eyebrow text-brand-label mb-2 text-xs font-bold uppercase">
                  {attempt.examTitle}
                  · exam {attempt.examVersion}
                </p>
                <h3 class="mb-1 font-semibold">
                  {attempt.kind === 'mock' ? 'Timed mock exam' : 'Practice quiz'}
                </h3>
                <p class="text-body-muted mb-0">
                  {attempt.packTitle} · pack {attempt.packVersion}
                </p>
              </div>
              <p class="progress:text-right m-0 whitespace-nowrap">
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
          <p class="tracking-eyebrow text-brand-label mb-2 text-xs font-bold uppercase">Accuracy</p>
          <h2 id="domains-heading" class="text-section-heading m-0 font-semibold">
            Scores by exam domain
          </h2>
        </div>
      </div>
      {#if data.domainScores.length === 0}
        <div class="card border-card-border rounded-2xl border bg-white p-5">
          <p class="mb-2">Domain scores will appear after you answer questions.</p>
        </div>
      {:else}
        <div class="grid gap-3">
          {#each data.domainScores as score (`${score.examId}:${score.packId}:${score.packVersion}:${score.domainId}`)}
            <article
              class="card border-card-border progress:flex-row progress:items-center flex flex-col items-start justify-between gap-4 rounded-2xl border bg-white p-5"
            >
              <div>
                <p class="tracking-eyebrow text-brand-label mb-2 text-xs font-bold uppercase">
                  {score.examTitle}
                  · {score.packTitle} · pack {score.packVersion}
                </p>
                <h3 class="mb-1 font-semibold">{score.domainTitle}</h3>
                <p class="text-body-muted mb-0">
                  {score.correctCount}
                  of {score.answeredCount} answered correctly
                </p>
              </div>
              <strong class="text-brand text-2xl">{score.percent}%</strong>
            </article>
          {/each}
        </div>
      {/if}
    </section>

    <section class="mt-10" aria-labelledby="missed-heading">
      <div class="mb-4">
        <div>
          <p class="tracking-eyebrow text-brand-label mb-2 text-xs font-bold uppercase">Review</p>
          <h2 id="missed-heading" class="text-section-heading m-0 font-semibold">
            Missed questions
          </h2>
          <p class="text-body-muted mt-2 mb-0">
            Select questions to build a focused practice session.
          </p>
        </div>
      </div>
      {#if data.missedQuestions.length === 0}
        <div class="card border-card-border rounded-2xl border bg-white p-5">
          <p class="mb-2">No missed questions to review. Any incorrect answers will appear here.</p>
        </div>
      {:else}
        {#each groupMissedQuestions(data.missedQuestions) as group (`${group.examId}:${group.packId}:${group.packVersion}`)}
          {const missedForm = $derived(
            practiceMissed.for(`${group.examId}:${group.packId}:${group.packVersion}`),
          )}
          <form class="mb-5 grid gap-3" {...missedForm}>
            <fieldset
              class="card border-card-border m-0 grid gap-4 rounded-2xl border bg-white p-5"
            >
              <legend class="text-brand-label px-1 text-sm font-bold">
                {group.examTitle}
                · {group.packTitle} · pack {group.packVersion}
              </legend>
              {#each group.questions as question (question.questionId)}
                <label class="flex cursor-pointer items-start gap-3">
                  <input
                    {...missedForm.fields.questionIds.as('checkbox', question.questionId)}
                    class="checkbox app-control-focus mt-1"
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
              <input {...missedForm.fields.examId.as('hidden', group.examId)} />
              <input {...missedForm.fields.packId.as('hidden', group.packId)} />
              <input {...missedForm.fields.packVersion.as('hidden', group.packVersion)} />
            </fieldset>
            {#if missedForm.fields.questionIds.issues()?.[0]}
              <p class="text-progress-alert m-0" role="alert">
                {missedForm.fields.questionIds.issues()?.[0]?.message}
              </p>
            {/if}
            <button
              class="btn bg-brand hover:bg-brand-hover-progress focus-visible:outline-focus-amber min-h-11 justify-self-start rounded-lg border-0 px-4 py-3 font-bold text-white focus-visible:outline-3 focus-visible:outline-offset-3"
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
