export class DommiefError extends Error {
  file: string;
  line?: number | undefined;
  col?: number | undefined;
  code?: string | undefined;
  layout?: string | undefined;
  constructor(message: string, opts: { file?: string; line?: number; col?: number; code?: string; layout?: string } = {}) {
    super(message);
    this.name = 'DommiefError';
    this.file = opts.file ?? '';
    this.line = opts.line;
    this.col = opts.col;
    this.code = opts.code;
    this.layout = opts.layout;
  }
  format(): string {
    const loc = this.line != null ? `:${this.line}${this.col != null ? ':' + this.col : ''}` : '';
    const head = this.file ? `${this.file}${loc}` : loc.slice(1) || '';
    return head ? `${head}: ${this.message}` : this.message;
  }
  toString() { return this.format(); }
}

export function formatError(err: unknown): string {
  if (err instanceof DommiefError) return err.format();
  if (err instanceof Error) return err.message;
  return String(err);
}
