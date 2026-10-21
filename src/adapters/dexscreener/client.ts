import type { DiscoveredToken, MarketAdapter, MarketFetchResult, SourceHealth } from '../types';
import { RateLimiter } from '../rateLimiter';
import { metaFromPair, normalizePair, selectPrimaryPair, type DsPair } from './normalize';
import type { MarketObservation, TokenMeta } from '@/domain/types';

export const DEXSCREENER_DEFAULT_BASE = 'https://api.dexscreener.com';
const TIMEOUT_MS = 10_000;

interface BoostItem {
  chainId?: string;
  tokenAddress?: string;
  totalAmount?: number;
  amount?: number;
  icon?: string;
}

export class DexScreenerAdapter implements MarketAdapter {
  id = 'dexscreener';
  maxBatch = 30;
  capabilities = {
    discovery: true,
    migrations: false,
    marketData: true,
    windows: true,
    liquidity: 'post_migration' as const,
    search: true,
  };

  // Limite oficial: 300/min nos endpoints de pares/tokens/busca e 60/min nos de perfis/boosts.
  // Ficamos abaixo com margem.
  private marketLimiter = new RateLimiter(240);
  private listLimiter = new RateLimiter(40);
  private h: SourceHealth = {
    id: 'dexscreener',
    label: 'DexScreener',
    state: 'idle',
    lastSuccessAt: null,
    lastErrorAt: null,
    lastError: null,
    detail: null,
  };

  constructor(private getBase: () => string = () => DEXSCREENER_DEFAULT_BASE) {}

  health(): SourceHealth {
    return { ...this.h, requestsLastMinute: this.marketLimiter.used() + this.listLimiter.used() };
  }

  marketCapacity(): number {
    return this.marketLimiter.available();
  }

  private async get<T>(path: string, limiter: RateLimiter, attempt = 0): Promise<T> {
    await limiter.acquire();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const base = this.getBase().replace(/\/+$/, '');
    try {
      const res = await fetch(`${base}${path}`, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
      if (res.status === 429) {
        limiter.pause(30_000);
        throw new Error('HTTP 429 (limite atingido, pausando 30s)');
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as T;
      this.h = { ...this.h, state: 'ok', lastSuccessAt: Date.now(), detail: null };
      return data;
    } catch (e) {
      const msg =
        e instanceof DOMException && e.name === 'AbortError'
          ? 'timeout'
          : e instanceof TypeError
            ? 'falha de rede/CORS — configure um proxy em Configurações se persistir'
            : (e as Error).message;
      const retriable = !msg.startsWith('HTTP 4');
      if (retriable && attempt < 1) {
        await new Promise((r) => setTimeout(r, 1500));
        return this.get<T>(path, limiter, attempt + 1);
      }
      this.h = { ...this.h, state: 'error', lastErrorAt: Date.now(), lastError: msg };
      throw new Error(msg);
    } finally {
      clearTimeout(timer);
    }
  }

  async fetchTokens(addresses: string[], currentPairs: Record<string, string> = {}): Promise<MarketFetchResult> {
    if (addresses.length > this.maxBatch) throw new Error(`batch máximo é ${this.maxBatch}`);
    const pairs = await this.get<DsPair[]>(`/tokens/v1/solana/${addresses.join(',')}`, this.marketLimiter);
    const now = Date.now();
    const list = Array.isArray(pairs) ? pairs : [];
    const observations: MarketObservation[] = [];
    const metas: TokenMeta[] = [];
    const missing: string[] = [];
    for (const a of addresses) {
      const best = selectPrimaryPair(list, a, currentPairs[a]);
      if (!best) {
        missing.push(a);
        continue;
      }
      const obs = normalizePair(best, now, this.id);
      const meta = metaFromPair(best);
      if (obs) observations.push(obs);
      if (meta) metas.push(meta);
    }
    return { observations, metas, missing };
  }

  /** Todos os pares de um token (inclui a bonding curve e os pools migrados), já normalizados. */
  async tokenPairs(token: string): Promise<{ observation: MarketObservation; hasProfile: boolean }[]> {
    const pairs = await this.get<DsPair[]>(`/token-pairs/v1/solana/${token}`, this.marketLimiter);
    const now = Date.now();
    return (Array.isArray(pairs) ? pairs : [])
      .filter((p) => p.chainId === 'solana' && p.baseToken?.address === token)
      .map((p) => ({ observation: normalizePair(p, now, this.id), hasProfile: !!(p.info?.imageUrl || p.info?.websites?.length || p.info?.socials?.length) }))
      .filter((x): x is { observation: MarketObservation; hasProfile: boolean } => !!x.observation);
  }

  async listTrending(): Promise<DiscoveredToken[]> {
    const now = Date.now();
    const out = new Map<string, DiscoveredToken>();
    const lists: [string, 'boosted' | 'profile'][] = [
      ['/token-boosts/top/v1', 'boosted'],
      ['/token-boosts/latest/v1', 'boosted'],
      ['/token-profiles/latest/v1', 'profile'],
    ];
    for (const [path, source] of lists) {
      try {
        const items = await this.get<BoostItem[]>(path, this.listLimiter);
        for (const it of Array.isArray(items) ? items : []) {
          if (it.chainId !== 'solana' || !it.tokenAddress) continue;
          const prev = out.get(it.tokenAddress);
          const boost = it.totalAmount ?? it.amount ?? null;
          if (!prev || (boost ?? 0) > (prev.boostAmount ?? 0)) {
            out.set(it.tokenAddress, {
              address: it.tokenAddress,
              source: prev?.source === 'boosted' ? 'boosted' : source,
              imageUrl: it.icon ?? null,
              boostAmount: source === 'boosted' ? boost : prev?.boostAmount ?? null,
              at: now,
            });
          }
        }
      } catch {
        // uma lista falhar não derruba as outras; o erro fica no health
      }
    }
    return [...out.values()];
  }

  async search(query: string): Promise<{ observation: MarketObservation; meta: TokenMeta }[]> {
    const q = query.trim();
    if (!q) return [];
    const data = await this.get<{ pairs?: DsPair[] }>(`/latest/dex/search?q=${encodeURIComponent(q)}`, this.marketLimiter);
    const now = Date.now();
    const seen = new Set<string>();
    const out: { observation: MarketObservation; meta: TokenMeta }[] = [];
    for (const p of data.pairs ?? []) {
      if (p.chainId !== 'solana') continue;
      const a = p.baseToken?.address;
      if (!a || seen.has(a)) continue;
      const best = selectPrimaryPair(data.pairs ?? [], a);
      if (!best) continue;
      const o = normalizePair(best, now, this.id);
      const m = metaFromPair(best);
      if (o && m) {
        seen.add(a);
        out.push({ observation: o, meta: m });
      }
    }
    return out;
  }
}
