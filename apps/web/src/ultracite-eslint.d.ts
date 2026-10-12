declare module 'ultracite/prettier' {
  import type { Config as PrettierConfig } from 'prettier';

  const config: PrettierConfig & { tailwindFunctions?: string[] };
  export default config;
}
