import { Link, useLocation } from 'react-router';

/** Trang 404 tối thiểu (không theme): `404` + path hiện tại + link về `/`. */
export function NotFound() {
  const { pathname } = useLocation();
  return (
    <main>
      <h1>404</h1>
      <p>{pathname}</p>
      <Link to="/">Về trang chủ</Link>
    </main>
  );
}
