import React, { useState } from 'react';

export function ColorSwitch() {
  const [dark, setDark] = useState(false);
  return (
    <button onClick={() => setDark((d) => !d)} aria-label="color-switch">
      {dark ? 'Light' : 'Dark'}
    </button>
  );
}
