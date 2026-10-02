import { NodeServices } from '@effect/platform-node';
import { Data, Effect, FileSystem, Result } from 'effect';

class TestJsonError extends Data.TaggedError('TestJsonError')<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export const run = <A, E>(effect: Effect.Effect<A, E, NodeServices.NodeServices>) =>
  Effect.runPromise(Effect.provide(effect, NodeServices.layer));

export const writeJson = (path: string, value: unknown) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const serialized = Result.try({
      try: () => JSON.stringify(value),
      catch: (cause) => new TestJsonError({ message: 'Value cannot be serialized as JSON', cause }),
    });
    const json = yield* Effect.fromResult(
      Result.flatMap(serialized, (text) =>
        text === undefined
          ? Result.fail(new TestJsonError({ message: 'Value cannot be serialized as JSON' }))
          : Result.succeed(text),
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
