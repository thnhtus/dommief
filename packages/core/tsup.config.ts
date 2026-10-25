import { defineConfig } from 'tsup';
export default defineConfig([
  {
    // search-worker riêng: phải là một entry độc lập (không gộp vào theme-api), vì
    // `new Worker(new URL('dommief/search-worker', import.meta.url), {type:'module'})` cần một
    // file JS đứng riêng để Worker fetch (trình duyệt load worker bằng URL, không phải import).
    entry: { index: 'src/index.ts', 'theme-api': 'src/theme-api.tsx', 'search-worker': 'src/client/search-worker.ts' },
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
