import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const ConfigSchema = z.object({
  srcDir: z.string().default('docs'),
  base: z.string().default('/'),
  outDir: z.string().default('dist'),
  locales: z.array(z.object({ id: z.string(), name: z.string().optional() })).default([{ id: 'default', name: 'Default' }]),
  forceKebabCase: z.boolean().default(false),
  cleanUrls: z.boolean().default(true),
  ssg: z.object({ concurrency: z.number().default(4), exclude: z.array(z.string()).default([]) }).default({}),
  theme: z.string().optional(),
  title: z.string().default('Dommief'),
});

export type ResolvedConfig = z.infer<typeof ConfigSchema> & { root: string };

export function defineConfig(c: Partial<z.infer<typeof ConfigSchema>>) { return c; }

export async function loadConfig(root: string): Promise<ResolvedConfig> {
  const candidates = ['dommief.config.ts','dommief.config.mts','dommief.config.js','dommief.config.mjs'];
  let raw: any = {};
  for (const c of candidates) {
    const p = path.join(root, c);
    if (fs.existsSync(p)) {
      const mod = await import(pathToFileURL(p).href);
      raw = mod.default ?? mod;
      break;
    }
  }
  const parsed = ConfigSchema.parse(raw ?? {});
  // normalize base
  let base = parsed.base;
  if (!base.startsWith('/')) base = '/' + base;
  if (!base.endsWith('/')) base += '/';
  return { ...parsed, base, root };
}
