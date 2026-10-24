import React from 'react';
import { Link } from 'react-router';
import { useNavData } from 'dommief/theme-api';

export function Navbar() {
  const nav = useNavData();
  return (
    <nav>
      {nav.map((item) => (
        <Link key={item.activePath} to={item.link ?? item.activePath}>{item.title}</Link>
      ))}
    </nav>
  );
}
