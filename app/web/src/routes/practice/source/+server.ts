import { readQuestionSource } from '#lib/server/quiz/service.js';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
  const get = (key: string) => url.searchParams.get(key) ?? '';

  const source = await readQuestionSource(
    get('examId'),
    get('packId'),
    get('packVersion'),
    get('questionId'),
    get('path'),
  );

  return new Response(`${source.label}\n\n${source.text}`, {
    headers: {
      'cache-control': 'private, max-age=3600',
      'content-type': 'text/plain; charset=utf-8',
    },
  });
};
