import { num } from '@/domain/num';
import type { MarketObservation, Timeframe, TokenMeta, WindowMetrics } from '@/domain/types';

// Formato bruto do DexScreener (todos os campos opcionais — nunca assumir presença).
export interface DsPair {
  chainId?: string;
  dexId?: string;
  url?: string;
  pairAddress?: string;
  labels?: string[];
  baseToken?: { address?: string; name?: string; symbol?: string };
  quoteToken?: { address?: string; name?: string; symbol?: string };
  priceNative?: string;
  priceUsd?: string;
  txns?: Partial<Record<'m5' | 'h1' | 'h6' | 'h24', { buys?: number; sells?: number }>>;
  volume?: Partial<Record<'m5' | 'h1' | 'h6' | 'h24', number>>;
  priceChange?: Partial<Record<'m5' | 'h1' | 'h6' | 'h24', number>>;
  liquidity?: { usd?: number; base?: number; quote?: number };
  fdv?: number;
  marketCap?: number;
  pairCreatedAt?: number;
  info?: {
    imageUrl?: string;
    websites?: { url?: string; label?: string }[];
    socials?: { url?: string; type?: string }[];
  };
  boosts?: { active?: number };
}

const DS_KEY: Record<Timeframe, 'm5' | 'h1' | 'h6' | 'h24'> = { '5m': 'm5', '1h': 'h1', '6h': 'h6', '24h': 'h24' };
const PREFERRED_QUOTES = ['SOL', 'WSOL', 'USDC', 'USDT'];

function windowOf(p: DsPair, tf: Timeframe): WindowMetrics {
  const k = DS_KEY[tf];
  const t = p.txns?.[k];
  return {
    volumeUsd: num(p.volume?.[k]),
    buys: num(t?.buys),
    sells: num(t?.sells),
    priceChangePct: num(p.priceChange?.[k]),
  };
}

export function normalizePair(p: DsPair, observedAt: number, source = 'dexscreener'): MarketObservation | null {
  const tokenAddress = p.baseToken?.address;
  if (!tokenAddress) return null;
  const mcap = num(p.marketCap);
  const fdv = num(p.fdv);
  return {
    tokenAddress,
    pairAddress: p.pairAddress ?? null,
    dexId: p.dexId ?? null,
    quoteSymbol: p.quoteToken?.symbol ?? null,
    source,
    observedAt,
    priceUsd: num(p.priceUsd),
    priceNative: num(p.priceNative),
    marketCapUsd: mcap ?? fdv,
    mcapBasis: mcap != null ? 'reported' : fdv != null ? 'fdv_fallback' : null,
    fdvUsd: fdv,
    liquidityUsd: num(p.liquidity?.usd), // bonding curve (pumpfun) não traz liquidez: fica null
    pairCreatedAt: num(p.pairCreatedAt),
    windows: { '5m': windowOf(p, '5m'), '1h': windowOf(p, '1h'), '6h': windowOf(p, '6h'), '24h': windowOf(p, '24h') },
    boostsActive: num(p.boosts?.active),
  };
}

export function metaFromPair(p: DsPair): TokenMeta | null {
  const a = p.baseToken?.address;
  if (!a) return null;
  return {
    address: a,
    name: p.baseToken?.name ?? null,
    symbol: p.baseToken?.symbol ?? null,
    imageUrl: p.info?.imageUrl ?? null,
    websites: (p.info?.websites ?? []).map((w) => w.url).filter((u): u is string => !!u),
    socials: (p.info?.socials ?? [])
      .filter((s) => s.url)
      .map((s) => ({ type: s.type ?? 'link', url: s.url as string })),
  };
}

/**
 * Escolhe o par principal de um token de forma determinística:
 * 1. só Solana e com o token como base; 2. mantém o par atual se ainda for relevante;
 * 3. maior liquidez (bonding curve sem liquidez perde para pool migrado);
 * 4. maior volume 24h; 5. quote preferida; 6. desempate por endereço.
 */
export function selectPrimaryPair(pairs: DsPair[], token: string, currentPair?: string | null): DsPair | null {
  const c = pairs.filter((p) => p.chainId === 'solana' && p.baseToken?.address === token && p.pairAddress);
  if (!c.length) return null;
  const liq = (p: DsPair) => num(p.liquidity?.usd) ?? -1;
  const vol = (p: DsPair) => num(p.volume?.h24) ?? -1;
  const quoteRank = (p: DsPair) => {
    const i = PREFERRED_QUOTES.indexOf((p.quoteToken?.symbol ?? '').toUpperCase());
    return i === -1 ? 99 : i;
  };
  const sorted = [...c].sort(
    (a, b) =>
      liq(b) - liq(a) ||
      vol(b) - vol(a) ||
      quoteRank(a) - quoteRank(b) ||
      String(a.pairAddress).localeCompare(String(b.pairAddress)),
  );
  const best = sorted[0];
  if (currentPair) {
    const cur = c.find((p) => p.pairAddress === currentPair);
    // Evita trocar de par a cada ciclo: só troca se o atual ficou bem atrás.
    if (cur && cur !== best) {
      const curIsCurve = cur.dexId === 'pumpfun' && best.dexId !== 'pumpfun' && liq(best) > 0;
      if (!curIsCurve && vol(cur) >= vol(best) * 0.5 && liq(cur) >= liq(best) * 0.5) return cur;
    }
  }
  return best;
}
