import { describe, expect, it } from 'vitest';
import { matchExclude } from '../packages/core/src/exclude.ts';

// Đặc tả: docs/backlog/DM-411.md "Tiêu chí chấp nhận" #1(a).
describe('matchExclude (DM-411)', () => {
  it("matchExclude('/~demos/foo', ['/~demos/*']) === true", () => {
    expect(matchExclude('/~demos/foo', ['/~demos/*'])).toBe(true);
  });
  it("matchExclude('/guide/intro', ['/~demos/*']) === false", () => {
    expect(matchExclude('/guide/intro', ['/~demos/*'])).toBe(false);
  });
  it("matchExclude('/a/b', ['**/b']) === true", () => {
    expect(matchExclude('/a/b', ['**/b'])).toBe(true);
  });
  it('pattern rỗng -> không khớp gì', () => {
    expect(matchExclude('/anything', [])).toBe(false);
  });
});

describe('globToRegExp edge cases', () => {
  it('* không vượt qua "/"; ** thì có; ký tự regex được escape', () => {
    expect(matchExclude('/~demos/a/b', ['/~demos/*'])).toBe(false);
    expect(matchExclude('/~demos/a/b', ['/~demos/**'])).toBe(true);
    expect(matchExclude('/b', ['**/b'])).toBe(true);
    expect(matchExclude('/axb', ['/a.b'])).toBe(false);
    expect(matchExclude('/draft-foo', ['/draft-*'])).toBe(true);
  });
});
