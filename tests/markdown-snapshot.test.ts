import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { transformMarkdown } from '../packages/core/src/markdown/index.ts';

describe('markdown fixtures', () => {
  const dir = join(process.cwd(), 'tests/fixtures/md');
  const files = readdirSync(dir).filter(f => f.endsWith('.md'));
  for (const f of files) {
    it(`transforms ${f}`, async () => {
      const src = readFileSync(join(dir, f), 'utf8');
      const { code, meta } = await transformMarkdown(src, f);
      expect(code).toMatchSnapshot();
      expect(meta).toBeTruthy();
    });
  }
});
