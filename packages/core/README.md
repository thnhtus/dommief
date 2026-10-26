# dommief

Static site generator for documentation and demo sites, built on React, Vite, and Markdown. Aims to replace dumi for component libraries while staying a lightweight Vite-native docs/demo generator.

## Stack

- TypeScript, pnpm (Node >= 22)
- React 19, Vite 8, React Router 8
- unified/remark/rehype markdown pipeline, shiki, minisearch, zod

## Packages

- `packages/core` — core library, CLI, Vite plugins, markdown pipeline
- `packages/theme-default` — default theme components
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
| theme | 'dommief-theme-default' | Theme package |
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
