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

// Network guard: opt-in. Set DOMMIEF_NO_NETWORK=1 to block.
export function networkGuardEnabled(): boolean { return process.env.DOMMIEF_NO_NETWORK === '1'; }
export function assertNoNetwork(url: string): void {
  if (networkGuardEnabled()) throw new Error(`Network access blocked by DOMMIEF_NO_NETWORK: ${url}`);
}
