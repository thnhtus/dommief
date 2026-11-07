import { afterAll, expect, it } from 'vitest';
// vite chỉ cài trong packages/core (không ở root).
import { createServer } from '../packages/core/node_modules/vite/dist/node/index.js';
import { dommiefPlugin } from '../packages/core/src/vite/plugin.ts';
import { createSite } from './helpers/fixture-site.ts';

// Hồi quy: Vite 8 dev bỏ qua `moduleType: 'jsx'` → .md/demo tới trình duyệt là JSX thô (lỗi import-analysis);
// và thiếu optimizeDeps → React CJS bị serve thô ("does not provide an export named 'jsxDEV'").
const s = createSite('dev-server');
const server = await createServer({ root: s.dir, logLevel: 'silent', plugins: [dommiefPlugin({ root: s.dir })], server: { port: 0 } });
afterAll(async () => { await server.close(); s.cleanup(); });

it('dev: .md và demo được biên dịch thành JS, React nằm trong optimizeDeps', async () => {
  expect(server.config.optimizeDeps.include).toContain('react/jsx-dev-runtime');
  const page = await server.transformRequest(s.dir + '/docs/guide/getStarted.md');
  expect(page?.code).toContain('jsxDEV');
  const demoId = page!.code.match(/virtual:dommief-demo\/([\w-]+)/)![1];
  const demo = await server.transformRequest('virtual:dommief-demo/' + demoId);
  expect(demo?.code).toContain('demo-marker');
  expect(demo?.code).not.toContain('<button>');
});
