import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Test env không chạy qua Vite plugin (dommiefPlugin.buildAliasChain), nên các import
// `dommief/theme/<kind>/<Name>` cần alias tương đương ở đây — trỏ thẳng theme-default
// (mặc định không override), đúng tinh thần resolver.ts nhưng không chạy filesystem scan.
const root = (p: string) => path.resolve(import.meta.dirname, p);

export default defineConfig({
  resolve: {
    // Vite plugin thật (vite/plugin.ts) đã có `dedupe: ['react','react-dom','react-router']`
    // nhưng môi trường test KHÔNG đi qua plugin đó — thiếu dòng này, pnpm có thể resolve
    // react-router từ hai thư mục `node_modules/.pnpm` khác nhau (vd sau khi thêm/gỡ một
    // dependency khác đụng đến resolution tree) -> hai instance module context khác nhau ->
    // `useLocation() may be used only in the context of a <Router>` ngay cả khi code đúng —
    // đã bắt trực tiếp (toàn bộ `client-router.test.tsx`/`hydrate-ssr.test.tsx` đỏ cùng lúc).
    dedupe: ['react', 'react-dom', 'react-router'],
    alias: [
      { find: /^dommief\/theme-api$/, replacement: root('packages/core/src/theme-api.tsx') },
      { find: /^dommief\/theme$/, replacement: root('packages/theme-default/src/index.ts') },
      { find: /^dommief\/theme\/slots\/(.*)$/, replacement: root('packages/theme-default/src/slots/$1') },
      { find: /^dommief\/theme\/layouts\/(.*)$/, replacement: root('packages/theme-default/src/layouts/$1') },
      { find: /^dommief\/theme\/builtins\/(.*)$/, replacement: root('packages/theme-default/src/builtins/$1') },
    ],
  },
  // e2e/ là của Playwright (`pnpm test:e2e`) — vitest không được nhặt.
  test: { globalSetup: ['./tests/global-setup.ts'], exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**'] },
});
