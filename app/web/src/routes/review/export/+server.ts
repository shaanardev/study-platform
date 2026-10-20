import { exportFeedback } from '#lib/server/feedback/service.js';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () =>
  new Response(await exportFeedback(), {
    headers: {
      'cache-control': 'no-store',
      'content-disposition': 'attachment; filename="question-feedback.json"',
      'content-type': 'application/json; charset=utf-8',
    },
  });
