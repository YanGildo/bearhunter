/** Converte para número finito. Ausente, vazio ou inválido vira null — nunca zero. */
export function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Variação percentual. Sem base válida (null ou <= 0) retorna null. */
export function pctChange(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null || previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function fmtUsd(v: number | null | undefined, opts: { dollar?: boolean } = {}): string {
  if (v == null) return '—';
  const d = opts.dollar === false ? '' : '$';
  const a = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (a >= 1e9) return `${sign}${d}${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${sign}${d}${(a / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${sign}${d}${(a / 1e3).toFixed(1)}K`;
  if (a >= 1) return `${sign}${d}${a.toFixed(0)}`;
  if (a === 0) return `${d}0`;
  return `${sign}${d}${a.toPrecision(3)}`;
}

export function fmtPct(v: number | null | undefined, digits = 1): string {
  if (v == null) return '—';
  return `${v > 0 ? '+' : ''}${v.toFixed(digits)}%`;
}

export function fmtInt(v: number | null | undefined): string {
  if (v == null) return '—';
  return Math.round(v).toLocaleString('en-US');
}

export function fmtAge(fromMs: number | null | undefined, now = Date.now()): string {
  if (fromMs == null) return '—';
  const s = Math.max(0, (now - fromMs) / 1000);
  if (s < 60) return `${Math.floor(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export function fmtDateTime(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}, ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function fmtTime(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function shortAddr(a: string, n = 4): string {
  return a.length > n * 2 + 3 ? `${a.slice(0, n)}…${a.slice(-n)}` : a;
}
