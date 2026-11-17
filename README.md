# dommief

Static site generator for documentation and demo sites, built on React, Vite, and Markdown. Aims to replace dumi for component libraries while staying a lightweight Vite-native docs/demo generator.

## Stack

- TypeScript, pnpm (Node >= 22)
- React 19, Vite 8, React Router 8
- unified/remark/rehype markdown pipeline, shiki, minisearch, zod

## Packages

- `packages/core` — core library, CLI, Vite plugins, markdown pipeline
- `packages/core/theme-default` — default theme (bundled in `dommief`)
- `examples/docs` — demo site

## Quick start

Install from npm (published as `dommief`):

```bash
npm install -D dommief
npx dommief dev      # dev server
npx dommief build    # production build + SSG
npx dommief preview  # preview
```

Or work from source:

```bash
pnpm install
pnpm -C packages/core build
npx dommief dev      # dev server
npx dommief build    # production build + SSG
npx dommief preview  # preview
```

Config file `dommief.config.ts`:

```ts
import { defineConfig } from 'dommief';
export default defineConfig({
  title: 'My Docs',
  base: '/',
  srcDir: 'docs',
  preset: 'docs', // 'docs' | 'library'
});
```

## Configuration

| Option | Default | Description |
|---|---|---|
| title | 'Dommief' | Site title |
| description | — | Meta description |
| base | '/' | Base URL path |
| outDir | 'dist' | Output directory |
| srcDir | 'docs' | Source docs directory |
| preset | 'docs' | 'docs' or 'library' (auto-scans src/) |
| docDirs | — | Extra doc directories |
| forceKebabCase | true | Force kebab-case routes |
| locales | [{id:'en-US',name:'English'}] | i18n (base or suffix mode, mutually exclusive) |
| theme | 'dommief-theme-default' | Theme package (default is bundled) |
| themeConfig | {} | Theme config |
| ssg.concurrency | 4 | Prerender concurrency |
| ssg.exclude | [] | Skip prerender, still shell |
| ssg.noEmit | [] | No file emitted |
| cache | true | Cache md transforms by hash |
| linkCheck | true | Dead link check at build |
| dev.port | 5173 | Dev server port |
| sitemap | false | false or {hostname, exclude} |
| robots | auto | Write robots.txt |
| markdown.shiki | github themes | Shiki themes or false |
| markdown.lineNumbers | false | Line numbers |
| search.enabled | true | Client search index |
| plugins | [] | Plugin array |

## CLI

- `dommief dev` — dev server + HMR
- `dommief build` — production build + prerender
- `dommief preview` — preview built site

Flags: `--base`, `--outDir`, `--no-cache`, `--no-link-check`, `--config <path>`.

## Features

- Filesystem routing
- Live demos via `<code src="./Button.tsx" />`
- API table via `<API src="./Foo.tsx"/>` (cached by file hash)
- Theme override via `.dommief/theme/**`
- i18n (base/suffix modes)
- Client-side search (minisearch)
- SSG with SSR safety guard
- Sitemap & robots.txt
- Link checking
- Content-hash build cache

## Đa ngôn ngữ (i18n)

`locales` chọn **base mode** hoặc **suffix mode** (không trộn):

```ts
// base mode — mỗi locale một prefix path
locales: [
  { id: 'en-US', name: 'English' },          // base '/', suffix ''
  { id: 'vi-VN', name: 'Tiếng Việt', base: '/vi-VN/' },
]

// suffix mode — mỗi locale không-default thêm hậu tố vào slug
locales: [
  { id: 'en-US', name: 'English', suffix: '' },
  { id: 'vi-VN', name: 'Tiếng Việt', suffix: '.vi-VN' },
]
```

Quy tắc file dịch: đặt `<tên>.<localeId>.md` cạnh file gốc (`getStarted.vi-VN.md` cạnh `getStarted.md`). File không có hậu tố là bản mặc định.

### hreflang & sitemap

Cần `sitemap.hostname` để build có thể viết `<link rel="alternate" hreflang="…">` và `x-default` (URL tuyệt đối):

```ts
sitemap: { hostname: 'https://docs.example.com' },
```

Sitemap sinh thêm `<xhtml:link rel="alternate" …>` cho mọi trang có nhiều bản dịch; trang chỉ có 1 ngôn ngữ giữ nguyên XML cũ.

### Translations of UI strings

Cấu hình theme `locales/<localeId>.json` (mảng nested objects không cần, key phẳng: `search.placeholder`, `search.count`, `locale.switch`, `skipToContent`, `colorSwitch.*`).

Ưu tiên: `dommief-theme-default/locales/*.json` < theme package đang dùng < `.dommief/theme/locales/<id>.json` (cục bộ, thắng mọi thứ). Thiếu key ở một locale thì rơi về `en-US`, không hiển thị key thô. `.dommief/theme/locales/vi-VN.json` chỉ cần đặt key muốn đổi.

### Language switcher

Navbar tự hiện link sang bản dịch của trang (nếu có), ngược lại link về trang chủ của locale đó; site 1 locale không render gì. Override bằng `.dommief/theme/slots/LangSwitch.tsx`.

### Parity giữa các ngôn ngữ

```ts
i18n: {
  requireParity: true,          // build throw code i18n_parity khi thiếu bản dịch
  allowSingleLocale: ['/reference/**'],  // key cố ý chỉ một locale (API ref…)
},
```

Mặc định chỉ cảnh báo (gom nhóm: `Missing translations for N keys`). Trang thiếu bản dịch → route đó không được tạo, không có nội dung fallback.

### Giới hạn v0.2

- Không tự redirect theo `Accept-Language`.
- Slug không dịch (chỉ nội dung).
- Không pluralization (chỉ `{n}`).
- Google Fonts: chỉ dùng subset nếu riêng theme chọn.

## Theme override

Create `.dommief/theme/slots/<Name>/index.tsx` or `.dommief/theme/layouts/<Name>.tsx` to override default theme components.

## Presets

- `docs` — standard docs site
- `library` — auto-scans `src/` for component demos

## Development

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
pnpm lint
```

## License

MIT
