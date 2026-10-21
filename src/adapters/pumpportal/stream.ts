import type { DiscoveredToken, DiscoveryAdapter, SourceHealth } from '../types';

export const PUMPPORTAL_WS = 'wss://pumpportal.fun/api/data';

export interface PumpPortalMessage {
  message?: string;
  txType?: string;
  mint?: string;
  signature?: string;
  name?: string;
  symbol?: string;
  pool?: string;
  [k: string]: unknown;
}

const ALLOWED_POOLS = new Set(['pump', 'pump-amm', 'pumpswap']);

/** Converte uma mensagem do PumpPortal em token descoberto (ou null se não interessa). */
export function parsePumpPortalMessage(raw: string, at = Date.now()): DiscoveredToken | null {
  let d: PumpPortalMessage;
  try {
    d = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!d || typeof d !== 'object' || d.message || !d.mint) return null;
  // Só Pump.fun: tokens de outros launchpads (ex.: bonk) ficam de fora.
  if (d.pool && !ALLOWED_POOLS.has(String(d.pool))) return null;
  const tx = String(d.txType ?? '');
  let source: DiscoveredToken['source'] | null = null;
  if (tx === 'create') source = 'pumpportal_new';
  else if (tx === 'migrate' || tx === 'migration') source = 'pumpportal_migrated';
  if (!source) return null; // eventos de trade não são assinados nesta versão
  return {
    address: d.mint,
    source,
    name: typeof d.name === 'string' ? d.name : null,
    symbol: typeof d.symbol === 'string' ? d.symbol : null,
    signature: typeof d.signature === 'string' ? d.signature : null,
    at,
  };
}

/** Conjunto com limite de tamanho para dedupe de eventos. */
export class BoundedSet {
  private s = new Set<string>();
  constructor(private max = 5000) {}
  has(k: string) {
    return this.s.has(k);
  }
  add(k: string) {
    if (this.s.has(k)) return;
    this.s.add(k);
    if (this.s.size > this.max) {
      const first = this.s.values().next().value;
      if (first !== undefined) this.s.delete(first);
    }
  }
}

/**
 * Uma única conexão WebSocket com os canais GRATUITOS do PumpPortal
 * (subscribeNewToken + subscribeMigration). Sem API key, sem canais pagos.
 */
export class PumpPortalAdapter implements DiscoveryAdapter {
  id = 'pumpportal';
  capabilities = {
    discovery: true,
    migrations: true,
    marketData: false,
    windows: false,
    liquidity: 'never' as const,
    search: false,
  };
  private ws: WebSocket | null = null;
  private stopped = true;
  private retry = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private seen = new BoundedSet();
  private events = 0;
  private h: SourceHealth = {
    id: 'pumpportal',
    label: 'PumpPortal',
    state: 'off',
    lastSuccessAt: null,
    lastErrorAt: null,
    lastError: null,
    detail: null,
  };

  health(): SourceHealth {
    return { ...this.h, detail: this.h.state === 'ok' ? `${this.events} eventos nesta sessão` : this.h.detail };
  }

  start(onToken: (t: DiscoveredToken) => void) {
    if (!this.stopped) return;
    this.stopped = false;
    this.connect(onToken);
  }

  private connect(onToken: (t: DiscoveredToken) => void) {
    if (this.stopped) return;
    this.h = { ...this.h, state: 'connecting' };
    let ws: WebSocket;
    try {
      ws = new WebSocket(PUMPPORTAL_WS);
    } catch (e) {
      this.fail(String(e), onToken);
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.h = { ...this.h, state: 'ok', lastSuccessAt: Date.now(), detail: null };
      ws.send(JSON.stringify({ method: 'subscribeNewToken' }));
      ws.send(JSON.stringify({ method: 'subscribeMigration' }));
    };
    ws.onmessage = (ev) => {
      const t = parsePumpPortalMessage(String(ev.data));
      if (!t) return;
      const key = `${t.source}:${t.signature ?? t.address}`;
      if (this.seen.has(key)) return;
      this.seen.add(key);
      this.events++;
      this.h.lastSuccessAt = Date.now();
      onToken(t);
    };
    ws.onerror = () => {
      this.h = { ...this.h, lastErrorAt: Date.now(), lastError: 'erro na conexão WebSocket' };
    };
    ws.onclose = () => {
      this.ws = null;
      if (!this.stopped) this.fail(this.h.lastError ?? 'conexão fechada', onToken);
    };
  }

  private fail(msg: string, onToken: (t: DiscoveredToken) => void) {
    // Backoff exponencial com jitter: 2s, 4s, 8s... até 60s.
    const delay = Math.min(60_000, 2000 * 2 ** this.retry) * (0.8 + Math.random() * 0.4);
    this.retry++;
    this.h = {
      ...this.h,
      state: 'degraded',
      lastErrorAt: Date.now(),
      lastError: msg,
      detail: `reconectando em ${Math.round(delay / 1000)}s`,
    };
    this.timer = setTimeout(() => this.connect(onToken), delay);
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
    }
    this.ws = null;
    this.h = { ...this.h, state: 'off', detail: null };
  }
}
