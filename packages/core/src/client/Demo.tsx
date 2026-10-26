import React, { Component, useState } from 'react';
import { getDemo } from './DemoRegistry.js';

export interface DemoProps {
  id: string;
  source?: string;
  src?: string;
}

class DemoErrorBoundary extends Component<{ children: React.ReactNode; fallback: React.ReactNode }, { hasError: boolean }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

export function DomDemo({ id, source }: DemoProps) {
  const [showCode, setShowCode] = useState(false);
  const demo = getDemo(id);

  const codeFallback = source ? (
    <pre className="dommief-demo__code">
      <code>{source}</code>
    </pre>
  ) : null;

  return (
    <div className="dommief-demo" data-demo-id={id}>
      <div className="dommief-demo__preview">
        {demo ? (
          <DemoErrorBoundary fallback={codeFallback}>
            {React.createElement(demo)}
          </DemoErrorBoundary>
        ) : (
          codeFallback
        )}
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

/** @deprecated Use DomDemo */
export const DumiDemo = DomDemo;
