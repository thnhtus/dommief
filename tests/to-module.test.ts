import { describe, expect, it } from 'vitest';
import { toModule } from '../packages/core/src/markdown/to-module.ts';
import type { Root as HastRoot } from 'hast';

describe('toModule (DM-922)', () => {
  it('generates React module code with registered demos and DomDemo elements', () => {
    const hast: HastRoot = {
      type: 'root',
      children: [
        {
          type: 'element',
          tagName: 'DomDemo',
          properties: { id: 'd1', src: './demo.tsx', source: 'const x = 1;', title: 'Basic Demo' },
          children: [],
        },
      ],
    };
    const meta = { frontmatter: { title: 'Doc' }, toc: [] };
    const demos = [
      { id: 'd1', src: './demo.tsx', source: 'const x = 1;', title: 'Basic Demo' },
    ];
    const code = toModule(hast, meta, [], demos);

    expect(code).toContain('import Demo_d1 from "./demo.tsx";');
    expect(code).toContain('registerDemo("d1", Demo_d1);');
    expect(code).toContain('title="Basic Demo"');
    expect(code).toContain('source="const x = 1;"');
    expect(code).toContain('export const meta = {"frontmatter":{"title":"Doc"},"toc":[]};');
  });

  it('preserves virtual specifier when demo has no src', () => {
    const hast: HastRoot = {
      type: 'root',
      children: [
        {
          type: 'element',
          tagName: 'DomDemo',
          properties: { id: 'd2', source: 'const y = 2;' },
          children: [],
        },
      ],
    };
    const meta = { frontmatter: {}, toc: [] };
    const demos = [{ id: 'd2', source: 'const y = 2;' }];
    const code = toModule(hast, meta, [], demos);

    expect(code).toContain('import Demo_d2 from "virtual:dommief-demo/d2";');
    expect(code).toContain('registerDemo("d2", Demo_d2);');
  });
});
