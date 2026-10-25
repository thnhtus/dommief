import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      'dommief/theme-api': path.resolve(__dirname, 'packages/core/src/theme-api.tsx'),
      'dommief/theme/slots/NotFound': path.resolve(__dirname, 'packages/theme-default/src/slots/NotFound.tsx'),
      'dommief/theme/NotFound': path.resolve(__dirname, 'packages/theme-default/src/slots/NotFound.tsx'),
      'dommief/theme/layouts/GlobalLayout': path.resolve(__dirname, 'packages/theme-default/src/layouts/GlobalLayout.tsx'),
      'dommief/theme/layouts/DocLayout': path.resolve(__dirname, 'packages/theme-default/src/layouts/DocLayout.tsx'),
      'dommief/theme/layouts': path.resolve(__dirname, 'packages/theme-default/src/layouts'),
      'dommief/theme': path.resolve(__dirname, 'packages/theme-default/src/index.ts'),
    },
  },
  test: {},
});
