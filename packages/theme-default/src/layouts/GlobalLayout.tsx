import React from 'react';
import { Navbar } from '../slots/Navbar.js';
import { Footer } from '../slots/Footer.js';

export function GlobalLayout({ children }: { children?: React.ReactNode }) {
  return (
    <div>
      <Navbar />
      {children}
      <Footer />
    </div>
  );
}
