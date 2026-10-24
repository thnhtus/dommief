export interface Logger { verbose: boolean; info(msg: string): void; debug(msg: string): void; warn(msg: string): void; error(msg: string): void; }
export function createLogger(verbose = false): Logger {
  return {
    verbose,
    info: (m) => console.log(m),
    debug: (m) => { if (verbose) console.log('[debug]', m); },
    warn: (m) => console.warn('[warn]', m),
    error: (m) => console.error('[error]', m),
  };
}
