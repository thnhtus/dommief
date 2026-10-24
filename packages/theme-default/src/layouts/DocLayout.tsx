import React from 'react';
import { Sidebar } from '../Sidebar.js';
import { Toc } from '../Toc.js';
import { Content } from '../Content.js';

export function DocLayout({ children }: { children?: React.ReactNode }) {
  return (
    <div>
      <Sidebar />
      <Content>{children}</Content>
      <Toc />
    </div>
  );
}
