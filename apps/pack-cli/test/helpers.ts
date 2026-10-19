import pathUtils from 'node:path';
import { fileURLToPath } from 'node:url';

import { NodeServices } from '@effect/platform-node';
import { Effect, FileSystem, Schema } from 'effect';

export const run = async <A, E>(effect: Effect.Effect<A, E, NodeServices.NodeServices>) =>
  await Effect.runPromise(Effect.provide(effect, NodeServices.layer));

export const testPath = (...segments: string[]) =>
  fileURLToPath(new URL(segments.join('/'), import.meta.url));

export const relativeTestPath = (...segments: string[]) =>
  pathUtils.relative(process.cwd(), testPath(...segments));

export const writeJson = (path: string, value: unknown) =>
  Effect.gen(function* encodeJsonFile() {
    const fs = yield* FileSystem.FileSystem;
    const json = yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))(value);
    yield* fs.writeFileString(path, json);
  });

export const makeTemporaryDirectoryTracker = () => {
  const directories: string[] = [];

  return {
    cleanup: () =>
      Effect.gen(function* cleanup() {
        const fs = yield* FileSystem.FileSystem;
        yield* Effect.forEach(directories.splice(0), (directory) =>
          fs.remove(directory, { force: true, recursive: true }),
        );
      }),
    make: (prefix: string) =>
      Effect.gen(function* make() {
        const fs = yield* FileSystem.FileSystem;
        const directory = yield* fs.makeTempDirectory({ prefix });
        directories.push(directory);
        return directory;
      }),
  };
};
