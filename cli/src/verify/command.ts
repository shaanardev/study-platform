import { Console, Effect } from 'effect';
import { Argument, Command } from 'effect/cli';
import { verifyPack } from './verify.js';

export const verifyCommand = Command.make(
  'verify',
  {
    packPath: Argument.String('pack-file').pipe(
      Argument.withDescription('Path to an exam pack JSON file'),
    ),
  },
  Effect.fn(function* ({ packPath }) {
    const pack = yield* verifyPack(packPath);
    yield* Console.log(
      `PASS: ${pack.questions.length} ${pack.questions.length === 1 ? 'question' : 'questions'}; generic checks and app import passed.`,
    );
  }),
).pipe(Command.withDescription('Validate an exam pack and exercise the application importer'));
