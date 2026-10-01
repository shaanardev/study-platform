# Effect Schema: Validation and Serialization

## Overview

`Schema<Type, Encoded, Requirements>` describes data transformation:

```typescript
Schema.Codec<Type, Encoded, DecodingServices, EncodingServices>
//            ^      ^         ^                 ^
//            |      |         |                 └── Dependencies for encoding
//            |      |         └──────────────────── Dependencies for decoding
//            |      └────────────────────────────── Wire format (JSON, strings)
//            └───────────────────────────────────── Runtime type (business logic)
```

## Basic Schemas

```typescript
import { Schema } from "effect"

// Primitives
const str = Schema.String        // Schema.Codec<string, string>
const num = Schema.Number        // Schema.Codec<number, number>
const bool = Schema.Boolean      // Schema.Codec<boolean, boolean>
const date = Schema.DateFromString  // Schema.Codec<Date, string> (ISO format)
const bigint = Schema.BigIntFromString  // Schema.Codec<bigint, string>

// Literals
const status = Schema.Literal("pending", "active", "done")
// Schema.Codec<"pending" | "active" | "done", "pending" | "active" | "done">

// Null/Undefined
const nullable = Schema.NullOr(Schema.String)  // string | null
const optional = Schema.UndefinedOr(Schema.String)  // string | undefined
```

## Structs (Objects)

```typescript
// Define struct schema
import { Effect, Schema } from "effect"

const User = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  email: Schema.String,
  age: Schema.Number,
  isActive: Schema.Boolean,
})

// Infer TypeScript type
type User = Schema.Schema.Type<typeof User>
// { id: string; name: string; email: string; age: number; isActive: boolean }

// Optional fields
const UserWithOptional = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  bio: Schema.optional(Schema.String),  // Optional in Type
  createdAt: Schema.Date.pipe(
    Schema.optional,
    Schema.withDecodingDefaultType(Effect.succeed(new Date()))
  ),
})

// Struct fields are readonly by default
const ImmutableUser = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
})
```

## Arrays and Records

```typescript
// Arrays
const Tags = Schema.Array(Schema.String)
// Schema.Codec<string[], string[]>

// Non-empty arrays
const NonEmptyTags = Schema.NonEmptyArray(Schema.String)
// Schema.Codec<[string, ...string[]], [string, ...string[]]>

// Records (dictionaries)
const Scores = Schema.Record(Schema.String, Schema.Number)
// Schema.Codec<Record<string, number>>

// Tuples
const Point = Schema.Tuple([Schema.Number, Schema.Number])
// Schema.Codec<readonly [number, number], readonly [number, number]>
```

## Unions and Discriminated Unions

```typescript
// Simple union
const StringOrNumber = Schema.Union([Schema.String, Schema.Number])

// Discriminated union (recommended)
const Shape = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("circle"),
    radius: Schema.Number,
  }),
  Schema.Struct({
    type: Schema.Literal("rectangle"),
    width: Schema.Number,
    height: Schema.Number,
  })
])
// Discriminant: "type" field

// Type extraction
type Shape = Schema.Schema.Type<typeof Shape>
```

## Decoding (Validation)

### Sync Decoding

```typescript
import { Schema } from "effect"

const User = Schema.Struct({
  name: Schema.String,
  age: Schema.Number,
})

// Throws on failure
const user = Schema.decodeUnknownSync(User)({ name: "John", age: 30 })

// Returns an Exit
const result = Schema.decodeUnknownExit(User)({ name: "John", age: "30" })
// Failure Exit with a schema error (age is string, not number)

// With options
Schema.decodeUnknownSync(User, {
  errors: "all",     // Collect all errors
  onExcessProperty: "error"  // Fail on extra properties
})({ name: "John", age: 30, extra: true })
```

### Async Decoding (Effect)

```typescript
import { Effect, Schema } from "effect"

const program = Effect.gen(function* () {
  const input = yield* getInput()
  const user = yield* Schema.decodeUnknownEffect(User)(input)
  return user
})
// Typed error: Schema.SchemaError
```

## Encoding (Serialization)

```typescript
// Encode typed value to wire format
const encoded = Schema.encodeSync(User)(user)
// { name: "John", age: 30 }

// With Date transformation
const Event = Schema.Struct({
  name: Schema.String,
  date: Schema.DateFromString,  // Date <-> ISO string
})

const event = { name: "Party", date: new Date() }
const json = Schema.encodeSync(Event)(event)
// { name: "Party", date: "2024-01-15T..." }
```

## Transformations

### Built-in Transformations

```typescript
import { Schema, SchemaGetter } from "effect"

// String to Number
const NumberFromString = Schema.NumberFromString
// Schema.Codec<number, string>
// "42" -> 42, 42 -> "42"

// String to Date
const DateFromString = Schema.DateFromString
// Schema.Codec<Date, string>

// Trim strings
const TrimmedString = Schema.Trim
// " hello " -> "hello"

// Lowercase
const LowerString = Schema.String.pipe(Schema.decodeTo(Schema.String, {
  decode: SchemaGetter.transform((s) => s.toLowerCase()),
  encode: SchemaGetter.transform((s) => s),
}))

// Parse JSON
const JsonString = Schema.fromJsonString(Schema.Struct({ foo: Schema.Number }))
// '{"foo": 42}' -> { foo: 42 }
```

### Custom Transformations

