import React from 'react';
import { Navbar } from '../Navbar.js';
import { Footer } from '../Footer.js';

export function GlobalLayout({ children }: { children?: React.ReactNode }) {
  return (
    <div>
      <Navbar />
      {children}
      <Footer />
    </div>
  );
}
