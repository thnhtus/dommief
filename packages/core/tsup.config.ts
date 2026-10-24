import { defineConfig } from 'tsup';
export default defineConfig([
  {
    entry: { index: 'src/index.ts', 'theme-api': 'src/theme-api.tsx' },
    format: ['esm'],
    dts: true,
    clean: true,
    splitting: false,
  },
  {
    // shebang chỉ cho CLI; theme-api chạy ở trình duyệt nên không được có `#!`.
    entry: { cli: 'src/cli.ts' },
    format: ['esm'],
    banner: { js: '#!/usr/bin/env node' },
    splitting: false,
  },
]);
