import { Console, Effect } from 'effect';
import type { FileSystem, Path } from 'effect';
import { Command } from 'effect/cli';

import { checkSchema, generateSchema } from './generate-schema.js';
import type { SchemaGenerationError } from './generate-schema.js';

const generateCommand = Command.make(
  'generate',
  {},
  Effect.fn('generateSchemaCommand')(function* generateSchemaCommand(): Effect.fn.Return<
    void,
    SchemaGenerationError,
    FileSystem.FileSystem | Path.Path
  > {
    yield* generateSchema();
    yield* Console.log('Generated exam pack schema.');
  }),
).pipe(Command.withDescription('Generate the exam pack JSON Schema'));

const checkCommand = Command.make(
  'check',
  {},
  Effect.fn('checkSchemaCommand')(function* checkSchemaCommand(): Effect.fn.Return<
    void,
    SchemaGenerationError,
    FileSystem.FileSystem | Path.Path
  > {
    yield* checkSchema();
    yield* Console.log('Exam pack schema is up to date.');
  }),
).pipe(Command.withDescription('Check that the generated exam pack JSON Schema is current'));

export const schemaCommand = Command.make('schema').pipe(
  Command.withSubcommands([generateCommand, checkCommand]),
  Command.withDescription('Generate or check the exam pack JSON Schema'),
);
