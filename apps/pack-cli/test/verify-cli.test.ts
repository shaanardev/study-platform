import { Effect, Path } from 'effect';
import { Command } from 'effect/cli';
import { TestConsole } from 'effect/testing';
import { describe, expect, it } from 'vitest';

import { verifyCommand } from '../src/verify/command.js';
import { makePack, run, writeJson } from './verify-helpers.js';

describe('verifyPack', () => {
  it('prints the CLI structural and source-check result', async () => {
    await run(
      Effect.gen(function* verifyCliResult() {
        const { packPath } = yield* makePack;
        yield* Command.runWith(verifyCommand, { version: '0.0.0' })([packPath]);
        expect(yield* TestConsole.logLines).toStrictEqual([
          'PASS: 2 questions; structural checks and citation checks passed.',
        ]);
      }).pipe(Effect.provide(TestConsole.layer)),
    );
  });

  it('prints profile-check and report output when the CLI receives a profile', async () => {
    await run(
      Effect.gen(function* verifyProfileCliResult() {
        const { directory, packPath } = yield* makePack;
        const path = yield* Path.Path;
        const profilePath = path.join(directory, 'profile.json');
        yield* writeJson(profilePath, {});
        yield* Command.runWith(verifyCommand, { version: '0.0.0' })([
          packPath,
          '--profile',
          profilePath,
        ]);
        expect(yield* TestConsole.logLines).toStrictEqual([
          'PASS: 2 questions; structural checks and citation checks passed; profile checks passed.',
          `Verification report: ${path.join(directory, 'assets', 'verification-report.json')}`,
        ]);
      }).pipe(Effect.provide(TestConsole.layer)),
    );
  });
});
