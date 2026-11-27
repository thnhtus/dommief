# Changelog

## 0.3.0

Library preset hoàn chỉnh (epic DM-920). Không breaking; chỉ thêm config tuỳ chọn, `preset: 'docs'` giữ nguyên hành vi.

- **`library` config** (DM-921): `library.demoDir` (default `'demo'`), `library.api` (`'off' | 'auto'`), `library.importName`. Khai `library.*` với `preset: 'docs'` → cảnh báo, bỏ qua. Thêm `scanComponents()`/`findComponentEntry()` để đọc manifest component.
- **Demo source thật** (DM-922): `<code src="./demo/basic.tsx" />` đọc source từ file (relative theo trang), thêm prop `title` render heading; file thiếu → cảnh báo `demo_src_missing`, không fail build.
- **Auto API** (DM-923): `library.api: 'auto'` tự chèn bảng props từ entry cho trang nằm trực tiếp trong thư mục component; trang doc thường bị bỏ qua im lặng; docgen lỗi cảnh báo một lần mỗi entry.
- **Alias package name** (DM-924): `library.importName` alias tên package → `src/index.ts` để demo `import { Button } from 'acme-ui'`; áp dụng ở config Vite và khi dev server resolve lại alias.
- **Fix**: "View code" của `<code src>` trước đây rỗng vì client không nhận source; giờ source đi kèm demo metadata.
- **Dogfood + E2E** (DM-925): `examples/library` (`acme-ui`) với 2 locale suffix mode, `e2e/library.spec.ts` chạy trên port 4320.
- **Docs** (DM-926): README (bảng config + mục Library preset), `docs/library-preset.md`, `docs/library-plan.md`, và `examples/library` làm ví dụ chạy được.

Giới hạn: không auto-route khi thiếu `.md`, không iframe/playground, không gom monorepo `packages/*/src`, nhãn nút demo chưa dịch, chưa có `<DemoCard>`.

Release ready — publish via `workflow_dispatch` on `publish.yml`.

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
