# Configuration in Effect-TS

## Overview

Effect provides type-safe configuration management with:
- Environment variables
- Config files (.env, JSON)
- Custom config sources
- Validation and transformation
- Secret redaction

## Basic Config

### Reading Environment Variables

```typescript
import { Config, Effect } from "effect"

// String
const apiKey = Config.String("API_KEY")

// Number
const port = Config.Int("PORT")

// Boolean
const debug = Config.Boolean("DEBUG")

// Use in effects
const program = Effect.gen(function* () {
  const key = yield* apiKey
  const portNum = yield* port
  const isDebug = yield* debug
  return { key, port: portNum, debug: isDebug }
})
```

### Running with Config

```typescript
// Config is read when the effect runs
Effect.runPromise(program)
// The default ConfigProvider reads from the environment
```

## Config Primitives

### Built-in Types

```typescript
import { Config, Schema } from "effect"

// Primitive config constructors
Config.String("VAR")     // string
Config.Int("VAR")        // number (integer)
Config.Number("VAR")     // number
Config.Boolean("VAR")    // boolean
Config.Date("VAR")       // Date (ISO format)
Config.Duration("VAR")   // Duration (for example, "5 seconds", "100ms")
Config.URL("VAR")        // URL

// A BigInt can be decoded from a string with Schema
Config.schema(Schema.BigIntFromString, "VAR")

// Secrets (redacted in logs)
Config.Redacted("SECRET_KEY")
// Type: Config<Redacted<string>>
// Printed as "<redacted>"
```

### Optional and Defaults

```typescript
// Optional (returns Option)
const maybeKey = Config.option(Config.String("API_KEY"))
// Config<Option<string>>

// With default
const port = Config.Int("PORT").pipe(Config.withDefault(3000))
// Config<number> - returns 3000 if PORT is absent

// With fallback config
const apiUrl = Config.orElse(
  Config.String("API_URL"),
  () => Config.String("FALLBACK_URL")
)
```

### Validation

```typescript
import { Config, Schema, SchemaTransformation } from "effect"

// Add constraints with a Schema check
const port = Config.schema(
  Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 65535 })),
  "PORT"
)

// Custom transformation and validation
const logLevelSchema = Schema.String.pipe(
  Schema.decodeTo(
    Schema.String.check(Schema.isLowercased()),
    SchemaTransformation.toLowerCase()
  )
)
const logLevel = Config.schema(logLevelSchema, "LOG_LEVEL")
```

## Structured Config

### Nested Config

```typescript
import { Config } from "effect"

// Combine config values with nested paths
const dbConfig = Config.all({
  host: Config.String("DATABASE_HOST"),
  port: Config.Int("DATABASE_PORT"),
  user: Config.String("DATABASE_USER"),
  password: Config.Redacted("DATABASE_PASSWORD"),
})

// Or with a prefix
const db = Config.all({
  host: Config.String("HOST"),  // DATABASE_HOST
  port: Config.Int("PORT"),    // DATABASE_PORT
  user: Config.String("USER"), // DATABASE_USER
}).pipe(Config.nested("DATABASE"))
```

### App Config Pattern

```typescript
// config.ts
import { Config, Context, Effect, Layer } from "effect"

const loadAllConfig = Effect.gen(function* () {
  const server = yield* Config.all({
    host: Config.String("HOST").pipe(Config.withDefault("0.0.0.0")),
    port: Config.Int("PORT").pipe(Config.withDefault(3000)),
  })

  const database = yield* Config.all({
    url: Config.String("DATABASE_URL"),
    maxConnections: Config.Int("DB_MAX_CONN").pipe(Config.withDefault(10)),
  })

  const features = yield* Config.all({
    enableMetrics: Config.Boolean("ENABLE_METRICS").pipe(Config.withDefault(false)),
    enableTracing: Config.Boolean("ENABLE_TRACING").pipe(Config.withDefault(false)),
  })

  return { server, database, features }
})

export class AppConfig extends Context.Service<AppConfig>()("AppConfig", {
  make: loadAllConfig
}) {
  static readonly layer = Layer.effect(this, this.make)
}

// Use in app
const program = Effect.gen(function* () {
  const config = yield* AppConfig
  console.log(`Starting on ${config.server.host}:${config.server.port}`)
})

const runnable = Effect.provide(program, AppConfig.layer)
```

## Config Providers

### Default Provider (Environment)

```typescript
import { ConfigProvider } from "effect"

// The default provider reads from the environment
// Nested paths use underscore-separated environment variable names
// Array separators are configured by the Config schema
```

### Custom Providers

```typescript
import { ConfigProvider } from "effect"

// From an in-memory object (including parsed JSON)
const testProvider = ConfigProvider.fromUnknown({
  API_KEY: "test-key",
  PORT: 8080,
  DEBUG: true,
  DATABASE: {
    HOST: "localhost",
    PORT: 5432,
  },
})
```

