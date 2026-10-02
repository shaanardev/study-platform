# Error Handling in Effect-TS

Effect makes expected failures explicit in the `E` error channel of `Effect<A, E, R>`. 

- Use `Result<A, E>` for synchronous, pure computations that can succeed or fail. 
- Use `Cause` and `Exit` when the complete runtime outcome matters, including defects and interruption.
- Use `Result` for pure validation, parsing, and other synchronous computations.
- Use typed failures in `Effect` for expected failures from effectful operations such as filesystem, network, database, concurrency, or timing.
- Use defects for bugs and violated invariants, not ordinary business outcomes.
- Do not use JavaScript `throw` or `try/catch` as application control flow. Return a `Result` or fail an `Effect` instead. At an interop boundary, use `Result.try`, `Effect.try`, or `Effect.tryPromise` to translate an API that throws or rejects into a typed failure.
- Use `Exit` when you must observe success, typed failure, defect, and interruption together.

## Pure computations

Use `Result<A, E>` for synchronous, pure computations such as validation and parsing. Return typed failures as data rather than throwing exceptions:

- `Result.succeed`
- `Result.fail`
- `Result.try` to adapt a synchronous function that may throw
- `Result.gen` for sequential composition
- `Result.all` to combine results and fail with the first failure

`Result.gen` short-circuits at the first `Failure`. Keep side effects out of it. For independent checks where every error should be reported, accumulate validation errors as ordinary data or use the appropriate accumulating API; do not expect `Result.all` or `Result.gen` to collect all failures.

```typescript
import { Data, Result } from "effect"

class InvalidEmail extends Data.TaggedError("InvalidEmail")<{
  readonly value: string
}> {}

class InvalidAge extends Data.TaggedError("InvalidAge")<{
  readonly value: number
}> {}

type UserInput = {
  readonly email: string
  readonly age: number
}

const validateEmail = (email: string): Result.Result<string, InvalidEmail> =>
  email.includes("@")
    ? Result.succeed(email)
    : Result.fail(new InvalidEmail({ value: email }))

const validateAge = (age: number): Result.Result<number, InvalidAge> =>
  age >= 18
    ? Result.succeed(age)
    : Result.fail(new InvalidAge({ value: age }))

const validateUser = (input: UserInput) =>
  Result.gen(function* () {
    const email = yield* validateEmail(input.email)
    const age = yield* validateAge(input.age)
    return { email, age }
  })
```

When adapting a synchronous parser that throws, use `Result.try` at that boundary and map the thrown value to a meaningful typed error. Do not write a JavaScript `try/catch` and throw a replacement error yourself:

```typescript
import { Data, Result } from "effect"

class ParseError extends Data.TaggedError("ParseError")<{
  readonly cause: unknown
}> {}

const parseJson = (input: string) =>
  Result.try({
    try: () => JSON.parse(input) as unknown,
    catch: (cause) => new ParseError({ cause })
  })
```

`Result.try` is an interop adapter for code that can throw; it is not a reason to write new throwing code. For ordinary validation, construct `Result.fail` directly.

## Effectful computations

Use `Effect<A, E, R>` when the computation performs or describes effects. Expected failures belong in `E`, so callers can see and handle them. Prefer the most specific error type that explains the failure.

- Use `Effect.fail` for an expected typed failure.
- Use `Effect.try` to adapt a synchronous API that may throw.
- Use `Effect.tryPromise` to adapt a promise-based API that may reject.
- Use `Effect.catch` for recovery from all typed errors.
- Use `Effect.catchTag` or `Effect.catchTags` for selective recovery from tagged errors.
- Use `Effect.mapError` to transform a typed error without recovering.
- Use `Effect.catchCause` only when the complete `Cause` matters.

An effectful operation should not be run inside a `Result` computation. A `Result` can be yielded directly inside `Effect.gen`; use `Effect.fromResult` when passing a `Result` to an Effect combinator such as `Effect.all`.

