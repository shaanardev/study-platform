import { NodeRuntime, NodeServices } from '@effect/platform-node';
import { Effect } from 'effect';
import { Command } from 'effect/cli';
import { buildCommand } from './build/command.js';

const command = Command.make('packs').pipe(Command.withSubcommands([buildCommand]));

const program = Command.run(command, { version: '0.0.0' }).pipe(Effect.provide(NodeServices.layer));

NodeRuntime.runMain(program);
