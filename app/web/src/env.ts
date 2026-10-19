import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
  HERDR_ENV: {
    schema: (value) => value,
  },
});
