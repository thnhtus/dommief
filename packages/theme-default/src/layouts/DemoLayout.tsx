import React from 'react';
import { Content } from '../Content.js';

export function DemoLayout({ children }: { children?: React.ReactNode }) {
  return <Content>{children}</Content>;
}
