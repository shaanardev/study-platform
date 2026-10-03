---
name: effect-ts-best-practices
description: Guidance on writing fast, robust, idiomatic Effect applications in TypeScript. Load this skill when working with Effect, writing Effect code, handling typed errors, using dependency injection or layers, or applying Effect concurrency and resource-management patterns.
---

# Effect-TS Expert

Expert-level guidance for Effect-TS functional programming with typed errors, dependency injection, concurrency, and production-ready patterns.

## Core Concepts

### The Effect Type

```typescript
Effect<Success, Error, Requirements>
//     ^        ^       ^
//     |        |       └── Services/dependencies needed (Context)
//     |        └────────── Typed error channel
//     └─────────────────── Success value type
```

An `Effect<A, E, R>` describes a computation that may succeed with `A`, fail with `E`, and require services in `R`. Constructing an Effect does not run it.

### Creating Effects

```typescript
import { Data, Effect } from "effect"

class ExampleError extends Data.TaggedError("ExampleError")<{}> {}

// From pure values
const success = Effect.succeed(42)
const failure = Effect.fail(new ExampleError())


// For a Promise that does not reject.
const promise = Effect.promise(() => Promise.resolve("ready"))

// Map rejection from an external API to a typed failure.
const tryPromise = Effect.tryPromise({
  try: (signal) => fetch(url, { signal }).then(r => r.json()),
  catch: (cause) => new FetchError({ cause })
})

// From callbacks
const callback = Effect.callback<string, Error>((resume) => {
  someCallbackApi((err, result) => {
    if (err) resume(Effect.fail(err))
    else resume(Effect.succeed(result))
  })
})
```

### Running Effects

```typescript
// At application boundaries and in tests
Effect.runSync(effect)           // Synchronous only; throws on failure or async work
Effect.runPromise(effect)        // Returns Promise<A>; rejects on failure
Effect.runPromiseExit(effect)    // Returns Promise<Exit<A, E>>

// Production (with runtime)
import { Effect, ManagedRuntime } from "effect"

const AppRuntime = ManagedRuntime.make(AppLayer)

// Keep the runtime outcome in Exit, then dispose its services.
const exit = await AppRuntime.runPromiseExit(
  program.pipe(
    Effect.tapError((error) =>
      Effect.logError("Application effect failed", error)
    )
  )
)

await AppRuntime.dispose()
```

## Building Pipelines

### pipe and Effect.gen

Define reusable Effect-returning functions with `Effect.fn("name")` when they are useful tracing boundaries and `Effect.fnUntraced` when they are not; avoid wrappers that only return `Effect.gen` without adding value.

```typescript
import { Data, Effect, pipe } from "effect"

class TooSmallError extends Data.TaggedError("TooSmallError")<{}> {}

// Use pipe for a short transformation chain with explicit callbacks.
const program = pipe(
  Effect.succeed(5),
  Effect.map((n) => n * 2),
  Effect.flatMap((n) => n > 5
    ? Effect.succeed(n)
    : Effect.fail(new TooSmallError())
  ),
  Effect.tap((n) => Effect.log(`Result: ${n}`))
)

// Using Effect.gen (generator style - RECOMMENDED) for inline workflows with sequencing or branching
const program = Effect.gen(function* () {
  const n = yield* Effect.succeed(5)
  const doubled = n * 2
  if (doubled <= 5) {
    return yield* new TooSmallError()
  }
  yield* Effect.log(`Result: ${doubled}`)
  return doubled
})
```

## Error Handling

### Result Values

Use `Result` for computations whose work is synchronous, such as validation and parsing. A `Result` can still be returned from async code or yielded inside an `Effect` workflow; use `Effect` to model the async or effectful work itself.

```typescript
import { Data, Effect, Result } from "effect"

class InvalidAge extends Data.TaggedError("InvalidAge")<{
  readonly age: number
}> {}

const validateAge = (age: number): Result.Result<number, InvalidAge> =>
  age >= 18
    ? Result.succeed(age)
    : Result.fail(new InvalidAge({ age }))

declare const saveUser: (age: number) => Effect.Effect<string>

const register = (age: number) => Effect.gen(function* () {
  // converts its failure into a typed Effect failure, so subsequent effectful steps compose normally
  const validAge = yield* validateAge(age)
  return yield* saveUser(validAge)
})
```

### Typed Errors vs Defects