```typescript
import { Data, Effect } from "effect"

class UserNotFound extends Data.TaggedError("UserNotFound")<{
  readonly id: string
}> {}

class UserReadError extends Data.TaggedError("UserReadError")<{
  readonly id: string
  readonly cause: unknown
}> {}

declare const db: {
  findUser(id: string): Promise<User | undefined>
}

const findUser = (id: string): Effect.Effect<User, UserNotFound | UserReadError> =>
  Effect.gen(function* () {
    const user = yield* Effect.tryPromise({
      try: () => db.findUser(id),
      catch: (cause) => new UserReadError({ id, cause })
    })

    if (user === undefined) {
      return yield* new UserNotFound({ id })
    }

    return user
  })
```

**Avoid:** wrapping Effect code in JavaScript `try/catch`, throwing for expected failures, or using `Effect.sync` / `Effect.promise` for APIs that can throw or reject. In Effect v4, exceptions thrown inside ordinary Effect callbacks are defects; use `Effect.try` / `Effect.tryPromise` when the exception is an expected boundary failure that should enter the typed error channel.

## Creating Typed Errors

### Using Data.TaggedError

Use tagged errors to represent distinct expected failure cases. Give each error the data callers need to decide whether to recover, retry, report, or translate it.

```typescript
import { Data, Effect } from "effect"

class NotFoundError extends Data.TaggedError("NotFoundError")<{
  readonly entityType: string
  readonly id: string
}> {}

class ValidationError extends Data.TaggedError("ValidationError")<{
  readonly field: string
  readonly message: string
}> {}

class NetworkError extends Data.TaggedError("NetworkError")<{
  readonly url: string
  readonly status: number
  readonly cause: unknown
}> {}

const findUser = (id: string): Effect.Effect<User, NotFoundError> =>
  Effect.gen(function* () {
    const user = yield* db.find(id)
    if (user === undefined) {
      return yield* new NotFoundError({ entityType: "User", id })
    }
    return user
  })
```

### Using Schema.TaggedError (Serializable)

Use `Schema.TaggedError` when the error must be described by a schema for encoding, decoding, or a structured API boundary. Do not make every internal error serializable unless that is a real requirement.

```typescript
import { Schema } from "effect"

class ApiError extends Schema.TaggedError<ApiError>()("ApiError", {
  status: Schema.Number,
  message: Schema.String,
  code: Schema.optional(Schema.String)
}) {}

const error = new ApiError({ status: 404, message: "Not found" })
```

## Failing Effects

Use typed errors for expected outcomes and adapt exception-based libraries at the boundary. Keep the error mapping close to the external operation so raw library errors do not leak throughout the application.

```typescript
import { Data, Effect } from "effect"

class ReadError extends Data.TaggedError("ReadError")<{
  readonly cause: unknown
}> {}

class NetworkError extends Data.TaggedError("NetworkError")<{
  readonly url: string
  readonly cause: unknown
}> {}

class NotFoundError extends Data.TaggedError("NotFoundError")<{
  readonly entityType: string
  readonly id: string
}> {}

declare const url: string
declare const legacyReader: { read(): string }
declare const legacyClient: { request(url: string): Promise<string> }

const failTyped = Effect.fail(new NotFoundError({ entityType: "User", id: "123" }))

// Adapt a synchronous API that throws. The caught value is mapped to a typed error.
const trySync = Effect.try({
  try: () => legacyReader.read(),
  catch: (cause) => new ReadError({ cause })
})

// Adapt a promise API that may reject. Do not use Effect.promise for a rejecting API.
const tryPromise = Effect.tryPromise({
  try: () => legacyClient.request(url),
  catch: (cause) => new NetworkError({ url, cause })
})
```

For pure parsing, return a `Result` and lift it only when composing with an effect:

```typescript
import { Data, Effect, Result } from "effect"

class ParseError extends Data.TaggedError("ParseError")<{
  readonly cause: unknown
}> {}

const parseJson = (input: string) =>
  Result.try({
    try: () => JSON.parse(input) as unknown,
    catch: (cause) => new ParseError({ cause })
  })

const program = Effect.gen(function* () {
  const value = yield* parseJson(input)
  return value
})
```

Use `Result.gen` to compose synchronous validations, including validations in loops:

```typescript
import { Data, Result } from "effect"

class PathError extends Data.TaggedError("PathError")<{
  readonly path: string
}> {}

declare const validatePath: (path: string) => Result.Result<void, PathError>

const validatePaths = (paths: ReadonlyArray<string>): Result.Result<void, PathError> =>
  Result.gen(function* () {
    for (const path of paths) {
      yield* validatePath(path)
    }
    return undefined
  })
```

