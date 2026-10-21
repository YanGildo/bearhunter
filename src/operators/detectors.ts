// Detectores puros do módulo Operadores.
import type { MarketObservation } from '@/domain/types';

export interface SellMark {
  wallet: string;
  at: number;
}

/** Quantas carteiras diferentes da lista venderam dentro da janela. */
export function distinctSellers(sells: SellMark[], now: number, windowS: number): string[] {
  const from = now - windowS * 1000;
  return [...new Set(sells.filter((s) => s.at >= from && s.at <= now + 1000).map((s) => s.wallet))];
}

export function isDump(sells: SellMark[], now: number, minWallets: number, windowS: number): boolean {
  return distinctSellers(sells, now, windowS).length >= minWallets;
}

/** Migração rápida: criado e migrado em até `maxS` segundos. */
export function fastMigrationSeconds(createdAt: number | null, migratedAt: number, maxS: number): number | null {
  if (createdAt == null) return null;
  const s = (migratedAt - createdAt) / 1000;
  return s >= 0 && s <= maxS ? s : null;
}

/**
 * Bundle de lançamento: par na bonding curve com poucos minutos de vida,
 * poucas compras grandes e quase nenhuma venda.
 */
export function bundleSignature(o: MarketObservation, now: number, maxAgeS: number, minAvgBuyUsd: number): { avg: number; buys: number; vol: number } | null {
  if (o.dexId !== 'pumpfun' || o.pairCreatedAt == null) return null;
  const age = (now - o.pairCreatedAt) / 1000;
  if (age < 0 || age > maxAgeS) return null;
  const w = o.windows['1h'];
  if (w.volumeUsd == null || w.buys == null || w.sells == null) return null;
  if (w.buys === 0 || w.buys > 25 || w.sells > 3 || w.volumeUsd < 3000) return null;
  const avg = w.volumeUsd / w.buys;
  return avg >= minAvgBuyUsd ? { avg, buys: w.buys, vol: w.volumeUsd } : null;
}

/**
 * Bots de volume ligados/desligados: compara o nº de transações em 5m agora
 * com o pico dos últimos 30 min observados.
 */
export function botsState(history: MarketObservation[], current: MarketObservation, offRatio: number, prev: 'on' | 'off' | null): 'on' | 'off' | null {
  const tx = (o: MarketObservation) => {
    const w = o.windows['5m'];
    return w.buys != null && w.sells != null ? w.buys + w.sells : null;
  };
  const cur = tx(current);
  if (cur == null) return prev;
  const from = current.observedAt - 30 * 60_000;
  const vals = history.filter((h) => h.observedAt >= from).map(tx).filter((v): v is number => v != null);
  if (vals.length < 3) return prev;
  const peak = Math.max(...vals, cur);
  if (peak < 150) return prev;
  if (cur <= peak * offRatio) return 'off';
  if (prev === 'off' && cur >= peak * 0.6) return 'on';
  return prev ?? 'on';
}

/** Extrai endereços Solana de um texto (links do GMGN/Solscan/DexScreener ou endereços soltos). */
export function extractAddresses(text: string): string[] {
  const re = /[1-9A-HJ-NP-Za-km-z]{32,44}/g;
  return [...new Set(text.match(re) ?? [])];
}