| Type | Use Case | Recovery |
|------|----------|----------|
| **Typed Error** | Domain failures (validation, not found, permissions) | Yes - caller can handle |
| **Defect** | Bugs and violated invariants | Not handled by typed-error recovery; defects fail the fiber |

```typescript
import { Data, Effect } from "effect"

// Typed errors - tracked in type system
class NotFoundError extends Data.TaggedError("NotFoundError")<{
  readonly id: string
}> {}

class ValidationError extends Data.TaggedError("ValidationError")<{
  readonly message: string
}> {}

class RepositoryError extends Data.TaggedError("RepositoryError")<{
  readonly cause: unknown
}> {}

const findUser = Effect.fn("findUser")(function* (id: string) {
  const user = yield* db.query(id)
  if (!user) return yield* Effect.fail(new NotFoundError({ id }))
  return user
})

// Defects - for bugs, not domain errors
const divide = (a: number, b: number): Effect.Effect<number> =>
  b === 0
    ? Effect.die(new Error("Division by zero - this is a bug!"))
    : Effect.succeed(a / b)
```

### Error Recovery

```typescript
// Handle all typed errors
const withFallback = effect.pipe(
  Effect.catch((_error) => Effect.succeed(fallback))
)

// Catch specific tagged errors
Effect.catchTag(effect, "NotFoundError", (e) =>
  Effect.succeed(defaultUser)
)

// Catch multiple tags
Effect.catchTags(effect, {
  NotFoundError: (e) => Effect.succeed(defaultUser),
  ValidationError: (e) => Effect.fail(new HttpError(400, e.message))
})

// Convert typed failures to Result
Effect.result(effect)  // Effect<Result<A, E>, never, R>

// Retry on failure
Effect.retry(effect, Schedule.recurs(3))
```

### Best Practice: Error Design

```typescript
// DO: Use tagged errors with Schema
import { Schema } from "effect"

class ApiError extends Schema.TaggedError<ApiError>()("ApiError", {
  status: Schema.Int,
  message: Schema.String,
}) {}

// Prefer named, tagged errors for recoverable domain failures.
// Plain Error and strings provide no stable tag for typed recovery.
```

## Dependency Injection

### Services with Context.Service

```typescript
import { Context, Effect, Layer } from "effect"

// 1. Define service interface
class UserRepository extends Context.Service<UserRepository, {
  readonly findById: (id: string) => Effect.Effect<User, NotFoundError | RepositoryError>
  readonly save: (user: User) => Effect.Effect<void, RepositoryError>
}>()("UserRepository") {}

// 2. Use in effects
const getUser = Effect.fn("getUser")(function* (id: string) {
  const repo = yield* UserRepository
  return yield* repo.findById(id)
})
// Type: Effect<User, NotFoundError | RepositoryError, UserRepository>

// 3. Create layer implementation
const UserRepositoryLive = Layer.succeed(UserRepository, {
  // Map database rejection to RepositoryError.
  findById: (id) => Effect.tryPromise({
    try: () => db.users.find(id),
    catch: (cause) => new RepositoryError({ cause })
  }).pipe(
    Effect.flatMap((user) => user === undefined
      ? Effect.fail(new NotFoundError({ id }))
      : Effect.succeed(user))
  ),
  save: (user) => Effect.tryPromise({
    try: () => db.users.save(user),
    catch: (cause) => new RepositoryError({ cause })
  })
})

// 4. Provide to run
const program = getUser("123")
const runnable = Effect.provide(program, UserRepositoryLive)
```

### Build an effectful service layer

```typescript
import { Context, Effect, Layer } from "effect"

class Logger extends Context.Service<Logger, {
  readonly log: (message: string) => Effect.Effect<void>
}>()("Logger") {}

const LoggerLive = Layer.effect(Logger, Effect.gen(function* () {
  const config = yield* Config
  return {
    log: (message: string) => Effect.log(`[${config.level}] ${message}`)
  }
}))

const LoggerWithConfig = Layer.provide(LoggerLive, ConfigLive)

const program = Effect.gen(function* () {
  const logger = yield* Logger
  yield* logger.log("Hello")
})
const runnable = Effect.provide(program, LoggerWithConfig)
```

### Layer Composition