## Creating Defects

Use defects only for bugs or violated invariants. Model expected outcomes—such as invalid input, missing records, or unavailable dependencies—as typed failures.

```typescript
import { Effect } from "effect"

// This state is impossible by contract.
const impossibleState = Effect.die(new Error("Invariant violated"))

// Convert a typed failure to a defect only when it cannot be recovered from.
const mustSucceed = Effect.orDie(mayFailEffect)
```

## Error Recovery

Recover at the layer that has enough context to choose a meaningful fallback or translation. If the caller should make the decision, leave the typed error in the channel.

### catch - Handle All Typed Errors

`Effect.catch` handles every typed error in the error channel. It does not recover defects or interruption.

```typescript
const withFallback = fetchUser(id).pipe(
  Effect.catch((error) => {
    // error is the typed union, for example NotFoundError | NetworkError
    return Effect.succeed(defaultUser)
  })
)
// Effect<User, never, R>
```

### catchTag - Handle Specific Error

```typescript
// NotFoundError is handled; other error types remain in the error channel.
const program = fetchUser(id).pipe(
  Effect.catchTag("NotFoundError", (error) => {
    console.log(`User ${error.id} not found; using default`)
    return Effect.succeed(defaultUser)
  })
)
```

### catchTags - Handle Multiple Errors

```typescript
const program = fetchUser(id).pipe(
  Effect.catchTags({
    NotFoundError: () => Effect.succeed(defaultUser),
    NetworkError: (error) =>
      Effect.retry(
        fetchUser(id),
        Schedule.recurs(3)
      ),
    ValidationError: (error) => Effect.fail(new HttpError(400, error.message))
  })
)
```

### catchFilter - Conditional Recovery

Use `Effect.catchFilter` with a `Filter` when recovery depends on a reusable predicate. For a simple tagged error, prefer `catchTag`.

```typescript
import { Effect, Filter } from "effect"

const program = effect.pipe(
  Effect.catchFilter(
    Filter.fromPredicate(
      (error) => error._tag === "NotFoundError" && error.id === "admin"
    ),
    () => Effect.succeed(adminUser)
  )
)
```

## Converting Errors

### To Result

Use `Effect.result` when a caller needs to inspect the typed success or failure as a `Result` while the computation remains effectful.
For pure parsing or validation, use `Result` directly instead of wrapping it in an `Effect`.

```typescript
import { Effect, Result } from "effect"

const asResult = Effect.result(mayFail)
// Effect<Result<Success, Error>, never, R>

const program = Effect.gen(function* () {
  const result = yield* Effect.result(riskyOperation)
  return Result.match(result, {
    onFailure: (failure) => {
      console.log("Failed:", failure)
      return defaultValue
    },
    onSuccess: (success) => success
  })
})
```

### Transform Errors

Use `Effect.mapError` to translate an error while keeping the failure behavior. Use `Effect.mapBoth` only when both channels need transformation.

```typescript
const mapped = effect.pipe(
  Effect.mapError((error) => new HttpError(500, error.message))
)

const mapBoth = effect.pipe(
  Effect.mapBoth({
    onFailure: (error) => new WrapperError(error),
    onSuccess: (value) => value.toUpperCase()
  })
)
```

## Error Accumulation

Fail-fast composition is right for dependent steps. When independent validations should all run, choose an API that explicitly accumulates failures.

### Validate Independent Effectful Operations (Collect All Errors)

Use `Effect.validate` when each validation performs an effect. It runs every validation and, if any fail, fails with a non-empty collection of all errors. It succeeds with the collection of values only when all succeed.

```typescript
const validateAll = Effect.validate(
  inputs,
  (input) => validateInput(input),
  { concurrency: 10 }
)
// Effect validates every input and accumulates failures.
```

### Partition Results

Use `Effect.partition` when every item should be processed and the caller needs both failures and successes. Its result is `[failures, successes]`.

```typescript
const [failures, successes] = yield* Effect.partition(
  items,
  processItem,
  { concurrency: 10 }
)
```

## Cause

