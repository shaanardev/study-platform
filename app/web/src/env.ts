import path from 'node:path';

import { defineEnvVars } from '@sveltejs/kit/env';

export const databasePathVariable = 'DB_PATH' as const;

export const variables = defineEnvVars({
  HERDR_ENV: {
    schema: (value) => value,
  },
  [databasePathVariable]: {
    schema: (value) => {
      if (value !== undefined && (value.length === 0 || !path.isAbsolute(value))) {
        throw new Error(`${databasePathVariable} must be a non-empty absolute SQLite path.`);
      }
      return value;
    },
  },
});
