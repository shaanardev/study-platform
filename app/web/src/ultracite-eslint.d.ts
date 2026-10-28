declare module 'ultracite/prettier' {
  import type { Config as PrettierConfig } from 'prettier';

  const config: PrettierConfig & { tailwindFunctions?: string[] };
  export default config;
}

declare module 'ultracite/eslint/vitest' {
  import type { Config } from 'eslint/config';

  const config: Config[];
  export default config;
}

declare module 'ultracite/eslint/vitest/type-aware' {
  import type { Config } from 'eslint/config';

  const config: Config[];
  export default config;
}

declare module 'ultracite/eslint/playwright' {
  import type { Config } from 'eslint/config';

  const config: Config[];
  export default config;
}
