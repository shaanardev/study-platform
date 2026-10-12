import { exportFeedback } from '#lib/server/feedback/service.js';
import { workspacePath } from '#lib/server/workspace-paths.js';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = () =>
  new Response(exportFeedback(workspacePath('.local/exam-packs.sqlite')), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': 'attachment; filename="question-feedback.json"',
      'cache-control': 'no-store',
    },
  });
