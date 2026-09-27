import { text } from '@sveltejs/kit';
import { readQuestionSource } from '../../../lib/server/quiz/service';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
  const get = (key: string) => url.searchParams.get(key) ?? '';
  const source = await readQuestionSource(
    '.local/exam-packs.sqlite',
    get('examId'),
    get('packId'),
    get('packVersion'),
    get('questionId'),
    get('path'),
  );
  return text(`${source.label}\n\n${source.text}`, {
    headers: { 'cache-control': 'private, max-age=3600' },
  });
};
