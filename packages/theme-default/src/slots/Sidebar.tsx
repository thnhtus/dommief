import React from 'react';
import { Link, useLocation } from 'react-router';
import { useSidebarData } from 'dommief/theme-api';
import styles from '../styles/layout.module.css';

// THEME-API §6: `<nav aria-label>` riêng bên trong `<aside>` (aside trần không phải landmark điều hướng);
// item active có `aria-current="page"`.
export function Sidebar() {
  const groups = useSidebarData();
  const { pathname } = useLocation();
  return (
    <aside className={styles.sidebar!}>
      <nav aria-label="Sidebar">
        {groups.map((g, i) => (
          <div key={i}>
            {g.title ? <h3>{g.title}</h3> : null}
            <ul>
              {g.children.map((c) => (
                <li key={c.link}>
                  <Link to={c.link} aria-current={pathname === c.link ? 'page' : undefined}>{c.title}</Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
export default Sidebar;
