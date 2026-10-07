import { Console, Effect, type FileSystem, Option, type Path } from 'effect';
import { Argument, Command, Flag } from 'effect/cli';
import { type BuildError, buildPack } from './build.js';

export const buildCommand = Command.make(
  'build',
  {
    authoringFile: Argument.String('authoring-file').pipe(
      Argument.withDescription('Validated JSON pack authoring file'),
    ),
    outputDirectory: Argument.String('output-directory').pipe(
      Argument.withDescription('Directory for the pack JSON and copied source assets'),
    ),
    localNoteRoot: Flag.optional(Flag.String('local-note-root')).pipe(
      Flag.withDescription('Root directory for authored local-note citations'),
    ),
  },
  Effect.fn('buildCommand')(function* ({
    authoringFile,
    outputDirectory,
    localNoteRoot,
  }): Effect.fn.Return<void, BuildError, FileSystem.FileSystem | Path.Path> {
    yield* buildPack(authoringFile, outputDirectory, Option.getOrUndefined(localNoteRoot));
    yield* Console.log(`Built pack in ${outputDirectory}`);
  }),
).pipe(Command.withDescription('Build an exam pack from a JSON authoring file'));
