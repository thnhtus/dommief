import React from 'react';

// THEME-API §6: `<main id="main" tabindex="-1">` là đích của skip-link trong DocLayout.
export function Content({ children }: { children?: React.ReactNode }) {
  return (
    <main id="main" tabIndex={-1}>
      {children}
    </main>
  );
}
