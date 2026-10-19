import { command, getRequestEvent } from '$app/server';

import { submitUiFeedback } from '#lib/server/ui-feedback/service.js';

import { SubmissionSchema } from './schema';

export const submitFeedback = command(
  SubmissionSchema,
  async (input) => await submitUiFeedback(input, { signal: getRequestEvent().request.signal }),
);
