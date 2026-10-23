import { describe, expect, it } from 'vitest';
import { transformMarkdown } from '../packages/core/src/markdown/index.ts';

describe('transformMarkdown', () => {
  it('renders frontmatter + gfm table + code block', async () => {
    const src = `---
title: Hello
---
# Hello

| a | b |
|---|---|
| 1 | 2 |

\`\`\`js
const x = 1;
\`\`\`
`;
    const { code, meta } = await transformMarkdown(src, 'test.md');
    expect(meta.frontmatter.title).toBe('Hello');
    expect(meta.toc.length).toBeGreaterThan(0);
    expect(code).toContain('export default');
    expect(code).toContain('table');
  });
});
