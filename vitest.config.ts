import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Test env không chạy qua Vite plugin (dommiefPlugin.buildAliasChain), nên các import
// `dommief/theme/<kind>/<Name>` cần alias tương đương ở đây — trỏ thẳng theme-default
// (mặc định không override), đúng tinh thần resolver.ts nhưng không chạy filesystem scan.
const root = (p: string) => path.resolve(import.meta.dirname, p);

export default defineConfig({
  resolve: {
    alias: [
      { find: /^dommief\/theme-api$/, replacement: root('packages/core/src/theme-api.tsx') },
      { find: /^dommief\/theme$/, replacement: root('packages/theme-default/src/index.ts') },
      { find: /^dommief\/theme\/slots\/(.*)$/, replacement: root('packages/theme-default/src/slots/$1') },
      { find: /^dommief\/theme\/layouts\/(.*)$/, replacement: root('packages/theme-default/src/layouts/$1') },
      { find: /^dommief\/theme\/builtins\/(.*)$/, replacement: root('packages/theme-default/src/builtins/$1') },
    ],
  },
  test: {},
});
