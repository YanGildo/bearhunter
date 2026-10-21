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

export interface AccountTrade {
  wallet: string;
  mint: string;
  kind: 'buy' | 'sell';
  solAmount: number;
  tokenAmount: number;
  signature: string;
  pool: string | null;
  marketCapSol: number | null;
}

/** Trade de carteira (canal pago subscribeAccountTrade). */
export function parseAccountTrade(raw: string, accounts: Set<string>): AccountTrade | null {
  let d: Record<string, unknown>;
  try {
    d = JSON.parse(raw);
  } catch {
    return null;
  }
  const tx = d?.txType;
  const wallet = d?.traderPublicKey;
  if ((tx !== 'buy' && tx !== 'sell') || typeof wallet !== 'string' || !accounts.has(wallet) || typeof d.mint !== 'string') return null;
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);
  return {
    wallet,
    mint: d.mint,
    kind: tx,
    solAmount: n(d.solAmount),
    tokenAmount: n(d.tokenAmount),
    signature: typeof d.signature === 'string' ? d.signature : '',
    pool: typeof d.pool === 'string' ? d.pool : null,
    marketCapSol: typeof d.marketCapSol === 'number' ? d.marketCapSol : null,
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
  private apiKey = '';
  private accounts = new Set<string>();
  private subscribedAccounts = new Set<string>();
  /** Recebe trades das carteiras assinadas (canal pago, só com API key). */
  onAccountTrade: ((t: AccountTrade) => void) | null = null;
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
      ws = new WebSocket(this.apiKey ? `${PUMPPORTAL_WS}?api-key=${encodeURIComponent(this.apiKey)}` : PUMPPORTAL_WS);
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
      this.subscribedAccounts.clear();
      this.syncAccounts();
    };
    ws.onmessage = (ev) => {
      if (this.accounts.size && this.onAccountTrade) {
        const tr = parseAccountTrade(String(ev.data), this.accounts);
        if (tr) {
          this.onAccountTrade(tr);
          return;
        }
      }
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

  /** Define a API key (reconecta se mudou). Sem key, os canais pagos ficam desligados. */
  setApiKey(key: string) {
    const k = key.trim();
    if (k === this.apiKey) return;
    this.apiKey = k;
    if (this.ws) this.ws.close(); // onclose reconecta com a nova URL
  }

  /** Carteiras para `subscribeAccountTrade` (só funciona com API key). */
  setAccounts(list: string[]) {
    this.accounts = new Set(this.apiKey ? list : []);
    this.syncAccounts();
  }

  private syncAccounts() {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN || !this.apiKey) return;
    const add = [...this.accounts].filter((a) => !this.subscribedAccounts.has(a));
    const del = [...this.subscribedAccounts].filter((a) => !this.accounts.has(a));
    if (add.length) ws.send(JSON.stringify({ method: 'subscribeAccountTrade', keys: add }));
    if (del.length) ws.send(JSON.stringify({ method: 'unsubscribeAccountTrade', keys: del }));
    add.forEach((a) => this.subscribedAccounts.add(a));
    del.forEach((a) => this.subscribedAccounts.delete(a));
  }

  hasApiKey() {
    return !!this.apiKey;
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
