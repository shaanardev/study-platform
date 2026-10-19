import examPackSchema from '../../../../../packs/exam-pack.schema.json' with { type: 'json' };
import type { RequestHandler } from './$types';

export const GET: RequestHandler = () =>
  new Response(JSON.stringify(examPackSchema, null, '  '), {
    headers: {
      'cache-control': 'public, max-age=3600',
      'content-type': 'application/schema+json; charset=utf-8',
    },
  });
