import React from 'react';
import { Link, useLocation } from 'react-router';

// Skip-link của GlobalLayout trỏ tới #main: trang 404 không đi qua Content nên phải tự có đích.
export function NotFound404() {
  const { pathname } = useLocation();
  return (
    <main id="main" tabIndex={-1}>
      <h1>404</h1>
      <p>{pathname}</p>
      <Link to="/">Home</Link>
    </main>
  );
}
