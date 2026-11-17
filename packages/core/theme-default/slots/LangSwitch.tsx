import React from 'react';
import { useLocation } from 'react-router';
import { useSiteData, useLocale, useT } from 'dommief/theme-api';
import styles from '../styles/layout.module.css';

// DM-914: link thật (không cần JS), không auto-redirect. Href = `alternates[locale]` nếu
// trang hiện tại có bản dịch; ngược lại về trang chủ của locale đó (`base` hoặc `/${suffix}`).
export function LangSwitch() {
  const site = useSiteData();
  const { pathname } = useLocation();
  const current = useLocale();
  const t = useT();
  const locales = site.locales ?? [];
  if (locales.length < 2) return null;

  const home = (localeId: string): string => {
    const l = locales.find((x) => x.id === localeId);
    if (!l) return '/';
    return l.suffix ? `/${l.suffix}` : l.base;
  };
  const route = Object.values(site.routes ?? {}).find((r) => r.path === pathname);
  const alts = route?.alternates ?? {};
  const paths = new Set(Object.values(site.routes ?? {}).map((r) => r.path));

  return (
    <nav aria-label={t('locale.switch')} className={styles.langSwitch!}>
      {locales.map((l) => {
        const href = alts[l.id] ?? home(l.id);
        // Trang chủ locale chưa tồn tại → không render link chết (bất biến "không 404").
        if (!alts[l.id] && !paths.has(href)) return null;
        return (
          <a
            key={l.id}
            href={href}
            hrefLang={l.id}
            lang={l.id}
            aria-current={l.id === current ? 'true' : undefined}
            className={l.id === current ? styles.langSwitch__active! : undefined}
          >
            {l.name}
          </a>
        );
      })}
    </nav>
  );
}
export default LangSwitch;
