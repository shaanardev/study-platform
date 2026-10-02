import { Console, Effect, Path } from 'effect';
import { Command } from 'effect/cli';
import { describe, expect, it } from 'vitest';
import { verifyCommand } from '../src/verify/command.js';
import { makePack, run, writeJson } from './verify-helpers.js';

describe('verifyPack', () => {
  it('prints the CLI structural and source-check result', () =>
    run(
      Effect.gen(function* () {
        const { packPath } = yield* makePack;
        const messages: unknown[] = [];
        const testConsole: Console.Console = new Proxy(console, {
          get(target, property, receiver) {
            return property === 'log'
              ? (...values: ReadonlyArray<unknown>) => {
                  messages.push(...values);
                }
              : (Reflect.get(target, property, receiver) as unknown);
          },
        });
        yield* Command.runWith(verifyCommand, { version: '0.0.0' })([packPath]).pipe(
          Effect.provideService(Console.Console, testConsole),
        );
        expect(messages).toEqual([
          'PASS: 2 questions; structural checks and citation checks passed.',
        ]);
      }),
    ));

  it('prints profile-check and report output when the CLI receives a profile', () =>
    run(
      Effect.gen(function* () {
        const { directory, packPath } = yield* makePack;
        const path = yield* Path.Path;
        const profilePath = path.join(directory, 'profile.json');
        yield* writeJson(profilePath, {});
        const messages: unknown[] = [];
        const testConsole: Console.Console = new Proxy(console, {
          get(target, property, receiver) {
            return property === 'log'
              ? (...values: ReadonlyArray<unknown>) => {
                  messages.push(...values);
                }
              : (Reflect.get(target, property, receiver) as unknown);
          },
        });
        yield* Command.runWith(verifyCommand, { version: '0.0.0' })([
          packPath,
          '--profile',
          profilePath,
        ]).pipe(Effect.provideService(Console.Console, testConsole));
        expect(messages).toEqual([
          'PASS: 2 questions; structural checks and citation checks passed; profile checks passed.',
          `Verification report: ${path.join(directory, 'assets', 'verification-report.json')}`,
        ]);
      }),
    ));
});
