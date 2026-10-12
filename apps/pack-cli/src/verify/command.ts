import {
  type Config,
  Console,
  type Crypto,
  Effect,
  type FileSystem,
  Option,
  type Path,
} from 'effect';
import { Argument, Command, Flag } from 'effect/cli';

import { type VerifyError, verifyPack } from './verify.js';

export const verifyCommand = Command.make(
  'verify',
  {
    packPath: Argument.String('pack-file').pipe(
      Argument.withDescription('Path to an exam pack JSON file'),
    ),
    profilePath: Flag.optional(Flag.String('profile')).pipe(
      Flag.withDescription('Optional path to a JSON verification profile'),
    ),
  },
  Effect.fn('verifyCommand')(function* ({
    packPath,
    profilePath,
  }): Effect.fn.Return<
    void,
    VerifyError | Config.ConfigError,
    Crypto.Crypto | FileSystem.FileSystem | Path.Path
  > {
    const { pack, profileReportPath } = yield* verifyPack(
      packPath,
      Option.getOrUndefined(profilePath),
    );
    yield* Console.log(
      `PASS: ${pack.questions.length} ${pack.questions.length === 1 ? 'question' : 'questions'}; structural checks and citation checks passed${Option.isSome(profilePath) ? '; profile checks passed' : ''}.`,
    );
    if (profileReportPath) yield* Console.log(`Verification report: ${profileReportPath}`);
  }),
).pipe(Command.withDescription('Validate an exam pack and check its source files'));
