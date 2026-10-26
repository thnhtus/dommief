import React, { useSyncExternalStore } from 'react';
import { Link, useLocation } from 'react-router';

const subscribeNever = () => () => {};

// Skip-link của GlobalLayout trỏ tới #main: trang 404 không đi qua Content nên phải tự có đích.
export default function NotFound404() {
  const { pathname } = useLocation();
  // 404.html được prerender MỘT lần cho path `/404`, nhưng host phục vụ nó ở BẤT KỲ URL lạ nào →
  // lần render đầu (hydrate) phải khớp HTML tĩnh. `getServerSnapshot` (false) dùng cho cả SSR lẫn hydrate,
  // sau đó React chuyển sang snapshot client (true) và path thật mới hiện (nếu không: React #418, bắt bằng
  // e2e trình duyệt thật). Không dùng `typeof window` — ssr-guard cấm đọc `window` lúc render.
  const mounted = useSyncExternalStore(subscribeNever, () => true, () => false);
  return (
    <main id="main" tabIndex={-1}>
      <h1>404</h1>
      <p>{mounted ? pathname : '/404'}</p>
      <Link to="/">Home</Link>
    </main>
  );
}
