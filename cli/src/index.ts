import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { Console, Effect } from "effect"
import { Command } from "effect/cli"

const command = Command.make("hello", {}, () => Console.log("Hello World"))

const program = Command.run(command, { version: "0.0.0" }).pipe(
  Effect.provide(NodeServices.layer)
)

NodeRuntime.runMain(program)
