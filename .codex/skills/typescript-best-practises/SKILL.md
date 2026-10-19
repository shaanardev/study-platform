---
name: typescript-best-practises
description: Language-level guidance for modeling TypeScript values, APIs, asynchronous work, and errors.
---

# TypeScript Best Practises

Use this guidance when writing or reviewing TypeScript and JavaScript. Framework and package conventions belong with their own project guidance.

## Model types around runtime behavior

- Treat values from external input, storage, databases, and child processes as untrusted at the boundary; validate them once, then rely on the resulting type.
- Use discriminated unions when variants have different fields or behavior. Keep each variant's required data together.
- Choose between a compile-time union and a runtime representation deliberately. Use a type union when only static checking needs the values; use runtime values when code or validation needs them.
- Infer types where that stays clear. Add explicit types at public module boundaries or where inference hides an important contract.

## Keep APIs purposeful

- Choose helpers by the behavior they name or isolate, not only by caller count. Inline trivial wrappers; retain helpers that name domain behavior, remove meaningful duplication, or isolate an effect.
- Do not export implementation details only so tests can reach them. Test through public behavior or extract a genuinely reusable pure module.

## Asynchronous work

- Use Promise.all for independent operations. Keep operations sequential when later work depends on earlier results.
- Pass AbortSignal through cancellable I/O and distinguish cancellation of waiting from cancellation of the underlying operation.

## Error handling example

Swallowing a failure hides the reason the operation failed:

```ts
const persistRecord = async (write: () => Promise<void>): Promise<void> => {
  try {
    await write();
  } catch {
    return;
  }
};
```

Add context while preserving the original cause:

```ts
const persistRecord = async (write: () => Promise<void>): Promise<void> => {
  try {
    await write();
  } catch (cause) {
    throw new Error('Could not persist the record.', { cause });
  }
};
```
