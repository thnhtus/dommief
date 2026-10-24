import fs from 'node:fs';
import path from 'node:path';
import { definePlugin } from 'dommief';

export default definePlugin((hooks) => {
  hooks.onBuildEnd.tap('sitemap', async (ctx) => {
    const urls = (ctx.routes ?? []).map((r) => `${ctx.config.base.replace(/\/$/, '')}${r.path}`);
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
      .map((u) => `  <url><loc>${u}</loc></url>`)
      .join('\n')}\n</urlset>\n`;
    await fs.promises.writeFile(path.join(ctx.outDir, 'sitemap.xml'), xml, 'utf8');
  });
});
