# Effect v4 Code Styles

Use these conventions when writing TypeScript with Effect v4. They focus on choices that affect type safety and readability.

## Data-first calls

When an API has both data-first and data-last overloads, prefer data-first for a single operation. Use `pipe` for a chain of transformations, with explicit callback parameters; avoid tacit, partially applied function references.

```typescript
import { Effect } from "effect"

const upper = Effect.map(effect, (value) => value.toUpperCase())

const normalized = effect.pipe(
  Effect.map((value) => value.trim()),
  Effect.map((value) => value.toLowerCase())
)
```

Pass the value explicitly to callbacks. Avoid tacit (point-free) usage such as `Effect.map(transform)` when the explicit form improves inference or avoids overload ambiguity.

## Option and Result

Use `Effect.option` only when every typed failure means absence and the error value is irrelevant. It converts any typed failure into `Option.none`; defects and interruption are not converted.

```typescript
const userOption = Effect.option(findUser(id))
// Effect<Option<User>, never, R>
```

Use `Effect.result` when the typed error matters, or when the caller must inspect success and failure as values. For synchronous validation and parsing, use `Result` directly, then yield it in an `Effect.gen` workflow or lift it with `Effect.fromResult` when needed.

```typescript
const lookupResult = Effect.result(findUser(id))
// Effect<Result<User, UserError>, never, R>
```

## Branded types

Use brands to distinguish values with the same runtime representation, such as `UserId` and `OrderId`. Use `Brand.nominal` when no runtime check is needed. Use `Brand.make` when values must satisfy a refinement, and use its non-throwing `result` or `option` constructor when input is untrusted. Do not bypass the constructor with a type assertion.

```typescript
import { Brand } from "effect"

type UserId = string & Brand.Brand<"UserId">
const UserId = Brand.nominal<UserId>()

const userId = UserId("user-123")

type Positive = number & Brand.Brand<"Positive">
const Positive = Brand.make<Positive>(
  (value) => value > 0 || "Expected a positive number"
)

const positiveResult = Positive.result(input)
```

A nominal brand adds compile-time distinction only. Validate untrusted input before branding it.

## Pattern matching

Use `Match` when branching over a union or several structured cases benefits from explicit, exhaustive handling. Finish with `Match.exhaustive` when every case must be handled. Use ordinary `if` or `switch` for simple control flow.

```typescript
import { Match } from "effect"

type Command =
  | { readonly _tag: "Create"; readonly name: string }
  | { readonly _tag: "Delete"; readonly id: string }

const describe = Match.type<Command>().pipe(
  Match.tag("Create", ({ name }) => `create ${name}`),
  Match.tag("Delete", ({ id }) => `delete ${id}`),
  Match.exhaustive
)
```

## Do notation

Use `Effect.Do` with `Effect.bind` and `Effect.let` when sequential operations build up a named object and the resulting pipeline is clearer than nested callbacks. Keep the flow linear; use `Effect.gen` when imperative-looking sequencing or branching is clearer.

```typescript
const program = Effect.Do.pipe(
  Effect.bind("user", () => findUser(id)),
  Effect.bind("orders", ({ user }) => findOrders(user.id)),
  Effect.let("count", ({ orders }) => orders.length)
)
```

## Control flow

Use ordinary TypeScript control flow for simple decisions. Inside `Effect.gen`, branch with `if`, `switch`, or early returns and yield the selected Effect. Use Effect control-flow combinators when they make lazy effect selection or composition clearer; do not wrap every conditional in an Effect operator.

```typescript
import { Effect } from "effect"

const program = Effect.gen(function* () {
  if (input === undefined) {
    return yield* Effect.fail(new MissingInput())
  }

  return yield* loadValue(input)
})
```
