import { describe, expect, it } from 'vitest';
import { transformMarkdown } from '../packages/core/src/markdown/index.ts';
import { buildSearchIndex } from '../packages/core/src/search.ts';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import MiniSearch from '/Users/thanhtu1/persona/dommief/node_modules/.pnpm/minisearch@7.2.0/node_modules/minisearch/dist/es/index.js';

describe('search index', () => {
  it('builds per locale and is queryable', async () => {
    const md = '# Hello\n\nTiếng Việt content here.\n';
    const meta = (await transformMarkdown(md, 'a.md')).meta;
    const routes: any[] = [{ id: 'a', path: '/a', file: 'a.md' }];
    const res: any = await buildSearchIndex({
      routes,
      loadPageMeta: async () => meta,
      config: { locales: [{ id: 'en-US', name: 'English', base: '/', suffix: '' }] },
    });
    expect(res.locales['en-US']).toBeTruthy();
    // reconstruct with config from module
    const { createMiniSearchConfig } = await import('../packages/core/src/search.ts');
    const cfg = createMiniSearchConfig();
    const ms2 = MiniSearch.loadJSON(JSON.stringify(res.locales['en-US']), { fields: ['value','pageTitle','sectionTitle'], storeFields: ['routeId','path','pageTitle','sectionTitle','paraId','value','pageKey','sectionKey'], ...cfg } as any);
    const hits = ms2.search('tieng');
    expect(hits.length).toBeGreaterThan(0);
  });
});
