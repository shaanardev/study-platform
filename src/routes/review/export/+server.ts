import { exportFeedback } from '../../../lib/server/feedback/service';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = () =>
  new Response(exportFeedback('.local/exam-packs.sqlite'), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': 'attachment; filename="ordewell-question-feedback.json"',
      'cache-control': 'no-store',
    },
  });
