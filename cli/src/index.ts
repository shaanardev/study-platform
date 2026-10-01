import { NodeRuntime, NodeServices } from '@effect/platform-node';
import { Effect } from 'effect';
import { Command } from 'effect/cli';
import { buildCommand } from './build/command.js';
import { verifyCommand } from './verify/command.js';

const command = Command.make('packs').pipe(Command.withSubcommands([buildCommand, verifyCommand]));

const program = Command.run(command, { version: '0.0.0' }).pipe(Effect.provide(NodeServices.layer));

NodeRuntime.runMain(program);
