/** Journalisation JSON avec masquage automatique des secrets et jetons. */
const SENSITIVE_KEY = /token|authorization|secret|password|api[-_]?key|service[-_]?key|cookie|passphrase|seed/i;
const BEARER = /(Bearer|Key)\s+[A-Za-z0-9._~+/=-]{8,}/gi;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[profondeur]';
  if (typeof value === 'string') return value.replace(BEARER, '$1 [masqué]').slice(0, 500);
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redact(v, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEY.test(k) ? '[masqué]' : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

type Level = 'info' | 'warn' | 'error';

let silent = false;
export const setLoggerSilent = (v: boolean) => {
  silent = v;
};

export function log(level: Level, message: string, meta?: Record<string, unknown>) {
  if (silent) return;
  const line = JSON.stringify({
    t: new Date().toISOString(),
    level,
    msg: redact(message),
    ...(meta ? { meta: redact(meta) } : {}),
  });
  (level === 'error' ? console.error : console.log)(line);
}

export const logger = {
  info: (m: string, meta?: Record<string, unknown>) => log('info', m, meta),
  warn: (m: string, meta?: Record<string, unknown>) => log('warn', m, meta),
  error: (m: string, meta?: Record<string, unknown>) => log('error', m, meta),
};
export { redact };
