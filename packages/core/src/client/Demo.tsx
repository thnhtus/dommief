import React, { useState, type ReactNode } from 'react';

export interface DemoProps {
  id?: string;
  source?: string;
  src?: string;
}

export function DumiDemo({ id, source }: DemoProps) {
  const [showCode, setShowCode] = useState(false);
  return (
    <div className="dommief-demo" data-demo-id={id}>
      <div className="dommief-demo__preview">
        {source ? <pre><code>{source}</code></pre> : null}
      </div>
      <div className="dommief-demo__toolbar">
        <button type="button" onClick={() => setShowCode((v) => !v)}>
          {showCode ? 'Hide code' : 'View code'}
        </button>
        <button
          type="button"
          onClick={() => {
            if (source && typeof navigator !== 'undefined' && navigator.clipboard) {
              navigator.clipboard.writeText(source);
            }
          }}
        >
          Copy
        </button>
      </div>
      {showCode && source ? (
        <pre className="dommief-demo__code">
          <code>{source}</code>
        </pre>
      ) : null}
    </div>
  );
}

export function Previewer({ children }: { children?: ReactNode }) {
  return <div className="dommief-previewer">{children}</div>;
}

export function DemoLayout({ children }: { children?: ReactNode }) {
  return <div className="dommief-demo-layout">{children}</div>;
}
