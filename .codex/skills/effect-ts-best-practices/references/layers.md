# Dependency Injection with Layers

`Context.Service` declares a requirement; `Layer` builds and provides its implementation. An effect that yields a service keeps that requirement visible until a layer is provided.

```typescript
Layer.Layer<Out, Error, In>
//             ^     ^     ^
//             |     |     └── Services needed to build the layer
//             |     └──────── Typed construction errors
//             └────────────── Services provided
```

## Define and Use a Service

Use a service shape when implementations are supplied separately. Put effects in methods so failures and dependencies remain in their types.

```typescript
import { Context, Effect, Layer } from "effect"

class UserRepository extends Context.Service<UserRepository, {
  readonly findById: (id: string) => Effect.Effect<User, NotFoundError | DatabaseError>
  readonly save: (user: User) => Effect.Effect<void, DatabaseError>
}>()("UserRepository") {}

const getUser = (id: string) => Effect.gen(function* () {
  const users = yield* UserRepository // Requirement: UserRepository
  return yield* users.findById(id)
})
// Effect<User, NotFoundError | DatabaseError, UserRepository>

const UserRepositoryLive = Layer.succeed(UserRepository, {
  findById: (id) => db.query<User | undefined>("SELECT ...", [id]).pipe(
    Effect.flatMap((user) => user === undefined
      ? Effect.fail(new NotFoundError({ id }))
      : Effect.succeed(user))
  ),
  save: (user) => db.query<void>("INSERT ...", [user.id]),
})
```

Use `Layer.succeed` for an already-built service value. Use a constructor service when there is one canonical implementation:

```typescript
class Logger extends Context.Service<Logger>()("Logger", {
  make: Effect.succeed({
    info: (message: string) => Effect.log(message),
    error: (message: string) => Effect.logError(message),
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}

const greet = Effect.gen(function* () {
  const logger = yield* Logger
  yield* logger.info("Hello")
})

const runnable = greet.pipe(Effect.provide(Logger.layer))
```

`make` is the construction effect; `Layer.effect(this, this.make)` exposes it as a layer. Use another layer when the implementation varies, for example in tests.

## Build Layers with Dependencies

`Layer.effect` builds a service from an effect. Services yielded during construction become layer inputs; supply them by composing layers.

```typescript
class Config extends Context.Service<Config, {
  readonly dbUrl: string
}>()("Config") {}

class Database extends Context.Service<Database, {
  readonly query: <A>(sql: string, params: ReadonlyArray<unknown>) => Effect.Effect<A, DatabaseError>
}>()("Database") {}

const ConfigLive = Layer.succeed(Config, {
  dbUrl: process.env.DATABASE_URL ?? "postgres://localhost/app",
})

const DatabaseLive = Layer.effect(
  Database,
  Effect.gen(function* () {
    const config = yield* Config // Database construction requires Config
    const pool = yield* Effect.tryPromise({
      try: () => createPool(config.dbUrl),
      catch: (cause) => new DatabaseError({ cause }),
    })
    return {
      query: <A>(sql: string, params: ReadonlyArray<unknown>) => Effect.tryPromise({
        try: () => pool.query<A>(sql, params),
        catch: (cause) => new DatabaseError({ cause }),
      }),
    }
  }),
)

const DatabaseWithConfig = Layer.provide(DatabaseLive, ConfigLive)
// Layer.Layer<Database, DatabaseError>; Config is supplied and not included in the output.
```

Use `Layer.provide(layer, dependencies)` when the dependency should be consumed. Use `Layer.provideMerge` when downstream layers also need the dependency in the output:

```typescript
const DatabaseAndConfig = Layer.provideMerge(DatabaseLive, ConfigLive)
// Layer.Layer<Database | Config, DatabaseError>

const AppLayer = Layer.merge(Logger.layer, DatabaseAndConfig)
// Independent layers can be merged; outputs and requirements are combined.
```

## Provide at the Boundary

Provide requirements where an application or test becomes runnable. Keep reusable effects unprovided so callers can choose implementations.

`Clock`, `ConfigProvider`, `Console`, `Random`, and `Tracer` have default services. Override a default only when the program needs different behavior; use a module helper such as `Random.withSeed` when available.

```typescript
const app = Effect.provide(greet, AppLayer)

// For a local one-service override, provide the value directly.
const debugApp = Effect.provideService(greet, Logger, {
  info: (message) => Effect.logDebug(message),
  error: (message) => Effect.logError(message),
})
```


## Scoped Resources

Acquire resources inside layer construction and register their release with `Effect.acquireRelease`; the layer scope runs the finalizer when disposed.

```typescript
const PoolLive = Layer.effect(
  ConnectionPool,
  Effect.gen(function* () {
    const config = yield* Config
    const pool = yield* Effect.acquireRelease(
      Effect.tryPromise({
        try: () => createPool(config.dbUrl),
        catch: (cause) => new DatabaseError({ cause }),
      }),
      (pool) => Effect.promise(() => pool.end()),
    )
    return { pool }
  }),
)
```

## Tests and Runtime

Provide a test implementation at the test boundary; do not make the production service depend on test infrastructure.

Use `ManagedRuntime` when many effects should share one built layer. Dispose it at shutdown to release scoped resources.
```typescript
const LoggerTest = Layer.succeed(Logger, {
  info: (message) => Effect.log(`[test] ${message}`),
  error: (message) => Effect.logError(`[test] ${message}`),
})

const test = greet.pipe(Effect.provide(LoggerTest))
```



```typescript
import { ManagedRuntime } from "effect"

const runtime = ManagedRuntime.make(AppLayer)
const exit = await runtime.runPromiseExit(greet)
await runtime.dispose()
```

## Sharing Layer Instances

Layers are memoized by reference during one build. Reuse the same value when sibling layers should share a dependency; use `Layer.fresh` when a new independent instance is required.

```typescript
class ConnectionPool extends Context.Service<ConnectionPool, {
  readonly pool: Pool
}>()("ConnectionPool") {}

const DatabaseLayer = Layer.provideMerge(DatabaseLive, ConfigLive)
const PoolLayer = Layer.provideMerge(PoolLive, ConfigLive)
const SharedInfrastructure = Layer.merge(DatabaseLayer, PoolLayer)
// ConfigLive is the same layer reference in both branches, so it is built once.

const IsolatedDatabase = Layer.fresh(DatabaseLive)
```
