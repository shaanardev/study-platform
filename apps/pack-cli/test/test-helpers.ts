import { NodeServices } from '@effect/platform-node';
import { Data, Effect, FileSystem, Schema } from 'effect';

class TestJsonError extends Data.TaggedError('TestJsonError')<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export const run = <A, E>(effect: Effect.Effect<A, E, NodeServices.NodeServices>) =>
  Effect.runPromise(Effect.provide(effect, NodeServices.layer));

export const writeJson = (path: string, value: unknown) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const json = yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))(value).pipe(
      Effect.mapError(
        (cause) => new TestJsonError({ message: 'Value cannot be serialized as JSON', cause }),
      ),
    );
    yield* fs.writeFileString(path, json);
  });

export const makeTemporaryDirectoryTracker = () => {
  const directories: string[] = [];

  return {
    make: (prefix: string) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const directory = yield* fs.makeTempDirectory({ prefix });
        directories.push(directory);
        return directory;
      }),
    cleanup: () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* Effect.forEach(directories.splice(0), (directory) =>
          fs.remove(directory, { recursive: true, force: true }),
        );
      }),
  };
};