```typescript
// Merge independent layers
const BaseLayer = Layer.merge(ConfigLive, LoggerLive)

// Provide dependencies
const DbLayer = Layer.provide(DatabaseLive, ConfigLive)

// Full composition
const AppLayer = pipe(
  UserRepositoryLive,
  Layer.provideMerge(
    Layer.provideMerge(DatabaseLive, Layer.merge(ConfigLive, LoggerLive))
  )
)
```

See `references/layers.md` for advanced patterns.

## Concurrency

### Fibers

```typescript
// Fork to run concurrently
const fiber = yield* Effect.forkChild(longRunningTask)

// Wait for result
const result = yield* Fiber.join(fiber)

// Interrupt
yield* Fiber.interrupt(fiber)

// Race - first successful result wins; a failed racer does not win.
const fastest = yield* Effect.race(task1, task2)

// Effect.all is sequential by default; set concurrency to run effects concurrently.
const results = yield* Effect.all([task1, task2, task3], { concurrency: 5 })

// All with concurrency limit
const results = yield* Effect.all(tasks, { concurrency: 5 })
```

### Synchronization Primitives

```typescript
import { Deferred, Effect, Fiber, Queue, Ref, Semaphore } from "effect"

// Ref - mutable reference
const counter = yield* Ref.make(0)
yield* Ref.update(counter, n => n + 1)
const value = yield* Ref.get(counter)

// Queue - bounded producer/consumer
const queue = yield* Queue.bounded<number>(100)
yield* Queue.offer(queue, 42)
const item = yield* Queue.take(queue)

// Semaphore - limit concurrent access
const sem = yield* Semaphore.make(3)
yield* Semaphore.withPermits(sem, 1, expensiveOperation)

// Deferred - one-shot signal
const deferred = yield* Deferred.make<string, Error>()
yield* Deferred.succeed(deferred, "done")
const value = yield* Deferred.await(deferred)
```

## Resource Management

### Scoped Resources

```typescript
// Acquire/release pattern
const file = Effect.acquireRelease(
  Effect.sync(() => fs.openSync(path, "r")),  // acquire
  (fd) => Effect.sync(() => fs.closeSync(fd))  // release
)

// Use with scoped
const program = Effect.scoped(
  Effect.gen(function* () {
    const fd = yield* file
    return yield* readFile(fd)
  })
)
// File automatically closed after scope
```

### Finalizers

```typescript
const program = Effect.gen(function* () {
  yield* Effect.addFinalizer((exit) =>
    Effect.log(`Cleanup: ${exit._tag}`)
  )
  // ... do work
})

const runnable = Effect.scoped(program)
```

## Quick Reference

### Common Operators

| Operator | Purpose |
|----------|---------|
| `Effect.map` | Transform success value |
| `Effect.flatMap` | Chain effects (monadic bind) |
| `Effect.tap` | Side effect, keep original value |
| `Effect.andThen` | Sequence, can be value or effect |
| `Effect.catch` | Recover from all typed errors |
| `Effect.catchIf` | Recover from typed errors matching a predicate |
| `Effect.catchTag` | Handle specific tagged error |
| `Effect.provide` | Inject dependencies |
| `Effect.retry` | Retry with schedule |
| `Effect.timeout` | Add timeout |
| `Effect.forkChild` | Fork a child fiber tied to the parent |
| `Effect.all` | Combine effects; sequential unless concurrency is set |

### When to Use What

| Scenario | Use |
|----------|-----|
| Transform value | `Effect.map` |
| Chain effects | `Effect.flatMap` or `Effect.gen` |
| Error recovery | `Effect.catch`, `Effect.catchTag`, or `Effect.catchIf` |
| Add logging | `Effect.tap` + `Effect.log` |
| Run in parallel | `Effect.all` with `concurrency` |
| Limit access to a resource | `Semaphore.withPermits` |
| Share mutable state | `Ref` |
| Producer/consumer | `Queue` |
| One-time signal | `Deferred` |
| Cleanup resources | `Effect.acquireRelease` |

## Reference Documents

- **`references/error-handling.md`** - Typed errors, defects, recovery patterns
- **`references/layers.md`** - Dependency injection, service composition
- **`references/concurrency.md`** - Fibers, synchronization, parallelism
- **`references/streams.md`** - Stream, Sink, Channel patterns
- **`references/schema.md`** - Validation, encoding/decoding
- **`references/code-styles.md`** - Effect specific code styles
- **`references/testing.md`** - Test layers, mocking, vitest integration
- **`references/config.md`** - Configuration management
