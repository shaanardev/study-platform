<script lang="ts">
  import { resolve } from '$app/paths';
  import { Accordion } from '@skeletonlabs/skeleton-svelte';

  import PageHeading from '#lib/components/page-heading.svelte';
  import SectionHeading from '#lib/components/section-heading.svelte';

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

  const missedQuestionGroupKey = (group: MissedQuestionGroup) =>
    `${group.examId}:${group.packId}:${group.packVersion}`;

  let missedQuestionGroups = $derived(groupMissedQuestions(data.missedQuestions));

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
    <PageHeading
      eyebrow="Your study history"
      title="Progress and mistakes"
      class="mb-10 max-w-162.5"
    >
      <p class="text-body-muted mb-0 leading-relaxed">
        Results stay tied to the exam pack version used for each attempt.
      </p>
    </PageHeading>

    <section class="card app-panel p-5" aria-labelledby="next-study-heading">
      <SectionHeading
        id="next-study-heading"
        eyebrow="Suggested next step"
        title="What to study next"
        class="mb-2"
      />
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
          <button class="btn app-button-primary" type="submit">
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
          <button class="btn app-button-primary" type="submit">
            Practice {nextStudyAction.domainTitle}
          </button>
        </form>
      {:else}
        <p class="text-body-muted mb-4">
          Start a short practice quiz from an imported pack. Your answers will create your first
          progress snapshot and help identify what to review next.
        </p>
        <a class="btn app-button-primary" href={resolve('/practice')}>Start a practice quiz</a>
      {/if}
    </section>

    <section class="mt-10" aria-labelledby="recent-heading">
      <SectionHeading
        id="recent-heading"
        eyebrow="Attempts"
        title="Recent practice and mock results"
        class="mb-4"
      />
      {#if data.recentAttempts.length === 0}
        <div class="card app-panel p-5">
          <h3 class="mb-2 font-semibold">No attempts yet</h3>
          <p class="mb-2">
            Complete a practice quiz or mock exam and your results will show up here.
          </p>
          <a
            class="text-brand focus-visible:outline-focus-gold font-semibold underline-offset-4 hover:underline focus-visible:outline-3 focus-visible:outline-offset-3"
            href={resolve('/practice')}>Start a practice quiz</a
          >
        </div>
      {:else}
        <ol class="m-0 grid list-none gap-3 p-0">
          {#each data.recentAttempts as attempt (attempt.id)}
            <li
              class="card progress:flex-row progress:items-center app-panel flex flex-col items-start justify-between gap-4 p-5"
            >
              <div>
                <p class="app-eyebrow">
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
      <SectionHeading
        id="domains-heading"
        eyebrow="Accuracy"
        title="Scores by exam domain"
        class="mb-4"
      />
      {#if data.domainScores.length === 0}
        <div class="card app-panel p-5">
          <p class="mb-2">Domain scores will appear after you answer questions.</p>
        </div>
      {:else}
        <div class="grid gap-3">
          {#each data.domainScores as score (`${score.examId}:${score.packId}:${score.packVersion}:${score.domainId}`)}
            <article
              class="card progress:flex-row progress:items-center app-panel flex flex-col items-start justify-between gap-4 p-5"
            >
              <div>
                <p class="app-eyebrow">
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
      <SectionHeading
        id="missed-heading"
        eyebrow="Review"
        title="Missed questions"
        description="Select questions to build a focused practice session."
        class="mb-4"
      />
      {#if data.missedQuestions.length === 0}
        <div class="card app-panel p-5">
          <p class="mb-2">No missed questions to review. Any incorrect answers will appear here.</p>
        </div>
      {:else}
        <Accordion
          multiple
          collapsible
          defaultValue={missedQuestionGroups.slice(0, 1).map(missedQuestionGroupKey)}
        >
          {#each missedQuestionGroups as group (missedQuestionGroupKey(group))}
            {const missedForm = $derived(
              practiceMissed.for(`${group.examId}:${group.packId}:${group.packVersion}`),
            )}
            <Accordion.Item value={missedQuestionGroupKey(group)} class="card app-panel mb-4 p-5">
              <h3 class="m-0">
                <Accordion.ItemTrigger class="app-accordion-trigger group rounded-lg px-0">
                  <span class="min-w-0">
                    <strong class="block">{group.examTitle}</strong>
                    <span class="text-body-muted text-sm font-normal">
                      {group.packTitle} · pack {group.packVersion} · {group.questions.length} question{group
                        .questions.length === 1
                        ? ''
                        : 's'}
                    </span>
                  </span>
                  <Accordion.ItemIndicator
                    class="shrink-0 transition-transform group-data-[state=open]:rotate-180"
                    aria-hidden="true"
                  >
                    ▾
                  </Accordion.ItemIndicator>
                </Accordion.ItemTrigger>
              </h3>
              <Accordion.ItemContent class="border-divider mt-3 border-t pt-4">
                <form class="grid gap-4" {...missedForm}>
                  <fieldset class="m-0 grid gap-3 border-0 p-0">
                    <legend class="sr-only">Select missed questions to practice</legend>
                    {#each group.questions as question (question.questionId)}
                      <label class="app-answer-option">
                        <input
                          {...missedForm.fields.questionIds.as('checkbox', question.questionId)}
                          class="checkbox app-control-focus mt-1"
                        />
                        <span class="grid gap-1">
                          <strong>{question.prompt}</strong>
                          <small class="text-body-muted"
                            >{question.domainTitle}
                            · missed {question.missCount} time{question.missCount === 1
                              ? ''
                              : 's'}</small
                          >
                        </span>
                      </label>
                    {/each}
                  </fieldset>
                  <input {...missedForm.fields.examId.as('hidden', group.examId)} />
                  <input {...missedForm.fields.packId.as('hidden', group.packId)} />
                  <input {...missedForm.fields.packVersion.as('hidden', group.packVersion)} />
                  {#if missedForm.fields.questionIds.issues()?.[0]}
                    <p class="text-error-text m-0" role="alert">
                      {missedForm.fields.questionIds.issues()?.[0]?.message}
                    </p>
                  {/if}
                  <button class="btn app-button-primary justify-self-start" type="submit">
                    Practice selected missed questions
                  </button>
                </form>
              </Accordion.ItemContent>
            </Accordion.Item>
          {/each}
        </Accordion>
      {/if}
    </section>
  </div>
</main>
