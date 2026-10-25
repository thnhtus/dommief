import React from 'react';

const registry = new Map<string, React.ComponentType<any>>();

export function registerDemo(id: string, component: React.ComponentType<any>) {
  registry.set(id, component);
}

export function getDemo(id: string): React.ComponentType<any> | undefined {
  return registry.get(id);
}