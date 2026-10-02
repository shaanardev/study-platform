import { Array as Arr, Effect, Random } from 'effect';
import type { AssembledAuthoring } from './authoring-validation.js';

export function shuffleQuestions(
  input: AssembledAuthoring,
): Effect.Effect<Record<string, unknown>[]> {
  return Effect.gen(function* () {
    const groups = new Map<string, { index: number; position: number }[]>();
    const answerPositions = input.questions.map(() => 0);
    for (const [index, question] of input.questions.entries()) {
      const key = `${question.options.length}:${question.correctOptionIds.length}`;
      const group = groups.get(key) ?? [];
      const slotCount = question.options.length - question.correctOptionIds.length + 1;
      group.push({
        index,
        position: group.length % slotCount,
      });
      groups.set(key, group);
    }
    yield* Effect.gen(function* () {
      for (const group of groups.values()) {
        const shuffledPositions = yield* Random.shuffle(group.map((item) => item.position));
        for (const [item, position] of Arr.zip(group, shuffledPositions)) {
          answerPositions[item.index] = position;
        }
      }
    }).pipe(Random.withSeed(input.shuffle.answerSeed));
    const result = yield* Effect.forEach(Arr.zip(input.questions, answerPositions), ([question, position]) =>
      Effect.gen(function* () {
        const correct = question.correctOptionIds.flatMap((id) => {
          const option = question.options.find((option) => option.id === id);
          return option === undefined ? [] : [option];
        });
        const correctIds = new Set(question.correctOptionIds);
        const wrong = question.options.filter((option) => !correctIds.has(option.id));
        const shuffledWrong = yield* Random.shuffle(wrong).pipe(Random.withSeed(question.id));
        const options = [...shuffledWrong];
        options.splice(position, 0, ...correct);
        const letters = options.map((option, index) => ({
          id: String.fromCharCode(97 + index),
          text: option.text,
        }));
        return {
          id: question.id,
          type: question.type,
          domainId: question.domainId,
          prompt: question.prompt,
          options: letters,
          answerIds: letters.slice(position, position + correct.length).map((option) => option.id),
          explanation: question.explanation,
          sources: question.sources.map((source) =>
            'kind' in source
              ? source
              : { ...source, path: `${input.assetsDirectory}/${source.path}` },
          ),
        };
      }),
    );
    return yield* Random.shuffle(result).pipe(Random.withSeed(input.shuffle.orderSeed));
  });
}
