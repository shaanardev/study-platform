import * as Schema from 'effect/Schema';

export type JsonValue = boolean | null | number | string | readonly JsonValue[] | JsonObject;

export interface JsonObject {
  readonly [key: string]: JsonValue;
}

export const JsonValueSchema: Schema.Codec<JsonValue, unknown> = Schema.suspend(() =>
  Schema.Union([
    Schema.Null,
    Schema.Boolean,
    Schema.Finite,
    Schema.String,
    Schema.Array(JsonValueSchema),
    Schema.Record(Schema.String, JsonValueSchema),
  ]),
);

export const JsonObjectSchema = Schema.Record(Schema.String, JsonValueSchema);

export const JsonTextSchema = Schema.fromJsonString(JsonValueSchema);

export const decodeJsonText: (input: string) => JsonValue =
  Schema.decodeUnknownSync(JsonTextSchema);

export const decodeJsonStringArray = (input: string): string[] => [
  ...Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Array(Schema.String)))(input),
];

export const isJsonObject: (value: unknown) => value is JsonObject = Schema.is(JsonObjectSchema);

export const isJsonArray = Schema.is(Schema.Array(JsonValueSchema));
