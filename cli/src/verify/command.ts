import { Console, Effect, Option } from 'effect';
import { Argument, Command, Flag } from 'effect/cli';
import { verifyPack } from './verify.js';

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
  Effect.fn(function* ({ packPath, profilePath }) {
    const { pack, profileReportPath } = yield* verifyPack(
      packPath,
      Option.getOrUndefined(profilePath),
    );
    yield* Console.log(
      `PASS: ${pack.questions.length} ${pack.questions.length === 1 ? 'question' : 'questions'}; generic checks, app import, practice, timed mock, and source read checks passed${Option.isSome(profilePath) ? '; profile checks passed' : ''}.`,
    );
    if (profileReportPath) yield* Console.log(`Verification report: ${profileReportPath}`);
  }),
).pipe(Command.withDescription('Validate an exam pack and exercise the application importer'));
