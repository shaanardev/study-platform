import { NodeCrypto, NodeRuntime, NodeServices } from '@effect/platform-node';
import { Effect, Layer } from 'effect';
import { Command } from 'effect/cli';

import { buildCommand } from './build/command.js';
import { schemaCommand } from './schema/command.js';
import { verifyCommand } from './verify/command.js';

const command = Command.make('packs').pipe(
  Command.withSubcommands([buildCommand, verifyCommand, schemaCommand]),
);

const nodeLayer = Layer.merge(NodeServices.layer, NodeCrypto.layer);
const program = Command.run(command, { version: '0.0.0' }).pipe(Effect.provide(nodeLayer));

NodeRuntime.runMain(program);
