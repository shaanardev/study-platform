import { Console, Effect, Option } from 'effect';
import type { Config, Crypto, FileSystem, Path } from 'effect';
import { Argument, Command, Flag } from 'effect/cli';

import { verifyPack } from './verify.js';
import type { VerifyError } from './verify.js';

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
  Effect.fn('verifyCommand')(function* verifyCommand({
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
    if (profileReportPath !== undefined) {
      yield* Console.log(`Verification report: ${profileReportPath}`);
    }
  }),
).pipe(Command.withDescription('Validate an exam pack and check its source files'));
