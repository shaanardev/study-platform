import { command, getRequestEvent } from '$app/server';
import * as Schema from 'effect/Schema';

import { submitUiFeedback } from '#lib/server/ui-feedback/service.js';

import { SubmissionSchema } from './schema';

export const submitFeedback = command(
  Schema.toStandardSchemaV1(SubmissionSchema),
  async (input) => await submitUiFeedback(input, { signal: getRequestEvent().request.signal }),
);
