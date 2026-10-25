// ESLint v9 flat config. `pnpm lint` đã bị hỏng hoàn toàn kể từ khi dự án lên eslint@9 (không có
// file này, eslint thoát lỗi ngay trước khi lint được dòng nào) — CI không chạy "lint" nên không ai
// bắt được. Giữ phạm vi NGẮN gọn: chỉ bật recommended + react-hooks, không type-aware (toàn bộ
// kiểm tra kiểu đã có `pnpm typecheck` riêng, bật thêm ở đây chỉ trùng việc + chậm).
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/dist-*/**',
      '**/.dommief/**',
      '**/.vitest/**',
      'tests/fixtures/**',
      'playwright-report/**',
      'test-results/**',
      'docs/tasks/**',
      // Harness/tooling, không phải sản phẩm dommief (tsconfig.json cũng chỉ `include` `packages/*/src`
      // — scripts/ là spec-harness project-agnostic, .claude/ là skill tooling).
      'scripts/**',
      '.claude/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Repo dùng `noUncheckedIndexedAccess` + union kiểu rộng — `any`/`!` có chủ đích ở vài chỗ
      // biên giới untyped (unified/hast, virtual module). `tsc` đã strict; ở lint chỉ cảnh báo.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    files: ['scripts/**/*.{js,mjs}', '*.config.{js,mjs,ts}'],
    languageOptions: { globals: globals.node },
  },
  {
    // Test/e2e: ranh giới untyped (DOM mock, vitest/playwright fixture, hast/unified) khiến `any` và
    // import chưa dùng (giữ để copy/paste nhanh giữa case) phổ biến hơn hẳn code sản phẩm —
    // không đáng warn ở đây (`tsc` strict đã bắt `any` sai chỗ thật). Giữ baseline sảch 0 ở
    // code sản phẩm để cảnh báo mới không chìm trong huóng.
    files: ['tests/**/*.{ts,tsx}', 'e2e/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
);
