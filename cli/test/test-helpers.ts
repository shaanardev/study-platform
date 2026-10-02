import { NodeServices } from '@effect/platform-node';
import { Effect, FileSystem } from 'effect';

export const run = <A, E>(effect: Effect.Effect<A, E, NodeServices.NodeServices>) =>
  Effect.runPromise(Effect.provide(effect, NodeServices.layer));

export const writeJson = (path: string, value: unknown) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const json = yield* Effect.try({
      try: () => {
        const serialized = JSON.stringify(value);
        if (serialized === undefined) {
          throw new TypeError('Value cannot be serialized as JSON');
        }
        return serialized;
      },
      catch: (error) => (error instanceof Error ? error : new Error(String(error))),
    });
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
