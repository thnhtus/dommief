import { defineConfig } from 'tsup';
export default defineConfig([
  {
    // KHÔNG có entry 'search-worker' ở đây: `theme-api.tsx` dùng
    // `new Worker(new URL('./client/search-worker.ts', import.meta.url))` — Vite worker plugin
    // (khi site thật build) tự bundle TRỰC TIẾP từ file nguồn này thành asset riêng, KHÔNG
    // đi qua `dist/search-worker.js` của package này. Một entry 'search-worker' + export
    // `./search-worker` trong package.json từng tồn tại dựa trên đường dẫn cũ
    // (`new Worker(new URL('dommief/search-worker', ...))`) đã bị đổi sang đường dẫn tương
    // đối ở trên — không ai import specifier đó nữa (giữ lại là build artifact chết, không
    // test, dễ lệch khỏi code thật), nên đã gỡ.
    entry: { index: 'src/index.ts', 'theme-api': 'src/theme-api.tsx' },
    format: ['esm'],
    dts: true,
    clean: true,
    splitting: false,
    // `import('virtual:dommief/search-index')` trong theme-api.tsx CHỈ resolve được dưới Vite
    // (virtual module của dommiefSearchIndexPlugin), không tồn tại khi esbuild/tsup build GểI
    // này. Rõ ràng khai external thay vì dựa vào heuristic ngầm của esbuild ("bỏ qua lỗi resolve
    // nếu dynamic import nằm trong try/catch" — đã vỡ thật khi tách logic sang hàm riêng không
    // còn `try` bao trực tiếp quanh `await import(...)`, build thất bại ở PR DM-803).
    external: [/^virtual:dommief\//],
  },
  {
    // shebang chỉ cho CLI; theme-api chạy ở trình duyệt nên không được có `#!`.
    entry: { cli: 'src/cli.ts' },
    format: ['esm'],
    banner: { js: '#!/usr/bin/env node' },
    splitting: false,
  },
]);
