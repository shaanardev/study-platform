import { fileURLToPath } from 'node:url';

import { BuiltExamPackSchema, examPackSchemaMetadata } from '@learning-platform/exam-pack';
import type { PlatformError } from 'effect';
import { Data, Effect, FileSystem, Path, Schema } from 'effect';

const JSON_INDENT_SPACES = 2;

export class SchemaGenerationError extends Data.TaggedError('SchemaGenerationError')<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

const isNotFound = (cause: PlatformError.PlatformError): boolean =>
  cause.reason._tag === 'NotFound';

const outputPath = fileURLToPath(
  new URL('../../../../packs/exam-pack.schema.json', import.meta.url),
);

const generatedSchema = (): string => {
  const { schema } = Schema.toJsonSchemaDocument(BuiltExamPackSchema, {
    onExcessProperty: 'error',
  });

  const generated = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    ...schema,
    ...examPackSchemaMetadata,
  };

  return `${JSON.stringify(generated, null, JSON_INDENT_SPACES)}\n`;
};

export const generateSchema = Effect.fn('generateSchema')(function* generateSchemaProgram() {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const absolutePath = path.resolve(outputPath);
  yield* fs.writeFileString(absolutePath, generatedSchema()).pipe(
    Effect.mapError(
      (cause) =>
        new SchemaGenerationError({
          cause,
          message: `Unable to write generated exam pack schema at ${absolutePath}: ${String(cause)}`,
        }),
    ),
  );

  return yield* Effect.void;
});

export const checkSchema = Effect.fn('checkSchema')(function* checkSchemaProgram() {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const absolutePath = path.resolve(outputPath);

  const current = yield* fs.readFileString(absolutePath).pipe(
    Effect.mapError(
      (cause) =>
        new SchemaGenerationError({
          cause,
          message: isNotFound(cause)
            ? `Generated exam pack schema is missing at ${absolutePath}; run "packs schema generate".`
            : `Unable to read generated exam pack schema at ${absolutePath}: ${String(cause)}`,
        }),
    ),
  );

  const expected = generatedSchema();

  if (current !== expected) {
    return yield* new SchemaGenerationError({
      message: `Generated exam pack schema is stale at ${absolutePath}; run "packs schema generate".`,
    });
  }

  return yield* Effect.void;
});
