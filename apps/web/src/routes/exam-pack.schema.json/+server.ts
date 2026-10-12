import { readFile } from 'node:fs/promises';

import { workspacePath } from '#lib/server/workspace-paths.js';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () =>
  new Response(await readFile(workspacePath('packs/exam-pack.schema.json'), 'utf8'), {
    headers: {
      'content-type': 'application/schema+json; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
