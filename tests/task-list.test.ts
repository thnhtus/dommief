import { describe, it, expect } from 'vitest';
import { transformMarkdown } from '../packages/core/src/markdown/index.js';

// DM-807: GFM task-list checkboxes must be wrapped in <label> (axe `label`, WCAG 4.1.2).
describe('task-list checkbox labeling', () => {
  it('wraps tight and loose task items in <label>', async () => {
    const src = '- [ ] tight one\n- [x] tight two\n\n- [ ] loose one\n\n  detail\n';
    const { code } = await transformMarkdown(src, 'x.md');
    expect(code).toContain('label');
    expect(code).not.toMatch(/<input[^>]*checkbox[^>]*>\s*(?![^<]*<\/label>)/);
  });
  it('leaves nested list outside the label', async () => {
    const src = '- [ ] parent\n  - child\n';
    const { code } = await transformMarkdown(src, 'x.md');
    expect(code).toContain('"task-list-label"');
  });
});
