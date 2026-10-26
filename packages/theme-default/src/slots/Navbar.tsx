import React from 'react';
import { Link, useLocation } from 'react-router';
import { useNavData, useSiteData } from 'dommief/theme-api';
import ColorSwitch from 'dommief/theme/slots/ColorSwitch';
import SearchBox from 'dommief/theme/slots/SearchBox';
import styles from '../styles/layout.module.css';

// THEME-API §5 bảng slot: ColorSwitch render trong Navbar khi `themeConfig.prefersColor.switch
// !== false` (mặc định true). §6: landmark `<nav aria-label>` riêng (không trùng Sidebar/Toc);
// item active có `aria-current="page"`.
export function Navbar() {
  const nav = useNavData();
  const { pathname } = useLocation();
  const site = useSiteData();
  const themeConfig = site.themeConfig as { prefersColor?: { switch?: boolean } } | undefined;
  const showColorSwitch = themeConfig?.prefersColor?.switch !== false;
  return (
    <nav aria-label="Main" className={styles.navbar!}>
      {nav.map((item) => {
        const to = item.link ?? item.activePath;
        const active = pathname === to;
        return (
          <Link key={item.activePath} to={to} aria-current={active ? 'page' : undefined}>
            {item.title}
          </Link>
        );
      })}
      <SearchBox />
      {showColorSwitch ? <ColorSwitch /> : null}
    </nav>
  );
}
export default Navbar;