`Cause` is a flat collection of reasons and records why an Effect failed, including typed failures, defects, interruption, and multiple reasons. Use `Effect.catchCause` only when the handling logic needs that full information; otherwise use typed error operators.

For an outcome that must include success, typed failure, defect, and interruption, use `Effect.exit` and inspect the resulting `Exit`.

```typescript
import { Cause, Effect } from "effect"

const withCause = effect.pipe(
  Effect.catchCause((cause) => {
    for (const reason of cause.reasons) {
      if (Cause.isFailReason(reason)) {
        const error = reason.error
      }
      if (Cause.isDieReason(reason)) {
        const defect = reason.defect
      }
      if (Cause.isInterruptReason(reason)) {
        // The fiber was interrupted. Do not turn interruption into ordinary success.
      }
    }
    // Preserve the original cause, including defects, interruption, and all reasons.
    return Effect.failCause(cause)
  })
)
```

Combine causes only when deliberately constructing a combined failure. Prefer the Cause inspection helpers when you need to inspect runtime outcomes.

```typescript
// Combine causes
Cause.combine(cause1, cause2)

// Pretty-print for diagnostics
Cause.pretty(cause)
```

## Retry and Timeout

Retry only transient failures, and always bound retries with an appropriate schedule or limit. Do not retry defects or permanent domain failures.

### Retry with Schedule

```typescript
import { Effect, Schedule } from "effect"

// Retry according to a bounded schedule
const retry3 = effect.pipe(
  Effect.retry(Schedule.recurs(3))
)

// Exponential backoff with a maximum number of retries
const retryExponential = effect.pipe(
  Effect.retry({
    schedule: Schedule.exponential("100 millis"),
    times: 5
  })
)

// Retry only transient errors from a tagged error union.
const retryOnNetwork = fetchUser(id).pipe(
  Effect.retry({
    schedule: Schedule.recurs(3),
    while: (error) => error._tag === "NetworkError"
  })
)
```

### Timeout

`Effect.timeout` interrupts the source when the timeout wins and fails with `Cause.TimeoutError`. Source typed failures remain typed failures.

```typescript
import { Effect } from "effect"

const withTimeout = effect.pipe(Effect.timeout("5 seconds"))
// The error channel includes the source error and Cause.TimeoutError.
```

## Best Practices

### 1. Use Tagged Errors

Prefer named tagged error types for expected domain and application failures. 

```typescript
// DO: use a tagged error with the data callers need
class NotFoundError extends Data.TaggedError("NotFoundError")<{
  readonly id: string
}> {}

// DON'T: use strings or generic Error values for domain failures
Effect.fail("not found")
Effect.fail(new Error("not found"))
```

### 2. Be Specific with Error Types

```typescript
// DO: model distinct failure modes
type UserServiceError = NotFoundError | ValidationError | DatabaseError

// DON'T: erase the known failure cases
type UserServiceError = Error
```

### 3. Defects for Bugs Only

```typescript
// DO: defect only when a violated invariant indicates a bug
if (stateIsImpossible) {
  return Effect.die(new Error("Invariant violated"))
}

// DON'T: defect for an expected condition
if (user === undefined) {
  return Effect.die(new Error("User not found")) // Model as a typed failure.
}
```

### 4. Handle Errors Close to Source

Translate low-level errors where their meaning is known, but do not recover there unless that layer owns the recovery policy.

```typescript
// DO: translate a database failure into an application-level failure
const getUser = db.findUser(id).pipe(
  Effect.catchTag("DbError", (error) =>
    error.code === "NOT_FOUND"
      ? Effect.fail(new NotFoundError({ id }))
      : Effect.fail(new DatabaseError({ cause: error }))
  )
)

// DON'T: allow an untyped Promise rejection or library error to leak
const getUser = db.findUser(id)
```

### 5. Log Before Recovery

Log at the layer with useful context, and avoid logging the same failure at every layer. Keep the typed failure available to subsequent recovery logic.

```typescript
const withLogging = effect.pipe(
  Effect.tapError((error) =>
    Effect.log(`Operation failed: ${error._tag}`, { error })
  ),
  Effect.catchTag("NotFoundError", () => Effect.succeed(defaultValue))
)
```