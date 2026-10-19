import { Array as Arr, Effect, Random } from 'effect';
import type { BuiltExamQuestion } from '../core/built-pack-schema.js';
import { CONCURRENCY_LIMIT } from '../core/concurrency.js';
import { LOWERCASE_ASCII_A_CODE_POINT } from '../core/constants.js';
import type { AssembledAuthoring } from './authoring-validation.js';

export const shuffleQuestions: (
  input: AssembledAuthoring,
  localNoteUrls: ReadonlyMap<string, string>,
) => Effect.Effect<BuiltExamQuestion[]> = Effect.fn('shuffleQuestions')(function* shuffleQuestions(
  input: AssembledAuthoring,
  localNoteUrls: ReadonlyMap<string, string>,
) {
  const answerPositions = input.questions.map(() => 0);

  const groups = input.questions.reduce((questionGroups, question, index) => {
    const key = `${question.options.length}:${question.correctOptionIds.length}`;
    const group = questionGroups.get(key) ?? [];
    const slotCount = question.options.length - question.correctOptionIds.length + 1;
    group.push({
      index,
      position: group.length % slotCount,
    });
    questionGroups.set(key, group);

    return questionGroups;
  }, new Map<string, { index: number; position: number }[]>());

  yield* Effect.forEach(
    [...groups.values()],
    (group) =>
      Effect.gen(function* shuffleGroupPositions() {
        const shuffledPositions = yield* Random.shuffle(group.map((item) => item.position));

        Arr.zip(group, shuffledPositions).forEach(([item, position]) => {
          answerPositions[item.index] = position;
        });
      }),
  ).pipe(Random.withSeed(input.shuffle.answerSeed));

  const result = yield* Effect.forEach(
    Arr.zip(input.questions, answerPositions),
    ([question, position]) =>
      Effect.gen(function* transformQuestion() {
        const correct = question.correctOptionIds.flatMap((id) => {
          const matchingOption = question.options.find((option) => option.id === id);

          return matchingOption === undefined ? [] : [matchingOption];
        });

        const correctIds = new Set(question.correctOptionIds);
        const wrong = question.options.filter((option) => !correctIds.has(option.id));
        const shuffledWrong = yield* Random.shuffle(wrong).pipe(Random.withSeed(question.id));
        const options = [...shuffledWrong];
        options.splice(position, 0, ...correct);

        const letters = options.map((option, index) => ({
          id: String.fromCodePoint(LOWERCASE_ASCII_A_CODE_POINT + index),
          text: option.text,
        }));

        return {
          answerIds: letters.slice(position, position + correct.length).map((option) => option.id),
          domainId: question.domainId,
          explanation: question.explanation,
          id: question.id,
          options: letters,
          prompt: question.prompt,
          sources: question.sources.map((source) => {
            if ('kind' in source) {
              const localNoteUrl = localNoteUrls.get(source.path);

              if (localNoteUrl === undefined) {
                throw new Error(`Missing resolved local-note URL: ${source.path}`);
              }

              return { label: source.label, path: localNoteUrl };
            }

            return { ...source, path: `${input.assetsDirectory}/${source.path}` };
          }),
          type: question.type,
        };
      }),
    { concurrency: CONCURRENCY_LIMIT },
  );

  return yield* Random.shuffle(result).pipe(Random.withSeed(input.shuffle.orderSeed));
});
