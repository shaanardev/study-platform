import { Console, Effect, type FileSystem, type Path } from 'effect';
import { Argument, Command } from 'effect/cli';
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
  },
  Effect.fn('buildCommand')(function* ({
    authoringFile,
    outputDirectory,
  }): Effect.fn.Return<void, BuildError, FileSystem.FileSystem | Path.Path> {
    yield* buildPack(authoringFile, outputDirectory);
    yield* Console.log(`Built pack in ${outputDirectory}`);
  }),
).pipe(Command.withDescription('Build an exam pack from a JSON authoring file'));
