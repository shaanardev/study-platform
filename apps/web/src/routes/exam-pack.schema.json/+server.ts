import { readFile } from 'node:fs/promises';

import { workspacePath } from '#lib/server/workspace-paths.js';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () =>
  new Response(await readFile(workspacePath('packs/exam-pack.schema.json'), 'utf-8'), {
    headers: {
      'cache-control': 'public, max-age=3600',
      'content-type': 'application/schema+json; charset=utf-8',
    },
  });
