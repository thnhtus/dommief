/**
 * Chuẩn hoá đường dẫn về dạng POSIX (CONTRACTS §1): mọi `\` thành `/`.
 * Giữ nguyên UNC path của Windows (`\\?\C:\...`) vì đổi sẽ làm path không dùng được.
 */
export function winPath(p: string): string {
  if (/^\\\\\?\\/.test(p)) return p;
  return p.replace(/\\/g, '/');
}
