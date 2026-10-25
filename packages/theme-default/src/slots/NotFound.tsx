import React from 'react';
import { Link, useLocation } from 'react-router';

export function NotFound404() {
  const { pathname } = useLocation();
  return (
    <main>
      <h1>404</h1>
      <p>{pathname}</p>
      <Link to="/">Home</Link>
    </main>
  );
}
