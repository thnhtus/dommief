import React from 'react';
import { Button } from 'acme-ui';

export default function SizeDemo() {
  return (
    <div id="lib-btn-size" style={{ display: 'flex', gap: 8 }}>
      <Button label="Small" size="sm" />
      <Button label="Medium" size="md" />
      <Button label="Large" size="lg" />
    </div>
  );
}