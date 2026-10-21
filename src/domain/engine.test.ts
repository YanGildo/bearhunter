import { describe, expect, it } from 'vitest';
import { evaluateRevival, evaluateTimeframe, findPrevious } from './engine';
import { defaultPresets, DEFAULT_REVIVAL } from './presets';
import type { MarketObservation, WindowMetrics } from './types';

const W = (v: Partial<WindowMetrics> = {}): WindowMetrics => ({ volumeUsd: null, buys: null, sells: null, priceChangePct: null, ...v });

function obs(t: number, o: Partial<MarketObservation> & { w5?: Partial<WindowMetrics>; h1?: Partial<WindowMetrics>; h24?: Partial<WindowMetrics>; h6?: Partial<WindowMetrics> } = {}): MarketObservation {
  return {
    tokenAddress: 'TOKEN',
    pairAddress: 'PAIR',
    dexId: 'pumpswap',
    quoteSymbol: 'SOL',
    source: 'test',
    observedAt: t,
    priceUsd: 1,
    priceNative: 1,
    marketCapUsd: 100_000,
    mcapBasis: 'reported',
    fdvUsd: 100_000,
    liquidityUsd: 20_000,
    pairCreatedAt: t - 2 * 3600_000,
    boostsActive: null,
    ...o,
    windows: { '5m': W(o.w5), '1h': W(o.h1), '6h': W(o.h6), '24h': W(o.h24) },
  };
}

const strong = defaultPresets().strong.tf['5m'];
const T0 = 1_800_000_000_000;

describe('findPrevious', () => {
  it('ignora snapshots perto demais e velhos demais', () => {
    const cur = obs(T0 + 60_000);
    const near = obs(T0 + 50_000);
    const ok = obs(T0 + 20_000);
    expect(findPrevious([ok, near], cur, 30)).toBe(ok);
    expect(findPrevious([obs(T0 - 3_600_000)], cur, 30)).toBeNull();
  });
});

describe('evaluateTimeframe', () => {
  it('dispara Buy quando volume e mcap sobem e há pressão compradora', () => {
    const prev = obs(T0, { marketCapUsd: 50_000, w5: { volumeUsd: 20_000 } });
    const cur = obs(T0 + 30_000, { marketCapUsd: 110_000, w5: { volumeUsd: 45_000, buys: 300, sells: 120, priceChangePct: 40 } });
    const r = evaluateTimeframe('strong', '5m', strong, cur, [prev]);
    expect(r.candidates).toHaveLength(1);
    expect(r.candidates[0].direction).toBe('buy');
    expect(Math.round(r.candidates[0].volRisePct!)).toBe(125);
  });

  it('volume alto com preço caindo nunca vira Buy', () => {
    const prev = obs(T0, { marketCapUsd: 50_000, w5: { volumeUsd: 20_000 } });
    const cur = obs(T0 + 30_000, { marketCapUsd: 110_000, w5: { volumeUsd: 45_000, buys: 300, sells: 120, priceChangePct: -5 } });
    const r = evaluateTimeframe('strong', '5m', strong, cur, [prev]);
    expect(r.candidates).toHaveLength(0);
    expect(r.rejects).toContain('buy_price_not_up');
  });

  it('sem snapshot anterior não inventa zero: rejeita com previous_missing', () => {
    const cur = obs(T0, { w5: { volumeUsd: 45_000, buys: 10, sells: 1, priceChangePct: 5 } });
    const r = evaluateTimeframe('strong', '5m', strong, cur, []);
    expect(r.candidates).toHaveLength(0);
    expect(r.rejects).toContain('previous_missing');
  });

  it('volume desconhecido (null) não é tratado como zero', () => {
    const cur = obs(T0, { w5: { volumeUsd: null } });
    expect(evaluateTimeframe('strong', '5m', strong, cur, []).rejects).toEqual(['volume_unknown']);
  });

  it('filtro de liquidez com liquidez desconhecida rejeita com motivo', () => {
    const cfg = { ...strong, volRisePct: null, mcapRisePct: null, minLiq: 5000 };
    const cur = obs(T0, { liquidityUsd: null, dexId: 'pumpfun', w5: { volumeUsd: 45_000, buys: 10, sells: 1, priceChangePct: 5 } });
    expect(evaluateTimeframe('strong', '5m', cfg, cur, []).rejects).toContain('liquidity_unknown');
  });

  it('Sell só com preço caindo e mais vendas', () => {
    const cfg = { ...strong, volRisePct: null, mcapRisePct: null, buySide: false, sellSide: true };
    const cur = obs(T0, { w5: { volumeUsd: 45_000, buys: 10, sells: 50, priceChangePct: -12 } });
    const r = evaluateTimeframe('strong', '5m', cfg, cur, []);
    expect(r.candidates.map((c) => c.direction)).toEqual(['sell']);
  });
});

describe('evaluateRevival', () => {
  const old = T0 - 10 * 86400_000;
  it('detecta pico em token morto usando snapshots próprios', () => {
    const hist = Array.from({ length: 30 }, (_, i) => obs(T0 - (100 - i * 3) * 60_000, { pairCreatedAt: old, w5: { volumeUsd: 40 } }));
    const cur = obs(T0, { pairCreatedAt: old, liquidityUsd: 15_000, w5: { volumeUsd: 2_500, buys: 40, sells: 10, priceChangePct: 30 } });
    const r = evaluateRevival(DEFAULT_REVIVAL, cur, hist, T0);
    expect(r.candidate).not.toBeNull();
    expect(r.src).toBe('snapshots');
  });

  it('sem histórico usa estimativa das janelas com confiança baixa', () => {
    const cur = obs(T0, {
      pairCreatedAt: old,
      liquidityUsd: 15_000,
      w5: { volumeUsd: 3000, buys: 40, sells: 10, priceChangePct: 30 },
      h1: { volumeUsd: 3400 },
      h6: { volumeUsd: 3800 },
      h24: { volumeUsd: 9000 },
    });
    const r = evaluateRevival(DEFAULT_REVIVAL, cur, [], T0);
    expect(r.candidate).not.toBeNull();
    expect(r.conf).toBe('low');
  });

  it('não alerta token jovem', () => {
    const cur = obs(T0, { pairCreatedAt: T0 - 3600_000, w5: { volumeUsd: 3000, buys: 40, sells: 10, priceChangePct: 30 } });
    expect(evaluateRevival(DEFAULT_REVIVAL, cur, [], T0).rejects).toEqual(['pair_too_young']);
  });
});
