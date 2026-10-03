# Configuration

`Config<T>` describes how to read and validate a setting. Yield it as an Effect or parse it against a specific `ConfigProvider`; the default provider reads the runtime environment.

## Read and Validate Settings

Use the narrowest constructor that matches the value. Required settings have no default; `withDefault` applies only when a value is absent, while `option` represents absence as `Option.none()`.

Common constructors include `String`, `NonEmptyString`, `Finite`, `Int`, `Port`, `Boolean`, `Duration`, `Date`, `URL`, `Redacted`, `Literal`, and `Literals`. Use `Config.Array` or `Config.Record` for list and dictionary settings.

```typescript
import { Config, Effect } from "effect"

const Settings = Config.all({
  apiKey: Config.Redacted("API_KEY"),
  port: Config.Port("PORT").pipe(Config.withDefault(3000)),
  logLevel: Config.Literals(["debug", "info", "warn", "error"], "LOG_LEVEL"),
  optionalTag: Config.String("TAG").pipe(Config.option),
})

const program = Effect.gen(function* () {
  const settings = yield* Settings
  yield* Effect.log(`Listening on ${settings.port}`)
  return settings
})
```

Use `Config.schema` for custom validation or structured settings; decoding failures stay in the `ConfigError` channel.

```typescript
import { Config, ConfigProvider, Effect, Schema } from "effect"

const ServerConfig = Config.schema(
  Schema.Struct({
    host: Schema.NonEmptyString,
    port: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 65535 })),
  }),
  "server",
)

const provider = ConfigProvider.fromUnknown({
  server: { host: "localhost", port: 8080 },
})

const server = Effect.runSync(ServerConfig.parse(provider))
```

`Config.schema` can read that structure from a tree provider or environment paths such as `SERVER_HOST` and `SERVER_PORT`.

## Choose a Provider

| Provider | Use |
|---|---|
| `fromEnv({ env })` | Runtime environment or an explicit environment record for tests |
| `fromUnknown(value)` | In-memory object or parsed JSON |
| `fromDotEnvContents(text)` | Already-loaded `.env` contents |
| `fromDotEnv({ path })` | Read a `.env` file; requires `FileSystem` |
| `fromDir({ rootPath })` | Read a directory tree, such as mounted config files; requires `FileSystem` and `Path` |

`fromEnv` merges `process.env` and `import.meta.env` by default; passing `env` replaces those sources. `fromEnv` and `fromUnknown` treat empty strings as missing unless `preserveEmptyStrings` is enabled.

Use `ConfigProvider.orElse(primary, fallback)` to consult a fallback only when the primary has no value. It does not fall back after a present value fails decoding.

```typescript
import { Config, ConfigProvider } from "effect"

const provider = ConfigProvider.orElse(
  ConfigProvider.fromEnv(),
  ConfigProvider.fromUnknown({ PORT: 3000 }),
)
const port = Config.Port("PORT").parse(provider)
```

Use `ConfigProvider.layer(provider)` to replace the provider for an Effect program, or `ConfigProvider.layerAdd(provider)` to add a fallback to the active provider. For one setting, `config.parse(provider)` avoids changing the program-wide provider.

```typescript
import { Config, ConfigProvider, Effect } from "effect"

const TestConfig = ConfigProvider.layer(
  ConfigProvider.fromUnknown({ PORT: 8080 }),
)
const runnable = Effect.provide(Config.Port("PORT"), TestConfig)
const testPort = await Effect.runPromise(runnable) // 8080
```
