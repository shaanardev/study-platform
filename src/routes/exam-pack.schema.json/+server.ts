import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () =>
  new Response(await readFile(resolve('packs/exam-pack.schema.json'), 'utf8'), {
    headers: {
      'content-type': 'application/schema+json; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
