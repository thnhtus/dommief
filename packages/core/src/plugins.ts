import type { Route } from './types.js';
import type { ResolvedConfig } from './config.js';

export interface BuildEndContext {
  config: ResolvedConfig;
  outDir: string;
  routes?: Route[];
}

export type DommiefPluginObject = {
  name?: string;
  setup?: (hooks: PluginHookHost) => void | Promise<void>;
  modifyConfig?: (config: unknown) => unknown;
  modifyRoutes?: (routes: Route[]) => Route[] | void;
  addRemarkPlugins?: () => unknown | unknown[];
  addRehypePlugins?: () => unknown | unknown[];
  addHtmlHeadTags?: () => string | string[] | void;
  onBuildEnd?: (ctx: BuildEndContext) => void | Promise<void>;
};

export type PluginSetup = (hooks: PluginHookHost) => void | Promise<void>;
export type DommiefPlugin = DommiefPluginObject | PluginSetup;

export class Hook<TArg = unknown, TResult = unknown> {
  name: string;
  constructor(name = '') { this.name = name; }
  taps: { name: string; fn: (arg: TArg) => TResult | void | Promise<TResult | void> }[] = [];
  tap(name: string, fn: (arg: TArg) => TResult | void | Promise<TResult | void>) {
    this.taps.push({ name, fn });
  }
  async tapPromise(name: string, fn: (arg: TArg) => Promise<TResult | void>) {
    this.taps.push({ name, fn });
  }
  call(arg: TArg): TArg {
    let value: any = arg;
    for (const t of this.taps) {
      const r = (t.fn as any)(value);
      if (r !== undefined) value = r;
    }
    return value as TArg;
  }
  async callAsync(arg: TArg): Promise<TArg> {
    let value: any = arg;
    for (const t of this.taps) {
      const r = await (t.fn as any)(value);
      if (r !== undefined) value = r;
    }
    return value as TArg;
  }
}

export class PluginHookHost {
  modifyConfig = new Hook<unknown, unknown>('modifyConfig' as any);
  modifyRoutes = new Hook<Route[], Route[]>('modifyRoutes' as any);
  addRemarkPlugins = new Hook<void, unknown[]>('addRemarkPlugins' as any);
  addRehypePlugins = new Hook<void, unknown[]>('addRehypePlugins' as any);
  addHtmlHeadTags = new Hook<void, string | string[]>('addHtmlHeadTags' as any);
  onBuildEnd = new Hook<BuildEndContext, void>('onBuildEnd' as any);

  applyModifyConfig(config: unknown): Record<string, unknown> {
    return this.modifyConfig.call(config) as Record<string, unknown>;
  }
  applyModifyRoutes(routes: Route[]): Route[] {
    const r = this.modifyRoutes.call(routes);
    return (r as Route[]) ?? routes;
  }
  collectRemarkPlugins(): unknown[] {
    const out: unknown[] = [];
    for (const t of this.addRemarkPlugins.taps) {
      const r = (t.fn as any)();
      if (Array.isArray(r)) out.push(...r);
      else if (r !== undefined && r !== null) out.push(r);
    }
    return out;
  }
  collectRehypePlugins(): unknown[] {
    const out: unknown[] = [];
    for (const t of this.addRehypePlugins.taps) {
      const r = (t.fn as any)();
      if (Array.isArray(r)) out.push(...r);
      else if (r !== undefined && r !== null) out.push(r);
    }
    return out;
  }
  collectHtmlHeadTags(): string[] {
    const out: string[] = [];
    for (const t of this.addHtmlHeadTags.taps) {
      const r = (t.fn as any)();
      if (Array.isArray(r)) out.push(...r.map(String));
      else if (r !== undefined && r !== null) out.push(String(r));
    }
    return out;
  }
  async runBuildEnd(ctx: BuildEndContext): Promise<void> {
    for (const t of this.onBuildEnd.taps) {
      await (t.fn as any)(ctx);
    }
  }
}

export function registerPlugin(host: PluginHookHost, plugin: DommiefPlugin | null | undefined): void {
  if (!plugin) return;
  if (typeof plugin === 'function') {
    (plugin as PluginSetup)(host);
    return;
  }
  const p = plugin as DommiefPluginObject;
  if (typeof p.setup === 'function') {
    p.setup(host);
    return;
  }
  const name = p.name ?? 'plugin';
  if (typeof p.modifyConfig === 'function') host.modifyConfig.tap(name, p.modifyConfig as any);
  if (typeof p.modifyRoutes === 'function') host.modifyRoutes.tap(name, p.modifyRoutes as any);
  if (typeof p.addRemarkPlugins === 'function') host.addRemarkPlugins.tap(name, p.addRemarkPlugins as any);
  if (typeof p.addRehypePlugins === 'function') host.addRehypePlugins.tap(name, p.addRehypePlugins as any);
  if (typeof p.addHtmlHeadTags === 'function') host.addHtmlHeadTags.tap(name, p.addHtmlHeadTags as any);
  if (typeof p.onBuildEnd === 'function') host.onBuildEnd.tap(name, p.onBuildEnd as any);
}

export function createPluginHost(plugins: unknown[] = []): PluginHookHost {
  const host = new PluginHookHost();
  for (const p of plugins ?? []) registerPlugin(host, p as DommiefPlugin);
  return host;
}

export function definePlugin(plugin: DommiefPlugin): DommiefPlugin {
  return plugin;
}
