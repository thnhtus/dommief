import { buildRouteTable } from '../routes.js';
import type { ResolvedConfig } from '../config.js';
import type { PluginHookHost } from '../plugins.js';
import type { RouteTable } from '../types.js';

/**
 * Trạng thái dùng chung của ba plugin Vite (markdown/routes/site): MỘT config, MỘT plugin host,
 * MỘT route table. Trước đây mỗi plugin tự quét và tự gọi `modifyRoutes`, nên hai bảng có thể lệch nhau.
 */
export interface DommiefState {
  cwd: string;
  config(): ResolvedConfig;
  host(): PluginHookHost;
  getTable(): RouteTable;
  resetTable(): void;
}

export function createState(cwd: string, get: () => { config: ResolvedConfig; host: PluginHookHost }): DommiefState {
  let table: RouteTable | null = null;
  return {
    cwd,
    config: () => get().config,
    host: () => get().host,
    getTable: () => (table ??= buildRouteTable({ cwd, config: get().config, hooks: get().host })),
    resetTable: () => { table = null; },
  };
}
