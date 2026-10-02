import { text } from '@sveltejs/kit';
import { readQuestionSource } from '#lib/server/quiz/service.js';
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
    get('kind') === 'academy_note' ? 'academy_note' : 'bundled',
  );
  const section = 'section' in source && source.section ? ` · ${source.section}` : '';
  return text(`${source.label}${section}\n\n${source.text}`, {
    headers: { 'cache-control': 'private, max-age=3600' },
  });
};
