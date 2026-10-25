// Đặc tả: docs/backlog/DM-411.md. Khớp pattern trên ROUTE PATH (vd `/~demos/foo`), không phải
// đường dẫn file trên đĩa. Chỉ cần `*` (một segment) và `**` (nhiều segment) nên tự chuyển glob
// sang RegExp thay vì thêm dependency.

const cache = new Map<string, RegExp>();

/** `/~demos/*` -> /^\/~demos\/[^/]*$/ ; `**\/b` -> /^(?:.*\/)?b$/ */
export function globToRegExp(pattern: string): RegExp {
  let src = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern.charAt(i);
    if (c === '*' && pattern.charAt(i + 1) === '*') {
      const slash = pattern.charAt(i + 2) === '/';
      src += slash ? '(?:.*/)?' : '.*';
      i += slash ? 2 : 1;
    } else if (c === '*') {
      src += '[^/]*';
    } else if (c === '?') {
      src += '[^/]';
    } else {
      src += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${src}$`);
}

function matcher(pattern: string): RegExp {
  const hit = cache.get(pattern);
  if (hit) return hit;
  const re = globToRegExp(pattern);
  cache.set(pattern, re);
  return re;
}

/** `matchExclude('/~demos/foo', ['/~demos/*']) === true`. Pattern rỗng -> không khớp gì. */
export function matchExclude(path: string, patterns: string[]): boolean {
  return patterns.some((p) => matcher(p).test(path));
}
