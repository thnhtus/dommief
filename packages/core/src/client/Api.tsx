import React, { useState } from 'react';

export interface ApiProp {
  name: string;
  type?: string;
  required?: boolean;
  description?: string;
  defaultValue?: any;
}

export interface ApiEntry {
  displayName: string;
  description?: string;
  props: ApiProp[];
  src?: string;
  hash?: string;
}

export interface ApiProps {
  src?: string;
  data?: string | ApiEntry[];
}

export function DumiApi({ src, data }: ApiProps) {
  let entries: ApiEntry[] = [];
  try {
    if (Array.isArray(data)) entries = data;
    else if (typeof data === 'string' && data) entries = JSON.parse(data);
  } catch {
    entries = [];
  }

  if (!entries || entries.length === 0) {
    return <div className="dommief-api" data-src={src}>No API data</div>;
  }

  return (
    <div className="dommief-api" data-src={src}>
      {entries.map((entry, i) => (
        <div key={i} className="dommief-api__component">
          <h3 className="dommief-api__name">{entry.displayName}</h3>
          {entry.description ? <p className="dommief-api__desc">{entry.description}</p> : null}
          <table className="dommief-api__table">
            <thead>
              <tr>
                <th>Property</th>
                <th>Type</th>
                <th>Required</th>
                <th>Description</th>
                <th>Default</th>
              </tr>
            </thead>
            <tbody>
              {(entry.props || []).map((p, j) => (
                <tr key={j}>
                  <td>{p.name}</td>
                  <td><code>{p.type}</code></td>
                  <td>{p.required ? 'yes' : 'no'}</td>
                  <td>{p.description}</td>
                  <td>{p.defaultValue != null ? String(p.defaultValue) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
