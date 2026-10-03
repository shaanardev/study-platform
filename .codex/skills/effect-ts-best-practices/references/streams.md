# Streams

Use `Stream<A, E, R>` for values produced over time or too numerous to hold in memory. Use an `Effect` for one result and a `Sink` to consume a stream.

## Create and Transform

Build streams from values or effects; bound infinite streams before running them to completion.

```typescript
import { Effect, Stream } from "effect"

const finite = Stream.fromIterable([1, 2, 3])
const one = Stream.fromEffect(loadUser())
const bounded = Stream.iterate(0, (n) => n + 1).pipe(Stream.take(100))

const transformed = finite.pipe(
  Stream.filter((n) => n > 1),
  Stream.map((n) => n * 2),
)
```

Use `mapEffect` for effectful work. It is sequential by default; set bounded concurrency only when operations are independent. Concurrent results are emitted in input order.

```typescript
const users = userIds.pipe(
  Stream.mapEffect((id) => fetchUser(id), { concurrency: 8 }),
)
```

## Consume and Combine

`runCollect` retains every value; use `runDrain`, `runForEach`, or a reducing `Sink` for large or unbounded streams. A sink can stop upstream early.

```typescript
import { Effect, Sink, Stream } from "effect"

const values = await Effect.runPromise(Stream.runCollect(transformed))
const total = Stream.run(transformed, Sink.sum)
const firstThree = Stream.run(transformed, Sink.take(3))
const done = Stream.runDrain(transformed)
```

Choose composition by ordering: `merge` interleaves available values, `concat` runs streams sequentially, and `zip` pairs values until either side ends.

```typescript
const interleaved = Stream.merge(left, right)
const sequential = Stream.concat(first, second)
const pairs = Stream.zip(left, right)
```

## Batch and Control Flow

Use `grouped` for size-only batches and `groupedWithin` to flush on either a size or time limit. Keep batch effects bounded and stream their outputs instead of collecting the source.

```typescript
const processBatches = events.pipe(
  Stream.groupedWithin(100, "1 second"),
  Stream.mapEffect((batch) => saveBatch(batch), { concurrency: 2 }),
  Stream.runDrain,
)
```

`buffer` permits a bounded producer/consumer backlog; downstream demand still applies backpressure once it fills. `throttle` controls emission rate by chunk cost, while `debounce` emits after a quiet interval and may discard earlier values.

```typescript
const buffered = source.pipe(Stream.buffer({ capacity: 32 }))
const limited = source.pipe(Stream.throttle({
  cost: (chunk) => chunk.length,
  units: 10,
  duration: "1 second",
}))
const settled = events.pipe(Stream.debounce("300 millis"))
```

## Errors and External Sources

Typed stream failures propagate through operators. Use `mapError` to translate them or `catch` when a fallback stream is appropriate; `onError` observes a cause without replacing the failure.

```typescript
import { Data, Stream } from "effect"

class StreamError extends Data.TaggedError("StreamError")<{
  readonly cause: unknown
}> {}
declare const source: Stream.Stream<number, StreamError>
const fallbackValue = 0

const recovered = source.pipe(
  Stream.catch((error) => Stream.make(fallbackValue)),
)
const translated = source.pipe(Stream.mapError((error) => new StreamError({ cause: error })))
```

Use `fromAsyncIterable` to adapt an async iterator and map iterator rejections into `E`.

```typescript
import { Data, Stream } from "effect"

class SourceError extends Data.TaggedError("SourceError")<{
  readonly cause: unknown
}> {}
declare const asyncGenerator: () => AsyncIterable<number>

const fromIterator = Stream.fromAsyncIterable(asyncGenerator(), (cause) =>
  new SourceError({ cause })
)
```

Use `Stream.callback` for callback APIs; end or fail its queue and register source cleanup in the callback scope.

```typescript
import { Effect, Queue, Stream } from "effect"

declare const registerListener: (handlers: {
  readonly onValue: (value: number) => void
  readonly onComplete: () => void
}) => { unsubscribe: () => void }

const fromCallback = Stream.callback<number>((queue) =>
  Effect.acquireRelease(
    Effect.sync(() => registerListener({
      onValue: (value) => Queue.offerUnsafe(queue, value),
      onComplete: () => Queue.endUnsafe(queue),
    })),
    (subscription) => Effect.sync(() => subscription.unsubscribe()),
  ).pipe(Effect.asVoid)
)
```

Channels expose the lower-level stream machinery. Use them only when `Stream` and `Sink` cannot express the required input, output, completion, error, or resource behavior.
