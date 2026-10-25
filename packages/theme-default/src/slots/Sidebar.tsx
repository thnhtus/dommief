import React from 'react';
import { Link } from 'react-router';
import { useSidebarData } from 'dommief/theme-api';

export function Sidebar() {
  const groups = useSidebarData();
  return (
    <aside>
      {groups.map((g, i) => (
        <div key={i}>
          {g.title ? <h3>{g.title}</h3> : null}
          <ul>
            {g.children.map((c) => (
              <li key={c.link}><Link to={c.link}>{c.title}</Link></li>
            ))}
          </ul>
        </div>
      ))}
    </aside>
  );
}
