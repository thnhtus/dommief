import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { scanComponents, findComponentEntry } from '../packages/core/src/library.ts';

describe('scanComponents (DM-921)', () => {
  it('quét đúng 3 layout: chỉ index.tsx, Named.tsx + md, chỉ md; nested depth 2; skip node_modules', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dommief-scan-test-'));
    const src = path.join(tmp, 'src');

    // Layout 1: chỉ index.tsx
    fs.mkdirSync(path.join(src, 'button'), { recursive: true });
    fs.writeFileSync(path.join(src, 'button', 'index.tsx'), 'export const Button = () => null;');

    // Layout 2: Named.tsx + md
    fs.mkdirSync(path.join(src, 'card'), { recursive: true });
    fs.writeFileSync(path.join(src, 'card', 'Card.tsx'), 'export const Card = () => null;');
    fs.writeFileSync(path.join(src, 'card', 'index.md'), '# Card');
    fs.writeFileSync(path.join(src, 'card', 'extra.md'), '# Card Extra');

    // Layout 3: chỉ md
    fs.mkdirSync(path.join(src, 'guide'), { recursive: true });
    fs.writeFileSync(path.join(src, 'guide', 'index.md'), '# Guide');

    // Nested depth 2: form/input/Input.tsx + index.md
    fs.mkdirSync(path.join(src, 'form', 'input'), { recursive: true });
    fs.writeFileSync(path.join(src, 'form', 'input', 'Input.tsx'), 'export const Input = () => null;');
    fs.writeFileSync(path.join(src, 'form', 'input', 'index.md'), '# Input');

    // Nested depth 3: form/input/deep/Deep.tsx (không quét ở depth 3)
    fs.mkdirSync(path.join(src, 'form', 'input', 'deep'), { recursive: true });
    fs.writeFileSync(path.join(src, 'form', 'input', 'deep', 'Deep.tsx'), 'export const Deep = () => null;');

    // Skipped: node_modules, .hidden, _private
    fs.mkdirSync(path.join(src, 'node_modules', 'pkg'), { recursive: true });
    fs.writeFileSync(path.join(src, 'node_modules', 'pkg', 'index.tsx'), '');
    fs.mkdirSync(path.join(src, '.hidden'), { recursive: true });
    fs.writeFileSync(path.join(src, '.hidden', 'index.tsx'), '');
    fs.mkdirSync(path.join(src, '_private'), { recursive: true });
    fs.writeFileSync(path.join(src, '_private', 'index.tsx'), '');

    const components = scanComponents({ root: tmp, config: { srcDir: 'src' } });

    // Không chứa node_modules, .hidden, _private, hay depth 3
    const names = components.map((c) => c.name);
    expect(names).not.toContain('node_modules');
    expect(names).not.toContain('pkg');
    expect(names).not.toContain('.hidden');
    expect(names).not.toContain('_private');
    expect(names).not.toContain('deep');

    // Layout 1
    const button = components.find((c) => c.name === 'button')!;
    expect(button).toBeDefined();
    expect(button.entry).toMatch(/button\/index\.tsx$/);
    expect(button.docs).toEqual([]);

    // Layout 2
    const card = components.find((c) => c.name === 'card')!;
    expect(card).toBeDefined();
    expect(card.entry).toMatch(/card\/Card\.tsx$/);
    expect(card.docs).toHaveLength(2);
    expect(card.docs[0]).toMatch(/card\/extra\.md$/);
    expect(card.docs[1]).toMatch(/card\/index\.md$/);

    // Layout 3
    const guide = components.find((c) => c.name === 'guide')!;
    expect(guide).toBeDefined();
    expect(guide.entry).toBeNull();
    expect(guide.docs).toHaveLength(1);
    expect(guide.docs[0]).toMatch(/guide\/index\.md$/);

    // Nested depth 2
    const input = components.find((c) => c.name === 'input')!;
    expect(input).toBeDefined();
    expect(input.entry).toMatch(/form\/input\/Input\.tsx$/);
    expect(input.docs).toHaveLength(1);

    // Sort ổn định và xác định
    const sortedNames = [...components.map((c) => c.name)].sort();
    expect(components.map((c) => c.name)).toEqual(expect.arrayContaining(sortedNames));
  });

  it('trả về mảng rỗng khi src không tồn tại', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dommief-scan-empty-'));
    expect(scanComponents({ root: tmp, config: { srcDir: 'src' } })).toEqual([]);
  });
});

describe('findComponentEntry (DM-923)', () => {
  it('ưu tiên index.tsx > index.ts > <dir>.tsx > <dir>.ts', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dommief-entry-test-'));
    const dir = path.join(tmp, 'entry-test');
    fs.mkdirSync(dir);

    // Chỉ <dir>.ts
    fs.writeFileSync(path.join(dir, 'entry-test.ts'), '');
    expect(findComponentEntry(dir)).toMatch(/entry-test\.ts$/);

    // Thêm <dir>.tsx (thắng .ts)
    fs.writeFileSync(path.join(dir, 'entry-test.tsx'), '');
    expect(findComponentEntry(dir)).toMatch(/entry-test\.tsx$/);

    // Thêm index.ts (thắng <dir>.tsx)
    fs.writeFileSync(path.join(dir, 'index.ts'), '');
    expect(findComponentEntry(dir)).toMatch(/index\.ts$/);

    // Thêm index.tsx (thắng index.ts)
    fs.writeFileSync(path.join(dir, 'index.tsx'), '');
    expect(findComponentEntry(dir)).toMatch(/index\.tsx$/);
  });

  it('khớp tên dir không phân biệt hoa/thường', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dommief-entry-case-'));
    const compDir = path.join(tmp, 'my-button');
    fs.mkdirSync(compDir);
    fs.writeFileSync(path.join(compDir, 'My-Button.tsx'), '');
    expect(findComponentEntry(compDir)).toMatch(/My-Button\.tsx$/);
  });

  it('trả về null khi thư mục không có entry hoặc không tồn tại', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dommief-entry-null-'));
    expect(findComponentEntry(tmp)).toBeNull();
    expect(findComponentEntry(path.join(tmp, 'nonexistent'))).toBeNull();
  });
});
