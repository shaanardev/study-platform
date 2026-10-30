import pathUtils from 'node:path';
import { fileURLToPath } from 'node:url';

import { NodeCrypto, NodeServices } from '@effect/platform-node';
import { Effect, FileSystem, Layer, Schema } from 'effect';
import type { Digest } from 'effect/crypto';

const nodeLayer = Layer.merge(NodeServices.layer, NodeCrypto.layer);

export const run = async <A, E>(
  effect: Effect.Effect<A, E, NodeServices.NodeServices | Digest.Digest>,
) => await Effect.runPromise(Effect.provide(effect, nodeLayer));

export const testPath = (...segments: string[]) =>
  fileURLToPath(new URL(segments.join('/'), import.meta.url));

export const relativeTestPath = (...segments: string[]) =>
  pathUtils.relative(process.cwd(), testPath(...segments));

type TestJsonValue<T> = T extends undefined
  ? T
  : T extends boolean | null | number | string
    ? T
    : T extends readonly (infer Item)[]
      ? readonly TestJsonValue<Item>[]
      : T extends object
        ? { readonly [Key in keyof T]: TestJsonValue<T[Key]> }
        : never;

export const writeJson = <A>(path: string, value: A & TestJsonValue<A>) =>
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
