# Schema: Decode, Validate, and Encode

A schema describes a decoded `Type` and an encoded `Encoded` representation. Decode untrusted input at boundaries; use the inferred `Type` inside application logic.

```typescript
import { Schema } from "effect"

const User = Schema.Struct({
  id: Schema.String,
  email: Schema.String,
  age: Schema.Finite,
  nickname: Schema.optionalKey(Schema.String),
})

type User = typeof User.Type
type UserInput = typeof User.Encoded
```

`optionalKey` allows a key to be absent; use `Schema.NullOr(Schema.String)` when a present `null` is also valid.

## Compose Schemas

Use `Struct` for records with known fields, `Array` or `Record` for collections, and a discriminated `Union` for variants.

```typescript
const Tags = Schema.Array(Schema.String)
const Scores = Schema.Record(Schema.String, Schema.Finite)
const Point = Schema.Tuple([Schema.Finite, Schema.Finite])

const Shape = Schema.Union([
  Schema.Struct({ _tag: Schema.Literal("Circle"), radius: Schema.Finite }),
  Schema.Struct({ _tag: Schema.Literal("Rectangle"), width: Schema.Finite, height: Schema.Finite }),
])
```

## Decode and Encode

Choose the interpreter to match the boundary: `Result` for synchronous validation, `Effect` when decoding needs asynchronous checks or services. Prefer non-throwing interpreters for untrusted input.

```typescript
import { Effect, Result, Schema } from "effect"

const decoded = Schema.decodeUnknownResult(User)(input)
if (Result.isFailure(decoded)) {
  const message = decoded.failure.message
}
// Otherwise decoded.success has type User.

const decodeRequest = (input: unknown) => Schema.decodeUnknownEffect(User)(input)
// Effect<User, SchemaError>
```

`decodeUnknownSync` and `encodeSync` throw on invalid data; reserve them for trusted code that intentionally uses exceptions. Use `encodeResult` or `encodeEffect` when encoding can fail.

```typescript
const encoded = Schema.encodeResult(User)(user)
// Result<UserInput, SchemaError>
```

Schemas can transform wire formats to domain values. Prefer built-ins such as `FiniteFromString`, `DateFromString`, `Trim`, and `fromJsonString` before writing a custom transformation.

```typescript
const Event = Schema.Struct({
  occurredAt: Schema.DateFromString,
  count: Schema.FiniteFromString,
})

const JsonEvent = Schema.fromJsonString(Event)
// Encoded: JSON string; Type: { occurredAt: Date; count: number }
```

For a custom conversion, define both directions; encoding should produce the intended wire representation, even when it canonicalizes the input.

```typescript
import { Schema, SchemaTransformation } from "effect"

const BooleanFromString = Schema.Literals(["on", "off"]).pipe(
  Schema.decodeTo(Schema.Boolean, SchemaTransformation.transform({
    decode: (value) => value === "on",
    encode: (enabled) => enabled ? "on" : "off",
  })),
)
```

## Validate and Brand

Attach checks to the schema that owns the invariant. Brand validated values when TypeScript should distinguish them from plain strings or numbers.

```typescript
const Email = Schema.String.pipe(
  Schema.check(Schema.isPattern(/^[^@]+@[^@]+\.[^@]+$/)),
  Schema.brand("Email"),
)

type Email = typeof Email.Type
const email = Schema.decodeUnknownResult(Email)(input)
```

Use `Schema.Class` only when class instances, methods, or class-based construction add value; otherwise prefer `Struct`.

```typescript
class Person extends Schema.Class<Person>("Person")({
  name: Schema.NonEmptyString,
  age: Schema.Finite,
}) {
  get label() {
    return `${this.name} (${this.age})`
  }
}

const person = Schema.decodeUnknownSync(Person)(input) // Person instance
```

## Interoperability

Use `Schema.toCodecJson` when a schema’s encoded side must be JSON-compatible. Use `Schema.toStandardSchemaV1` to pass a schema to a library that supports Standard Schema; the schema must require no decoding services.

```typescript
const JsonUser = Schema.toCodecJson(User)
const StandardUser = Schema.toStandardSchemaV1(User)
```

Use `Schema.Option`, `Schema.Result`, or `Schema.Exit` when a data boundary explicitly contains those Effect values.

```typescript
import { Schema } from "effect"

const UserResponse = Schema.Struct({
  user: Schema.OptionFromSelf(
    Schema.Struct({
      id: Schema.String,
      name: Schema.String
    })
  ),
  result: Schema.ResultFromSelf(
    Schema.String,
    Schema.Struct({
      message: Schema.String
    })
  ),
  operation: Schema.ExitFromSelf(
    Schema.Number,
    Schema.String
  )
})
```
