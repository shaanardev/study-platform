import { Schema } from 'effect';

import { BuiltExamPackSchema } from '../src/core/built-pack-schema.js';
import type { PackForVerification } from '../src/core/built-pack-schema.js';
import validPackJson from './fixtures/valid-pack.json' with { type: 'json' };

const validPackData: unknown = validPackJson;

export const validPack: PackForVerification =
  Schema.decodeUnknownSync(BuiltExamPackSchema)(validPackData);
