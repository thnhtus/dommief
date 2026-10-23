import React from 'react';
import { createRoot } from 'react-dom/client';
import Content from '../docs/index.md';
createRoot(document.getElementById('root')!).render(<Content />);