### .env Files with @effect/platform

```typescript
import { ConfigProvider } from "effect"

// Load a .env file; this effect requires a FileSystem service
const dotEnvProvider = ConfigProvider.fromDotEnv({ path: ".env" })
const DotEnvLayer = ConfigProvider.layer(dotEnvProvider)

// Add the provider as a fallback to the current provider
const WithDotEnv = ConfigProvider.layerAdd(dotEnvProvider)
```

### File Tree Provider

```typescript
import { ConfigProvider } from "effect"

// Read config from a directory structure; this effect requires FileSystem and Path services
// config/
//   DATABASE_HOST  (file containing "localhost")
//   DATABASE_PORT  (file containing "5432")
const fileTreeProvider = ConfigProvider.fromDir({ rootPath: "./config" })
```

## Combining Providers

```typescript
import { ConfigProvider } from "effect"

// Fallback chain
const combinedProvider = ConfigProvider.orElse(
  secretsProvider,
  ConfigProvider.orElse(dotEnvProvider, ConfigProvider.fromEnv())
)

const CombinedConfig = ConfigProvider.layer(combinedProvider)
```

## Schema Integration

```typescript
import { Config, Schema } from "effect"

// Define config schema
const AppConfigSchema = Schema.Struct({
  port: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 65535 })),
  host: Schema.String,
  debug: Schema.Boolean,
  logLevel: Schema.Literals(["debug", "info", "warn", "error"]),
})

// Read and validate
const config = Config.schema(AppConfigSchema)
```

## Testing with Config

### Mock Config in Tests

```typescript
import { describe, it, expect } from "vitest"
import { Config, ConfigProvider, Effect, Layer } from "effect"

describe("MyService", () => {
  const testConfig = ConfigProvider.fromUnknown({
    API_URL: "http://test.local",
    TIMEOUT: 5000,
  })

  const TestConfigLayer = ConfigProvider.layer(testConfig)

  it("should use config values", async () => {
    const program = Effect.gen(function* () {
      const url = yield* Config.String("API_URL")
      const timeout = yield* Config.Int("TIMEOUT")
      return { url, timeout }
    }).pipe(Effect.provide(TestConfigLayer))

    const result = await Effect.runPromise(program)
    expect(result.url).toBe("http://test.local")
    expect(result.timeout).toBe(5000)
  })
})
```

### Per-Test Override

```typescript
import { Config, ConfigProvider, Effect } from "effect"

const makeTestLayer = (overrides: Record<string, string>) =>
  ConfigProvider.layer(ConfigProvider.fromUnknown(overrides))

it("should handle missing API key", async () => {
  const layer = makeTestLayer({ PORT: "3000" }) // No API_KEY

  const program = Config.String("API_KEY").pipe(
    Effect.provide(layer)
  )

  await expect(Effect.runPromise(program)).rejects.toThrow()
})
```

## Best Practices

### 1. Centralize Config Definition

```typescript
// config/index.ts
import { Config } from "effect"

export const ServerConfig = Config.all({
  host: Config.String("HOST").pipe(Config.withDefault("0.0.0.0")),
  port: Config.Int("PORT").pipe(Config.withDefault(3000)),
})

export const DatabaseConfig = Config.all({
  url: Config.String("DATABASE_URL"),
  ssl: Config.Boolean("DB_SSL").pipe(Config.withDefault(true)),
})

// Single source of truth
```

### 2. Use Defaults for Optional Values

```typescript
// DO: Provide sensible defaults
const timeout = Config.Int("TIMEOUT").pipe(Config.withDefault(30000))

// DON'T: Make everything required
const timeout = Config.Int("TIMEOUT") // Fails if not set
```

### 3. Validate Early

```typescript
import { Config, Schema } from "effect"

// DO: Validate config at startup
const config = Config.schema(
  Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 65535 })),
  "PORT"
)

// DON'T: Trust config values blindly
const port = Config.Int("PORT")
server.listen(port) // Might fail at runtime
```

### 4. Use Redacted for Secrets

```typescript
import { Config } from "effect"

// DO: Secrets are redacted in logs
const apiKey = Config.Redacted("API_KEY")

// DON'T: Secrets exposed in logs
const apiKey = Config.String("API_KEY") // "sk-1234..." in error messages
```

### 5. Layer for Config Service

```typescript
import { Config, Context, Effect, Layer } from "effect"

// DO: Config as a service for easy mocking
class AppConfig extends Context.Service<AppConfig>()("AppConfig", {
  make: Effect.gen(function* () {
    const timeout = yield* Config.Int("TIMEOUT")
    return { timeout }
  })
}) {
  static readonly layer = Layer.effect(this, this.make)
}

// DON'T: Read config everywhere
const handler = Effect.gen(function* () {
  const timeout = yield* Config.Int("TIMEOUT") // Hard to test
})
```
