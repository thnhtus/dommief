# Kế hoạch Phase 10 — Library preset hoàn chỉnh

Tracking: GitHub issue [#108](https://github.com/thnhtus/dommief/issues/108) (epic) + [#109–#114](https://github.com/thnhtus/dommief/issues/109), milestone **v0.3.0**.

## Mục tiêu

Làm `preset: 'library'` đủ dùng để thay dumi cho component library, đồng thời giữ dommief là generator nhẹ, native Vite. Không thêm dependency mới; API library opt-in; `preset: 'docs'` không đổi output.

## Baseline đã kiểm tra (2026-11-27, master @ v0.2.0)

1. **Library preset mỏng:** `packages/core/src/config.ts:31` chỉ khai báo enum preset; `packages/core/src/routes.ts:41` chỉ tự thêm `src/` vào `docDirs`. Route từ markdown, chưa có component registry.
2. **Demo source lỗi:** `packages/core/src/markdown/rehype-demo.ts` lấy source từ children; `<code src="..." />` không có children nên `Demo.tsx` có nút "View code" nhưng khung code rỗng. Module loader đã resolve src và dev watch file (`packages/core/src/vite/plugin.ts:91-100,135`).
3. **API table thủ công:** `<API src="...">` hoạt động trong `packages/core/src/markdown/rehype-api.ts`; `react-docgen-typescript` đã là dependency, cache theo mtime. Không auto inject.
4. **Import demo không giống consumer:** alias chỉ cho theme (`packages/core/src/theme/resolver.ts:95`, `packages/core/src/vite/plugin.ts:69,77,184`); demo chưa import được tên package.
5. **Sidebar grouping đã có:** `packages/core/src/siteFeatures.ts:69` nhóm theo segment route; không cần tái tạo.
6. Có `examples/docs/src/button/{index.md,Button.tsx}` nhưng chưa có example chuyên để kiểm library workflow end-to-end.

## Thiết kế và phạm vi

### DM-921 — #109 — Config + component manifest (P0)

Thêm config `library: { demoDir: 'demo', importName?: string, api: 'off' | 'auto' }` và typed `ResolvedConfig`. Chỉ áp dụng với `preset: 'library'`; config library ở preset docs báo warning, không fail. Thêm scanner filesystem thuần cho component dirs (depth ≤ 2), tìm entry theo `index.tsx`, `index.ts`, `<dir>.tsx`, `<dir>.ts`, docs Markdown; bỏ file/dir ẩn, `_` và `node_modules`. Public type/function export từ core.

### DM-922 — #110 — Demo source file + title (P0)

Với `<code src="./demo/basic.tsx" title="Basic" />`, đọc source tại build/transform để khung "View code" có nội dung và render title. Children có giá trị vẫn thắng. File thiếu báo warning, không làm build fail. Cache nội dung theo path + mtime + size. Inline demo fence giữ nguyên.

### DM-923 — #111 — Auto API table (P1)

Với `library.api: 'auto'`, inject API table khi markdown nằm trong component dir có entry và chưa có `<API>`/`<DomApi>`/`<DumiApi>`. Không inject khi `api: 'off'` (default). Tên hiển thị fallback: docgen displayName → tên thư mục. Docgen lỗi không làm build fail, warning gộp.

### DM-924 — #112 — Package import alias (P1)

Trong library preset, map `library.importName` (hoặc `package.json#name`) tới `src/` để demo dùng import như consumer: `import { Button } from 'acme-ui'`. Cảnh báo và bỏ alias cho tên đụng `dommief`, `react`, `react-dom`, `react-router`, `vite`. User alias trong vite config phải được giữ precedence. Docs nêu rõ monorepo `packages/*/src` chưa hỗ trợ trong v0.3.

### DM-925 — #113 — Dogfood + E2E (P0)

Tạo `examples/library` độc lập, có button/card components, demo source + title, import qua package alias, auto API, cùng trang guide thường. Playwright project riêng (port riêng) xác nhận demo render/code, API `label`, sidebar grouping và guide. Không thêm example vào root build mặc định.

### DM-926 — #114 — Docs + release (P0)

README tiếng Anh + `docs/vi/README.md`, CHANGELOG, bump package `0.3.0`, full gate, publish qua workflow_dispatch, annotated tag `v0.3.0` + GitHub Release. Chỉ chạy publish sau khi owner duyệt.

## Thứ tự thực hiện

1. DM-921 — config/manifest.
2. DM-922 — demo file source/title (độc lập với API).
3. DM-923 và DM-924 — độc lập sau config; có thể làm song song.
4. DM-925 — tích hợp sau 921–924.
5. DM-926 — docs/release sau QA.

## Exit criteria

- `examples/library` production build và Playwright E2E pass.
- Test unit cho config/scan, missing source, `title`, auto API opt-in/manual override, alias conflict.
- `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build` xanh; không thêm lint warnings.
- `preset: 'docs'` không đổi output/hành vi.
- Publish `dommief@0.3.0`, annotated tag và GitHub Release sau khi được duyệt.

## Ngoài phạm vi

Auto-generate route cho component không có markdown; iframe/playground/sandbox; `<DemoCard>`; dịch nội dung demo; auto changelog; cấu trúc monorepo `packages/*/src`; i18n runtime nhãn nút demo ("View code"/"Copy").

## Rủi ro / giả định cần xác nhận khi triển khai

- Docgen options mặc định parse TSX/React 19 tốt hay không: kiểm bằng fixture, chỉnh trong DM-923 nếu cần.
- `library.demoDir` dùng làm convention + config/documentation; auto-discovery không được phụ thuộc vào demoDir nếu module resolution hiện tại đã nhận mọi `src` — xác minh trước khi dùng.
- Playwright `webServer` array và port mới: verify trên phiên bản cài trong repo; không mở port nếu port đó đang dùng.
- Component scanner là metadata hỗ trợ, không thay filesystem routing hiện có; mọi thay đổi route phải giữ output docs preset nguyên vẹn.
