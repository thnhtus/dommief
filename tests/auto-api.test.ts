import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock docgen: auto-API chỉ cần biết `buildApiTable` trả gì, không cần parse TS thật.
const { buildApiTable } = vi.hoisted(() => ({ buildApiTable: vi.fn() }));
vi.mock('../packages/core/src/markdown/rehype-api.js', () => ({
  buildApiTable,
  rehypeApi: () => () => {},
  clearApiCache: () => {},
  hashFileContent: (s: string) => s,
  resolveApiSrc: (s: string) => s,
}));

const { transformMarkdown } = await import('../packages/core/src/markdown/index.ts');

const LIBRARY = {
  preset: 'library' as const,
  library: { demoDir: 'demo', api: 'auto' as const },
};

function tmpComponent(): { dir: string; md: string } {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dommief-auto-api-'));
  const dir = path.join(tmp, 'Button');
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'Button.tsx'), 'export const Button = () => null;');
  return { dir, md: path.join(dir, 'index.md') };
}

describe('auto API injection (DM-923)', () => {
  beforeEach(() => {
    buildApiTable.mockReset();
  });

  it('inject <DomApi> khi preset library + api auto + md nằm trong component dir', async () => {
    const { dir, md } = tmpComponent();
    buildApiTable.mockReturnValue([{ displayName: 'Button', props: [], src: '', hash: 'h' }]);

    const { code, apiSrcFiles, meta, warnings } = await transformMarkdown('# Button\n\nNội dung.', md, {
      config: LIBRARY,
    });

    expect(buildApiTable).toHaveBeenCalledTimes(1);
    expect(code).toContain('DomApi');
    expect(apiSrcFiles).toEqual([path.join(dir, 'Button.tsx')]);
    expect(meta.frontmatter.title).toBe('Button');
    expect(warnings).toEqual([]);
  });

  it('không inject khi api off (default)', async () => {
    const { md } = tmpComponent();
    const { code, apiSrcFiles } = await transformMarkdown('# Button', md, {
      config: { preset: 'library', library: { demoDir: 'demo', api: 'off' } },
    });

    expect(buildApiTable).not.toHaveBeenCalled();
    expect(code).not.toContain('DomApi');
    expect(apiSrcFiles).toEqual([]);
  });

  it('không inject khi đã có <API src> thủ công', async () => {
    const { md } = tmpComponent();
    const source = '# Button\n\n<API src="./Button.tsx" />';

    await transformMarkdown(source, md, { config: LIBRARY });

    // Có <API> thủ công → không auto-inject, không gọi docgen lần hai.
    expect(buildApiTable).not.toHaveBeenCalled();
  });

  it('không inject khi md không nằm trong component dir', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dommief-auto-api-standalone-'));
    const md = path.join(dir, 'guide', 'index.md');
    fs.mkdirSync(path.dirname(md), { recursive: true });
    fs.writeFileSync(md, '# Guide');
    const { code, apiSrcFiles, warnings } = await transformMarkdown('# Guide', md, {
      config: { preset: 'library', library: { demoDir: 'demo', api: 'auto' } },
    });

    expect(buildApiTable).not.toHaveBeenCalled();
    expect(code).not.toContain('DomApi');
    expect(apiSrcFiles).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it('docgen fail → warning gộp, title fallback tên thư mục, build không fail', async () => {
    const { dir, md } = tmpComponent();
    buildApiTable.mockReturnValue(null);

    const first = await transformMarkdown('# Button', md, { config: LIBRARY });
    const second = await transformMarkdown('# Button', md, { config: LIBRARY });

    expect(first.warnings.length).toBe(1);
    expect(first.warnings[0]).toMatch(/Button\.tsx/);
    // Warning gộp: transform thứ hai không lặp lại cùng entry.
    expect(second.warnings).toEqual([]);
    expect(first.meta.frontmatter.title).toBe(path.basename(dir));
    expect(first.code).toContain('DomApi');
  });
});
