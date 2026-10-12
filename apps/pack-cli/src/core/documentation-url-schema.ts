import { Schema } from 'effect';

export const DocumentationUrlsSchema = Schema.Array(
  Schema.String.check(
    Schema.isPattern(/^https:\/\//u),
    Schema.makeFilter((value) => {
      const parsed = URL.parse(value);
      if (!parsed) {
        return 'Documentation URLs must be valid HTTPS URLs';
      }
      return parsed.protocol === 'https:' && parsed.hostname
        ? undefined
        : 'Documentation URLs must use HTTPS';
    }),
  ),
).check(Schema.isMinLength(1));