```typescript
// Transform between types
import { Schema, SchemaGetter } from "effect"

const Slug = Schema.String.pipe(Schema.decodeTo(Schema.String, {
  decode: SchemaGetter.transform((s) => s.toLowerCase().replace(/\s+/g, "-")),
  encode: SchemaGetter.transform((s) => s.replace(/-/g, " ")),
}))

// With validation (can fail)
const PositiveNumber = Schema.Number.check(Schema.isGreaterThan(0))
```

## Filters (Refinements)

```typescript
// Add validation constraints
const Email = Schema.String.pipe(
  Schema.check(Schema.isPattern(/^[^@]+@[^@]+\.[^@]+$/)),
  Schema.brand("Email")
)

const Age = Schema.Number.pipe(
  Schema.check(Schema.isInt()),
  Schema.check(Schema.isBetween({ minimum: 0, maximum: 150 })),
  Schema.brand("Age")
)

const NonEmptyString = Schema.String.pipe(
  Schema.check(Schema.isMinLength(1)),
  Schema.brand("NonEmptyString")
)

// Multiple filters
const Username = Schema.String.pipe(
  Schema.check(Schema.isMinLength(3)),
  Schema.check(Schema.isMaxLength(20)),
  Schema.check(Schema.isPattern(/^[a-z0-9_]+$/)),
  Schema.brand("Username")
)
```

## Branded Types

```typescript
// Create nominal types
import { Schema } from "effect"

const UserId = Schema.String.pipe(Schema.brand("UserId"))
const PostId = Schema.String.pipe(Schema.brand("PostId"))

type UserId = Schema.Schema.Type<typeof UserId>
type PostId = Schema.Schema.Type<typeof PostId>

// TypeScript prevents mixing them
const getUser = (id: UserId) => /* ... */
const getPost = (id: PostId) => /* ... */

const userId: UserId = Schema.decodeSync(UserId)("user-123")
const postId: PostId = Schema.decodeSync(PostId)("post-456")

getUser(userId)  // OK
getUser(postId)  // Type error! PostId is not UserId
```

## Class-Based Schemas

```typescript
// Define as class for instanceof checks
class User extends Schema.Class<User>("User")({
  id: Schema.String,
  name: Schema.String,
  email: Schema.String,
}) {
  // Add methods
  get displayName() {
    return `${this.name} <${this.email}>`
  }
}

// Create instances
const user = new User({ id: "1", name: "John", email: "john@example.com" })
user.displayName  // "John <john@example.com>"
user instanceof User  // true

// Decode creates instance
const decoded = Schema.decodeSync(User)({ id: "1", name: "John", email: "john@example.com" })
decoded instanceof User  // true
```

## Tagged Errors with Schema

```typescript
// Serializable error type
class NotFoundError extends Schema.TaggedError<NotFoundError>()("NotFoundError", {
  entityType: Schema.String,
  id: Schema.String,
}) {}

class ValidationError extends Schema.TaggedError<ValidationError>()("ValidationError", {
  field: Schema.String,
  message: Schema.String,
}) {}

// Usage
const error = new NotFoundError({ entityType: "User", id: "123" })
JSON.stringify(error)  // Works! Serializable
```

## Effect Data Types

```typescript
// Option
const MaybeAge = Schema.Option(Schema.Number)
// { _tag: "None" } or { _tag: "Some", value: 42 }

// Result
const Result = Schema.Result(Schema.Number, Schema.String)

// Exit
const ExitSchema = Schema.Exit(Schema.Number, Schema.String, Schema.Unknown)
```

## Config with Schema

```typescript
import { Config, Schema } from "effect"

// Define config schema
const AppConfig = Schema.Struct({
  port: Schema.Number.check(Schema.isBetween({ minimum: 1, maximum: 65535 })),
  host: Schema.String,
  debug: Schema.Boolean,
})

// Load from environment with validation
const config = Config.all({
  port: Config.Int("PORT"),
  host: Config.String("HOST"),
  debug: Config.Boolean("DEBUG"),
}).pipe(
  Config.map((c) => Schema.decodeSync(AppConfig)(c))
)
```

## Best Practices

### 1. Define Schemas at Module Level

```typescript
// DO: Reusable schema definitions
// schemas/user.ts
import { Schema } from "effect"

export const User = Schema.Struct({ /* ... */ })
export type User = Schema.Schema.Type<typeof User>

// DON'T: Inline schemas
const data = Schema.decodeSync(Schema.Struct({ name: Schema.String }))(input)
```

### 2. Use Brands for Domain Types

```typescript
// DO: Branded types prevent mixing
import { Schema } from "effect"

const UserId = Schema.String.pipe(Schema.brand("UserId"))
const OrderId = Schema.String.pipe(Schema.brand("OrderId"))

// DON'T: Plain strings are interchangeable
type UserId = string
type OrderId = string
```

### 3. Validate at Boundaries

```typescript
// DO: Decode at system boundaries
import { Effect, Schema } from "effect"

const handleRequest = (body: unknown) =>
  Effect.gen(function* () {
    const input = yield* Schema.decodeUnknownEffect(CreateUserInput)(body)
    // input is now typed and validated
  })

// DON'T: Trust external data
const handleRequest = (body: CreateUserInput) => {
  // body might not actually match the type!
}
```

### 4. Use decodeUnknown for External Data

```typescript
// DO: External data is unknown
Schema.decodeUnknownEffect(User)(apiResponse)

// DON'T: Assume type matches
Schema.decodeEffect(User)(apiResponse as User)  // Defeats the purpose!
```
