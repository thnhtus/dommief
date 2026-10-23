import { defineConfig } from 'tsup';
export default defineConfig({
  entry: { index: 'src/index.ts', cli: 'src/cli.ts', 'theme-api': 'src/theme-api.ts' },
  format: ['esm'],
  dts: true,
  clean: true,
  banner: { js: '#!/usr/bin/env node' },
  splitting: false,
});
