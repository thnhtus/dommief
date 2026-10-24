# dommief

Static site generator for documentation/demo sites built on React, Vite, and Markdown.

## Stack

- TypeScript, pnpm
- React 19, Vite 8, React Router 8
- unified/remark/rehype markdown pipeline, shiki, minisearch, zod

## Packages

- `packages/core` — core library, CLI, Vite plugins, markdown pipeline
- `packages/theme-default` — default theme components (not yet wired into `AppRoutes`/rendering)
- `examples/docs` — demo site

## Features (phases)

- Phase 2: filesystem routing
- Phase 3: dev server + HMR
- Phase 4: build + prerender (SSG)
- Phase 5: theme system
- Phase 6: demo component (`<code src="...">`, `DumiDemo`)
- Phase 7: site features (nav, sidebar, TOC, pagination)
- Phase 8: client-side search index
- Phase 9: config + plugin API
- Phase 10: API table from TypeScript (`<API src="./Foo.tsx"/>`, cached by file hash)
- Phase 11: hardening (CI, typecheck scope)

## Development

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

## License

MIT