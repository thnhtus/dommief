# Changelog

## 0.2.0

i18n end-to-end (epic DM-900). No breaking changes; new optional config only.

- **Route alternates** (DM-910): every route knows its translations (`route.alternates`), available in `virtual:dommief/site`.
- **hreflang** (DM-911): `<link rel="alternate" hreflang>` + `x-default` in `<head>` when `sitemap.hostname` is set.
- **Sitemap alternates** (DM-912): `<xhtml:link>` per URL; single-locale output unchanged byte-for-byte.
- **Theme UI strings** (DM-913): `useT()` / `useLocale()` in `dommief/theme-api`; theme `locales/*.json`, override via `.dommief/theme/locales/<id>.json`, missing keys fall back to `en-US`. Default strings are now English for `en-US`.
- **Language switcher** (DM-914): `LangSwitch` slot in Navbar (multi-locale sites only).
- **Locale-aware links** (DM-915): `[x](./other.md)` in a translated page points to the same-locale translation when it exists.
- **Parity check** (DM-916): grouped missing-translation warning; `i18n.requireParity` fails the build (`i18n_parity`), `i18n.allowSingleLocale` exempts patterns.
- **Fix**: build-time search index is now split per locale (previously everything went to the first locale).
- E2E coverage for i18n (DM-917); docs in README and `examples/docs/docs/guide/i18n.md` (DM-918).

Limits: no `Accept-Language` redirect, no slug translation, no pluralization.

Release ready — publish via `workflow_dispatch` on `publish.yml`.
