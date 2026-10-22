// Cliente da RPC pública da Solana (HTTP + WebSocket), usado só pelo módulo Operadores.
// A RPC pública limita ~100 req/10s por IP e ~40 req/10s por método: ficamos em 30/10s.
import { RateLimiter } from '../rateLimiter';
import type { SourceHealth } from '../types';
import { proxyOrigin, Route, wsOrigin } from '../route';
import type { RpcTx } from '@/operators/parseTx';

export const SOLANA_PUBLIC_RPC = 'https://api.mainnet-beta.solana.com';
const SYSTEM_PROGRAM = '11111111111111111111111111111111';

export class SolanaRpc {
  private limiter = new RateLimiter(30, 10_000);
  private id = 1;
  private h: SourceHealth = { id: 'solana-rpc', label: 'Solana RPC', state: 'idle', lastSuccessAt: null, lastErrorAt: null, lastError: null, detail: null };

  constructor(
    private getUrl: () => string = () => SOLANA_PUBLIC_RPC,
    readonly route: Route = new Route(),
  ) {}

  /** URL efetiva (direta ou pelo Cloudflare). */
  endpoint() {
    const origin = proxyOrigin();
    const u = this.getUrl();
    return this.route.pick() === 'proxy' && origin ? `${origin}/rpc?u=${encodeURIComponent(u)}` : u;
  }

  /** Botão "Testar": uma chamada simples (getSlot). */
  async test(): Promise<{ ok: boolean; ms: number; msg: string }> {
    const t0 = performance.now();
    try {
      const slot = await this.call<number>('getSlot', []);
      return { ok: true, ms: Math.round(performance.now() - t0), msg: `respondeu (slot ${slot}) pela rota ${this.route.label()}` };
    } catch (e) {
      return { ok: false, ms: Math.round(performance.now() - t0), msg: `${(e as Error).message} (rota ${this.route.label()})` };
    }
  }

  health(): SourceHealth {
    return { ...this.h, requestsLastMinute: this.limiter.used() };
  }
  setDetail(detail: string | null, state?: SourceHealth['state']) {
    this.h = { ...this.h, detail, state: state ?? this.h.state };
  }

  async call<T>(method: string, params: unknown[]): Promise<T> {
    await this.limiter.acquire();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12_000);
    try {
      let res: Response;
      try {
        res = await fetch(this.endpoint(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: this.id++, method, params }),
          signal: ctrl.signal,
        });
      } catch (e) {
        // falha de rede (bloqueio/timeout): conta para trocar de rota
        this.route.fail();
        throw e instanceof DOMException && e.name === 'AbortError' ? e : new Error('sem conexão com a RPC (a rede pode estar bloqueando)');
      }
      this.route.ok();
      if (res.status === 403) throw new Error('HTTP 403 (a RPC recusou; use uma RPC grátis da Helius/QuickNode)');
      if (res.status === 429) {
        this.limiter.pause(15_000);
        throw new Error('HTTP 429 (limite da RPC, pausando 15s)');
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = (await res.json()) as { result?: T; error?: { message?: string } };
      if (j.error) throw new Error(j.error.message ?? 'erro da RPC');
      this.h = { ...this.h, state: 'ok', lastSuccessAt: Date.now() };
      return j.result as T;
    } catch (e) {
      const msg = e instanceof DOMException && e.name === 'AbortError' ? 'timeout' : (e as Error).message;
      this.h = { ...this.h, state: 'error', lastErrorAt: Date.now(), lastError: msg };
      throw new Error(msg);
    } finally {
      clearTimeout(timer);
    }
  }

  getTransaction(sig: string) {
    return this.call<RpcTx | null>('getTransaction', [sig, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0, commitment: 'confirmed' }]);
  }

  getSignatures(address: string, limit = 10) {
    return this.call<{ signature: string; blockTime: number | null; err: unknown }[]>('getSignaturesForAddress', [address, { limit, commitment: 'confirmed' }]);
  }

  async getTokenSupply(mint: string): Promise<number | null> {
    const r = await this.call<{ value?: { uiAmount?: number | null } }>('getTokenSupply', [mint]);
    return r?.value?.uiAmount ?? null;
  }

  /**
   * Maiores holders de um token, já como CARTEIRAS (donos das contas de token),
   * excluindo contas de programa (bonding curve, pools) e o par informado.
   */
  async topHolders(mint: string, exclude: string[] = []): Promise<{ owner: string; amount: number; pct: number | null }[]> {
    const largest = await this.call<{ value: { address: string; uiAmount: number | null }[] }>('getTokenLargestAccounts', [mint, { commitment: 'confirmed' }]);
    const accs = largest?.value ?? [];
    if (!accs.length) return [];
    const parsed = await this.call<{ value: ({ data?: { parsed?: { info?: { owner?: string } } } } | null)[] }>('getMultipleAccounts', [
      accs.map((a) => a.address),
      { encoding: 'jsonParsed' },
    ]);
    const owners = (parsed?.value ?? []).map((v) => v?.data?.parsed?.info?.owner ?? null);
    const uniq = [...new Set(owners.filter((o): o is string => !!o))];
    const info = await this.call<{ value: ({ owner?: string } | null)[] }>('getMultipleAccounts', [uniq, { encoding: 'base64', dataSlice: { offset: 0, length: 0 } }]);
    const isWallet = new Map<string, boolean>();
    uniq.forEach((o, i) => {
      const acc = info?.value?.[i];
      isWallet.set(o, !acc || acc.owner === SYSTEM_PROGRAM);
    });
    let supply: number | null = null;
    try {
      supply = await this.getTokenSupply(mint);
    } catch {
      supply = null;
    }
    const out = new Map<string, number>();
    accs.forEach((a, i) => {
      const o = owners[i];
      if (!o || !isWallet.get(o) || exclude.includes(o)) return;
      out.set(o, (out.get(o) ?? 0) + (a.uiAmount ?? 0));
    });
    return [...out.entries()].map(([owner, amount]) => ({ owner, amount, pct: supply ? (amount / supply) * 100 : null })).sort((x, y) => y.amount - x.amount);
  }
}

