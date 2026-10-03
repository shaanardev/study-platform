# Error Handling

Use `Result<A, E>` for computations whose work is synchronous, such as validation and parsing. It can be returned from async code or yielded in an Effect workflow, but it represents a completed value rather than modeling async work. Use `Effect<A, E, R>` for effectful operations and workflows. Put expected failures in `E`; defects represent bugs or violated invariants.

## Synchronous Validation and Parsing

Return failures as values. Use `Result.try` only to adapt an existing API that throws.

```typescript
import { Data, Result } from "effect"

class InvalidAge extends Data.TaggedError("InvalidAge")<{
  readonly value: number
}> {}

class InvalidEmail extends Data.TaggedError("InvalidEmail")<{
  readonly value: string
}> {}

const validateAge = (age: number): Result.Result<number, InvalidAge> =>
  Number.isInteger(age) && age >= 18
    ? Result.succeed(age)
    : Result.fail(new InvalidAge({ value: age })) // expected validation: no throw

const validateEmail = (email: string): Result.Result<string, InvalidEmail> =>
  email.includes("@")
    ? Result.succeed(email)
    : Result.fail(new InvalidEmail({ value: email }))

class ParseError extends Data.TaggedError("ParseError")<{
  readonly cause: unknown
}> {}

const parseJson = (text: string) => Result.try({
  try: () => JSON.parse(text) as unknown,
  catch: (cause) => new ParseError({ cause }), // adapt the parser's exception here
})
```

Use `Result.gen` for dependent synchronous checks; it stops at the first failure. It does not run effects or collect every error.

In `Effect.gen`, yield a `Result` to continue a synchronous check into effectful work; its failure becomes a typed Effect failure. Use `Effect.fromResult` when passing a `Result` to an Effect combinator.

```typescript
const validateUser = (input: { readonly age: number; readonly email: string }) =>
  Result.gen(function* () {
    const age = yield* validateAge(input.age)
    const email = yield* validateEmail(input.email)
    return { age, email }
  })
```

## Typed Effect Failures

Use tagged errors with the context callers need to recover, retry, report, or translate. Map external exceptions at the boundary; do not let raw library errors leak through the application.

```typescript
import { Data, Effect } from "effect"

class UserNotFound extends Data.TaggedError("UserNotFound")<{
  readonly id: string
}> {}

class UserReadError extends Data.TaggedError("UserReadError")<{
  readonly id: string
  readonly cause: unknown
}> {}

declare const db: { findUser(id: string): Promise<User | undefined> }

const findUser = (id: string): Effect.Effect<User, UserNotFound | UserReadError> =>
  Effect.gen(function* () {
    const user = yield* Effect.tryPromise({
      try: () => db.findUser(id),
      catch: (cause) => new UserReadError({ id, cause }),
    })
    if (user === undefined) return yield* new UserNotFound({ id })
    return user
  })
```

- Use `Effect.fail` for a known expected failure
- Use `Effect.try` for a synchronous throwing API
- Use `Effect.tryPromise` for a rejecting Promise. 
- `Effect.promise` assumes the Promise does not reject; ordinary Effect callback exceptions become defects.

Use `Schema.TaggedError` only when an error needs schema-based encoding or decoding; internal errors can use `Data.TaggedError`.

```typescript
import { Schema } from "effect"

class ApiError extends Schema.TaggedError<ApiError>()("ApiError", {
  status: Schema.Int,
  message: Schema.String,
}) {}
```

## Recover or Transform

Recover where the caller has enough context to choose a fallback or translation. Leave errors typed when the caller should decide.

```typescript
import { Effect, Schedule } from "effect"

const anyErrorFallback = effect.pipe(
  Effect.catch(() => Effect.succeed(defaultValue)) // typed failures only
)

const selectedFallback = fetchUser(id).pipe(
  Effect.catchTag("UserNotFound", () => Effect.succeed(defaultUser))
  // Other error tags remain in E.
)

const translated = effect.pipe(
  Effect.mapError((error) => new HttpError(500, error.message)) // transform; do not recover
)
```

Use `Effect.catchIf` for a one-off predicate or `Effect.catchTags` for a small tagged union. Do not add a fallback that hides failures the caller needs to handle.

```typescript
const recovered = request.pipe(Effect.catchTags({
  UserNotFound: () => Effect.succeed(defaultUser),
  NetworkError: (error) => Effect.fail(new HttpError(503, error.message)),
}))
```

Use `Effect.result` when the caller needs a typed success or failure as a value. Use `Effect.option` only when every typed failure means absence; neither converts defects or interruption.

```typescript
const result = Effect.result(findUser(id)) // Effect<Result<User, UserNotFound | UserReadError>, never, R>
const optionalUser = Effect.option(findUser(id)) // discards which typed error occurred
```

## Defects and Complete Outcomes

Use `Effect.die` for bugs or violated invariants, never for expected domain outcomes. `Effect.orDie` is appropriate only when a typed failure cannot be recovered from.

```typescript
const divide = (a: number, b: number) =>
  b === 0
    ? Effect.die(new Error("Invariant violated")) // only if zero is impossible by contract
    : Effect.succeed(a / b)
```

Use typed-error operators for domain recovery. Use `Effect.catchCause` or `Effect.exit` only when defects and interruption matter too; do not turn interruption into ordinary success.

```typescript
import { Effect } from "effect"

const fullOutcome = Effect.exit(effect) // Exit retains success, typed failure, defect, or interruption
```

## Accumulation, Retry, and Timeout

Fail-fast composition is for dependent steps. Use `Effect.validate` to run independent effectful checks and collect all errors; use `Effect.partition` to keep both successes and failures.

```typescript
const allValid = Effect.validate(inputs, validateInput, { concurrency: 10 })
// On failure, E is a non-empty array of validation errors.

const [successes, failures] = yield* Effect.partition(items, processItem, {
  concurrency: 10,
})
```

Retry only transient failures and bound retries. `Effect.retry` acts on typed failures, not defects or interruption.

```typescript
const retried = request.pipe(
  Effect.retry({
    schedule: Schedule.exponential("100 millis"),
    times: 5,
    while: (error) => error._tag === "NetworkError",
  })
)

const timed = request.pipe(Effect.timeout("5 seconds"))
// Timeout interrupts the source and adds Cause.TimeoutError to the typed error channel.
```
