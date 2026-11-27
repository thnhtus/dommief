import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { transformMarkdown } from '../packages/core/src/markdown/index.ts';
import { DomDemo } from '../packages/core/src/client/Demo.tsx';

describe('demo-src (DM-922)', () => {
  const dirs: string[] = [];
  const tmpDir = () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'dommief-demo-'));
    dirs.push(d);
    return d;
  };

  afterEach(() => {
    for (const d of dirs.splice(0)) {
      fs.rmSync(d, { recursive: true, force: true });
    }
  });

  it('reads demo source from file and propagates title when children empty', async () => {
    const dir = tmpDir();
    const demoPath = path.join(dir, 'basic.tsx');
    const demoContent = 'export default function Basic() { return <div>Basic</div>; }';
    fs.writeFileSync(demoPath, demoContent, 'utf8');

    const mdPath = path.join(dir, 'index.md');
    const md = '<code src="./basic.tsx" title="Basic" />';

    const { code, warnings, demos } = await transformMarkdown(md, mdPath);
    expect(warnings).toHaveLength(0);
    expect(demos).toHaveLength(1);
    expect(demos[0].src).toBe('./basic.tsx');
    expect(demos[0].title).toBe('Basic');
    expect(demos[0].source).toBe(demoContent);

    expect(code).toContain('title="Basic"');
    expect(code).toContain('source="');
    expect(code).toContain(demoContent);
    expect(code).toContain('import Demo_');
    expect(code).toContain('registerDemo(');
  });

  it('prioritizes non-empty children over file content (children win)', async () => {
    const dir = tmpDir();
    const demoPath = path.join(dir, 'basic.tsx');
    fs.writeFileSync(demoPath, 'console.log("file content");', 'utf8');

    const mdPath = path.join(dir, 'index.md');
    const md = '<code src="./basic.tsx" title="Custom">console.log("custom children");</code>';

    const { warnings, demos } = await transformMarkdown(md, mdPath);
    expect(warnings).toHaveLength(0);
    expect(demos).toHaveLength(1);
    expect(demos[0].source).toBe('console.log("custom children");');
    expect(demos[0].title).toBe('Custom');
  });

  it('emits demo_src_missing warning when file is missing, keeps source empty and does not fail', async () => {
    const dir = tmpDir();
    const mdPath = path.join(dir, 'index.md');
    const md = '<code src="./missing.tsx" title="Missing" />';

    const { warnings, demos, code } = await transformMarkdown(md, mdPath);
    expect(demos).toHaveLength(1);
    expect(demos[0].source).toBe('');
    expect(demos[0].title).toBe('Missing');
    expect(warnings.some((w) => w.includes('demo_src_missing: "./missing.tsx"') && w.includes(mdPath))).toBe(true);
    expect(code).toContain('title="Missing"');
  });

  it('caches file reads by absPath + mtimeMs + size', async () => {
    const dir = tmpDir();
    const demoPath = path.join(dir, 'basic.tsx');
    fs.writeFileSync(demoPath, 'const initial = 1;', 'utf8');

    const mdPath = path.join(dir, 'index.md');
    const md = '<code src="./basic.tsx" />';

    const r1 = await transformMarkdown(md, mdPath);
    expect(r1.demos[0].source).toBe('const initial = 1;');

    // Cùng mtime & size -> hit cache
    const r2 = await transformMarkdown(md, mdPath);
    expect(r2.demos[0].source).toBe('const initial = 1;');

    // Thay đổi nội dung file -> mtime hoặc size đổi -> đọc nội dung mới
    fs.writeFileSync(demoPath, 'const modified = 222222;', 'utf8');
    const r3 = await transformMarkdown(md, mdPath);
    expect(r3.demos[0].source).toBe('const modified = 222222;');
  });

  it('leaves inline ```tsx demo fences unchanged', async () => {
    const dir = tmpDir();
    const mdPath = path.join(dir, 'index.md');
    const md = '```tsx demo\nexport default () => <div>Fence Demo</div>;\n```';

    const { code, warnings, demos } = await transformMarkdown(md, mdPath);
    expect(warnings).toHaveLength(0);
    expect(demos).toHaveLength(1);
    expect(demos[0].source).toBe('export default () => <div>Fence Demo</div>;');
    expect(demos[0].src).toBeUndefined();
    expect(demos[0].title).toBeUndefined();
    expect(code).toContain('virtual:dommief-demo/');
  });

  describe('DomDemo component rendering', () => {
    it('renders <h4 className="dommief-demo__title"> when title prop is provided', () => {
      const html = renderToStaticMarkup(
        React.createElement(DomDemo, { id: 'd1', title: 'Example Demo', source: "console.log('test');" })
      );
      expect(html).toContain('<h4 class="dommief-demo__title">Example Demo</h4>');
      expect(html).toContain('View code');
      expect(html).toContain('Copy');
    });

    it('does not render title element when title prop is omitted', () => {
      const html = renderToStaticMarkup(
        React.createElement(DomDemo, { id: 'd2', source: "console.log('no title');" })
      );
      expect(html).not.toContain('dommief-demo__title');
    });
  });
});
