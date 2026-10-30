import { Console, Effect, Option } from 'effect';
import type { FileSystem, Path } from 'effect';
import { Argument, Command, Flag } from 'effect/cli';
import { buildPack } from './build.js';
import type { BuildError } from './build.js';

export const buildCommand = Command.make(
  'build',
  {
    authoringFile: Argument.String('authoring-file').pipe(
      Argument.withDescription('Validated JSON pack authoring file'),
    ),
    localNoteRoot: Flag.optional(Flag.String('local-note-root')).pipe(
      Flag.withDescription('Root directory for authored local-note citations'),
    ),
    outputDirectory: Argument.String('output-directory').pipe(
      Argument.withDescription('Directory for the pack JSON and copied source assets'),
    ),
  },
  Effect.fn('buildCommand')(function* buildCommand({
    authoringFile,
    outputDirectory,
    localNoteRoot,
  }): Effect.fn.Return<void, BuildError, FileSystem.FileSystem | Path.Path> {
    yield* buildPack(authoringFile, outputDirectory, Option.getOrUndefined(localNoteRoot));
    yield* Console.log(`Built pack in ${outputDirectory}`);
  }),
).pipe(
  Command.withDescription('Build an exam pack from a JSON authoring file'),
  Command.withExamples(({ commandPath }) => [
    {
      command: `${commandPath.join(' ')} packs/example/authoring.json dist/example`,
      description: 'Build a pack and copy its source assets into the output directory',
    },
    {
      command: `${commandPath.join(' ')} --local-note-root notes packs/example/authoring.json dist/example`,
      description: 'Resolve local-note citations from a separate notes directory',
    },
  ]),
);
