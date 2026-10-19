import { BuiltExamPackSchema } from '@learning-platform/exam-pack';
import type { PackForVerification } from '@learning-platform/exam-pack';
import { Schema } from 'effect';

import validPackJson from './fixtures/valid-pack.json' with { type: 'json' };

const validPackData: unknown = validPackJson;

export const validPack: PackForVerification =
  Schema.decodeUnknownSync(BuiltExamPackSchema)(validPackData);