type LogsHandler = (wallet: string, signature: string, logs: string[]) => void;

/** Uma única conexão WebSocket com uma assinatura `logsSubscribe` por carteira. */
export class SolanaLogsSocket {
  private ws: WebSocket | null = null;
  private wanted = new Set<string>();
  private reqToWallet = new Map<number, string>();
  private subToWallet = new Map<number, string>();
  private walletToSub = new Map<string, number>();
  private nextId = 1;
  private retry = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = true;
  connected = false;

  constructor(
    private getUrl: () => string,
    private onLogs: LogsHandler,
    private onState: (s: 'ok' | 'connecting' | 'degraded' | 'off', detail?: string) => void,
    private route: Route = new Route(),
  ) {}

  start(wallets: string[]) {
    this.wanted = new Set(wallets);
    if (this.stopped) {
      this.stopped = false;
      this.connect();
    } else this.sync();
  }

  setWallets(wallets: string[]) {
    this.wanted = new Set(wallets);
    this.sync();
  }

  private wsUrl() {
    const origin = proxyOrigin();
    const u = this.getUrl();
    if (this.route.pick() === 'proxy' && origin) return `${wsOrigin(origin)}/rpc?u=${encodeURIComponent(u)}`;
    return u.replace(/^http/, 'ws');
  }

  private connect() {
    if (this.stopped) return;
    this.onState('connecting');
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.wsUrl());
    } catch {
      this.fail();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.route.ok();
      this.retry = 0;
      this.connected = true;
      this.subToWallet.clear();
      this.walletToSub.clear();
      this.onState('ok');
      this.sync();
    };
    ws.onmessage = (ev) => {
      let m: { id?: number; result?: unknown; method?: string; params?: { subscription?: number; result?: { value?: { signature?: string; err?: unknown; logs?: string[] } } } };
      try {
        m = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      if (m.id != null && typeof m.result === 'number') {
        const w = this.reqToWallet.get(m.id);
        if (w) {
          this.subToWallet.set(m.result, w);
          this.walletToSub.set(w, m.result);
        }
        this.reqToWallet.delete(m.id);
        return;
      }
      if (m.method === 'logsNotification') {
        const w = this.subToWallet.get(m.params?.subscription ?? -1);
        const v = m.params?.result?.value;
        if (w && v?.signature && !v.err) this.onLogs(w, v.signature, v.logs ?? []);
      }
    };
    ws.onclose = () => {
      if (!this.connected) this.route.fail();
      this.connected = false;
      this.ws = null;
      if (!this.stopped) this.fail();
    };
    ws.onerror = () => {
      /* onclose cuida da reconexão */
    };
  }

  private sync() {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    for (const w of this.wanted) {
      if (this.walletToSub.has(w) || [...this.reqToWallet.values()].includes(w)) continue;
      const id = this.nextId++;
      this.reqToWallet.set(id, w);
      ws.send(JSON.stringify({ jsonrpc: '2.0', id, method: 'logsSubscribe', params: [{ mentions: [w] }, { commitment: 'confirmed' }] }));
    }
    for (const [w, sub] of [...this.walletToSub]) {
      if (this.wanted.has(w)) continue;
      ws.send(JSON.stringify({ jsonrpc: '2.0', id: this.nextId++, method: 'logsUnsubscribe', params: [sub] }));
      this.walletToSub.delete(w);
      this.subToWallet.delete(sub);
    }
  }

  private fail() {
    const delay = Math.min(60_000, 2000 * 2 ** this.retry) * (0.8 + Math.random() * 0.4);
    this.retry++;
    this.onState('degraded', `WebSocket caiu; reconectando em ${Math.round(delay / 1000)}s pela rota ${this.route.label()} (a varredura periódica continua)`);
    this.timer = setTimeout(() => this.connect(), delay);
  }

  stop() {
    this.stopped = true;
    this.connected = false;
    if (this.timer) clearTimeout(this.timer);
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
    }
    this.ws = null;
    this.onState('off');
  }
}
