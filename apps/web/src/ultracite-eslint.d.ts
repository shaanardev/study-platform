declare module 'ultracite/eslint/core' {
  import type { Linter } from 'eslint';

  const config: Linter.Config[];
  export default config;
}

declare module 'ultracite/eslint/svelte' {
  import type { Linter } from 'eslint';

  const config: Linter.Config[];
  export default config;
}

declare module 'ultracite/eslint/vitest' {
  import type { Linter } from 'eslint';

  const config: Linter.Config[];
  export default config;
}

declare module 'ultracite/prettier' {
  import type { Config as PrettierConfig } from 'prettier';

  const config: PrettierConfig & { tailwindFunctions?: string[] };
  export default config;
}
