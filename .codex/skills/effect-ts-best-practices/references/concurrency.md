# Concurrency

Effect runs computations in fibers. Child fibers are lightweight, cooperatively scheduled, and interruptible; use structured concurrency so their lifetime follows an owning fiber or scope.

## Run Effects in Parallel

`Effect.all` and `Effect.forEach` are sequential by default. Set a concurrency limit only when the operations are independent and safe to overlap.

```typescript
import { Effect } from "effect"

const users = Effect.forEach(userIds, (id) => fetchUser(id), {
  concurrency: 8,
})

const sequential = Effect.all([loadConfig, openDatabase]) // one finishes before the next starts
const unbounded = Effect.all(tasks, { concurrency: "unbounded" })
```

Use `{ mode: "result" }` when every operation must run and each typed outcome should be returned as a `Result`; use `Effect.validate` when errors should accumulate.

```typescript
const outcomes = Effect.all(tasks, { concurrency: 8, mode: "result" })
// Succeeds with a Result for each task; defects and interruption still fail the Effect.
```

`Effect.raceAll` returns the first success; `Effect.raceFirst` returns the first completion, including failure. Both interrupt the losing fibers.

```typescript
const fastestSuccess = Effect.raceAll([primary, replica])
const firstCompleted = Effect.raceFirst(primary, fallback)
```

## Manage Fiber Lifetimes

Use `forkChild` for work owned by the current fiber, `forkScoped` for work owned by the current scope, and `forkDetach` only for intentional daemon work.

```typescript
import { Effect, Fiber } from "effect"

const program = Effect.gen(function* () {
  const fiber = yield* Effect.forkChild(longRunningTask)
  yield* doOtherWork()

  const value = yield* Fiber.join(fiber) // propagates the child's typed failure
  return value
})
// A child still running when this program exits is interrupted.
```

Use `Fiber.await` to inspect an `Exit` without propagating its failure. Use `Fiber.interrupt` to request cancellation and wait for termination.

```typescript
const exit = yield* Fiber.await(fiber)
```

```typescript
const cancelChild = Effect.gen(function* () {
  const fiber = yield* Effect.forkChild(longRunningTask)
  yield* Fiber.interrupt(fiber)
})
```

Interruption is cooperative. Keep uninterruptible regions short and use scoped resource APIs such as `Effect.acquireRelease` for cleanup instead of relying on cleanup code after a cancelable operation.

## Coordinate Fibers

| Primitive | Use |
|---|---|
| `Ref` | Atomic synchronous state updates |
| `SynchronizedRef` | Updates that need effects or serialized access |
| `SubscriptionRef` | State whose changes are consumed as a `Stream` |
| `Queue` | Producer/consumer handoff |
| `PubSub` | Broadcast messages to multiple subscribers |
| `Deferred` | One result shared with waiters |
| `Semaphore` | Limit access to a resource |

```typescript
import { Deferred, Effect, Queue, Ref, Semaphore, SynchronizedRef } from "effect"

declare const loadValue: Effect.Effect<number>

const program = Effect.gen(function* () {
  const count = yield* Ref.make(0)
  yield* Ref.update(count, (n) => n + 1)

  const cache = yield* SynchronizedRef.make(new Map<string, number>())
  yield* SynchronizedRef.updateEffect(cache, (current) =>
    Effect.map(loadValue, (value) => new Map(current).set("key", value))
  )

  const queue = yield* Queue.bounded<number>(100) // offer waits when full
  yield* Queue.offer(queue, 42)
  const item = yield* Queue.take(queue) // waits while empty

  const ready = yield* Deferred.make<string, never>()
  yield* Deferred.succeed(ready, "started")
  const signal = yield* Deferred.await(ready)

  const semaphore = yield* Semaphore.make(3)
  yield* semaphore.withPermits(1)(expensiveOperation) // permit releases on failure or interruption

  return { count: yield* Ref.get(count), item, signal }
})
```

Choose `Queue.dropping` or `Queue.sliding` only when dropping buffered values is part of the intended behavior; use `Queue.unbounded` only when producer growth is safely bounded elsewhere.

## Interruption and Timeouts

Use `Effect.onInterrupt` for interruption-specific cleanup that cannot be expressed with a scoped resource. Use `Effect.timeout` or `Effect.timeoutOrElse` for a deadline.

```typescript
const withFallback = primary.pipe(Effect.timeoutOrElse({
  duration: "2 seconds",
  orElse: () => fallback,
}))
```
