# Testing Effect Programs

Use Vitest to run effects at the test boundary. Use `Effect.runPromise` for success assertions and `Effect.result` when asserting typed failures; use `Effect.runPromiseExit` only when defects or interruption are part of the assertion.

## Test a Service with a Test Layer

Provide a deterministic service implementation at the boundary. Keep the production effect reusable and the test layer independent of live infrastructure.

```typescript
import { describe, expect, it } from "vitest"
import { Effect, Layer, Result } from "effect"
import { NotFoundError, UserRepository, findUser } from "./users"

const testUser = { id: "user-1", name: "Test User", email: "test@example.com" }

const UserRepositoryTest = Layer.succeed(UserRepository, {
  findById: (id) => id === testUser.id
    ? Effect.succeed(testUser)
    : Effect.fail(new NotFoundError({ id })),
  save: () => Effect.void,
})

describe("findUser", () => {
  it("should return the user", async () => {
    const program = findUser(testUser.id).pipe(Effect.provide(UserRepositoryTest))
    const user = await Effect.runPromise(program)
    expect(user).toEqual(testUser)
  })

  it("should preserve the typed not-found error", async () => {
    const program = findUser("missing").pipe(Effect.provide(UserRepositoryTest))
    const result = await Effect.runPromise(Effect.result(program))

    expect(Result.isFailure(result)).toBe(true)
    if (Result.isFailure(result)) {
      expect(result.failure._tag).toBe("NotFoundError")
      expect(result.failure.id).toBe("missing")
    }
  })
})
```

Use `Layer.succeed` for a ready test value and `Layer.effect` only when test service construction itself needs effects or services. See [layers.md](./layers.md) for layer composition; see [config.md](./config.md) for test `ConfigProvider` setup.

For pure validation, assert the returned `Result` directly; do not run it through an Effect runtime.

```typescript
const result = validateEmail("invalid")
expect(Result.isFailure(result)).toBe(true)
```

## Isolate Stateful Tests

Create a fresh layer or mock state per test when a test mutates it. Share immutable test layers freely.

```typescript
import { Effect, Layer, Result } from "effect"
import { NotFoundError, UserRepository, findUser, createUser, type User } from "./users"

const makeUserRepositoryTest = (users: Map<string, User>) =>
  Layer.succeed(UserRepository, {
    findById: (id) => {
      const user = users.get(id)
      return user === undefined
        ? Effect.fail(new NotFoundError({ id }))
        : Effect.succeed(user)
    },
    save: (user) => Effect.sync(() => { users.set(user.id, user) }),
  })

it("should use isolated repository state", async () => {
  const writerLayer = makeUserRepositoryTest(new Map())
  const readerLayer = makeUserRepositoryTest(new Map())
  await Effect.runPromise(createUser(testUser).pipe(Effect.provide(writerLayer)))

  const result = await Effect.runPromise(Effect.result(
    findUser(testUser.id).pipe(Effect.provide(readerLayer))
  ))
  expect(Result.isFailure(result)).toBe(true) // the reader has its own empty state
})
```

## Test Time-Dependent Effects

Use `TestClock` instead of waiting for real time. Advance the clock only after forking work that is waiting on it.

```typescript
import { Effect, Fiber, Option } from "effect"
import { TestClock } from "effect/testing"

const program = Effect.gen(function* () {
  const fiber = yield* Effect.forkChild(
    Effect.sleep("10 seconds").pipe(
      Effect.map((value) => Option.some(value)),
      Effect.timeoutOrElse({
        duration: "5 seconds",
        orElse: () => Effect.succeed(Option.none<void>()),
      }),
    )
  )
  yield* TestClock.adjust("6 seconds")
  return yield* Fiber.join(fiber)
}).pipe(Effect.provide(TestClock.layer()))

const result = await Effect.runPromise(program)
expect(Option.isNone(result)).toBe(true)
```

## Test Streams

Collect a finite stream and assert its values. Use `Effect.runPromiseExit` when the test must inspect a defect or interruption as well as typed failures.

```typescript
import { Effect, Stream } from "effect"

const program = Stream.fromIterable([1, 2, 3]).pipe(
  Stream.map((n) => n * 2),
  Stream.runCollect,
)

const values = await Effect.runPromise(program)
expect(values).toEqual([2, 4, 6])
```
