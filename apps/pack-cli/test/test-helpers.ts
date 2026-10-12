import { NodeServices } from '@effect/platform-node';
import { Data, Effect, FileSystem, Schema } from 'effect';

class TestJsonError extends Data.TaggedError('TestJsonError')<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export const run = async <A, E>(effect: Effect.Effect<A, E, NodeServices.NodeServices>) =>
  await Effect.runPromise(Effect.provide(effect, NodeServices.layer));

export const writeJson = (path: string, value: unknown) =>
  Effect.gen(function* encodeJsonFile() {
    const fs = yield* FileSystem.FileSystem;
    const json = yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))(value).pipe(
      Effect.mapError(
        (cause) => new TestJsonError({ cause, message: 'Value cannot be serialized as JSON' }),
      ),
    );
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
