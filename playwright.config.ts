import { defineConfig, devices } from '@playwright/test';

// E2E trình duyệt thật trên site dogfood `examples/docs` — bắt lỗi mà vitest (jsdom/SSR string)
// không thấy: hydrate thật, điều hướng client-side, Web Worker search, localStorage, base path.
//
// Hai server: base `/` (dist mặc định) và base `/sub/` (cùng nguồn, build ra `dist-sub`), cả hai
// chạy bằng `dommief preview` thật — đúng cái người dùng deploy. Build làm MỘT lần trong
// `webServer.command` (không dùng globalSetup: webServer khởi động TRƯỚC globalSetup).
const CLI = '../../packages/core/dist/cli.js';
const PORT = 4318;
const PORT_SUB = 4319;
const buildCore = 'pnpm -C ../../packages/core build';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { trace: 'retain-on-failure' },
  projects: [
    {
      name: 'base-root',
      testIgnore: /(base-sub|responsive)\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${PORT}` },
    },
    {
      name: 'base-sub',
      testMatch: /base-sub\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${PORT_SUB}` },
    },
    {
      name: 'mobile',
      testMatch: /responsive\.spec\.ts/,
      use: { ...devices['Pixel 7'], baseURL: `http://localhost:${PORT}` },
    },
  ],
  // MỘT tiến trình: build core/theme đúng 1 lần (tsup `clean: true` chạy song song sẽ xoá
  // `dist/cli.js` của nhau — cùng race ENOENT đã gặp ở vitest), rồi chạy 2 preview song song.
  webServer: {
    command: [
      `${buildCore} && pnpm -C ../../packages/theme-default build`,
      `node ${CLI} build`,
      `node ${CLI} build --base /sub/ --out-dir dist-sub`,
      `(node ${CLI} preview --port ${PORT} & node ${CLI} preview --base /sub/ --out-dir dist-sub --port ${PORT_SUB} & wait)`,
    ].join(' && '),
    cwd: 'examples/docs',
    url: `http://localhost:${PORT_SUB}/sub/`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
