import { describe, expect, it } from 'vitest';
import { normalizePair, selectPrimaryPair, type DsPair } from './dexscreener/normalize';
import { parsePumpPortalMessage, BoundedSet } from './pumpportal/stream';

const TOKEN = 'MintAAA111pump';

const curve: DsPair = {
  chainId: 'solana',
  dexId: 'pumpfun',
  pairAddress: 'CURVE',
  baseToken: { address: TOKEN, symbol: 'AAA' },
  quoteToken: { symbol: 'SOL' },
  marketCap: 40000,
  volume: { m5: 1200, h1: 5000 },
  txns: { m5: { buys: 10, sells: 3 } },
  priceChange: { m5: 12 },
};
const pool: DsPair = {
  ...curve,
  dexId: 'pumpswap',
  pairAddress: 'POOL',
  liquidity: { usd: 30000 },
  volume: { h24: 90000, m5: 800 },
};

describe('DexScreener normalize', () => {
  it('bonding curve sem liquidez fica null, não zero', () => {
    const o = normalizePair(curve, 1)!;
    expect(o.liquidityUsd).toBeNull();
    expect(o.windows['5m'].volumeUsd).toBe(1200);
    expect(o.windows['24h'].volumeUsd).toBeNull();
    expect(o.windows['6h'].buys).toBeNull();
  });

  it('marketCap ausente usa fdv marcado como fallback', () => {
    const o = normalizePair({ ...curve, marketCap: undefined, fdv: 99 }, 1)!;
    expect(o.marketCapUsd).toBe(99);
    expect(o.mcapBasis).toBe('fdv_fallback');
    const n = normalizePair({ ...curve, marketCap: undefined }, 1)!;
    expect(n.marketCapUsd).toBeNull();
    expect(n.mcapBasis).toBeNull();
  });

  it('prefere o pool migrado com liquidez à bonding curve', () => {
    expect(selectPrimaryPair([curve, pool], TOKEN)?.pairAddress).toBe('POOL');
    expect(selectPrimaryPair([curve, pool], TOKEN, 'CURVE')?.pairAddress).toBe('POOL');
  });

  it('ignora outras chains e pares em que o token é a quote', () => {
    const other = { ...pool, chainId: 'bsc', pairAddress: 'BSC' };
    const asQuote = { ...pool, pairAddress: 'Q', baseToken: { address: 'X' } };
    expect(selectPrimaryPair([other, asQuote], TOKEN)).toBeNull();
  });
});

describe('PumpPortal', () => {
  it('converte criação e migração e ignora outros pools e mensagens', () => {
    expect(parsePumpPortalMessage(JSON.stringify({ txType: 'create', mint: 'M1', name: 'N', symbol: 'S', signature: 'sig', pool: 'pump' }))).toMatchObject({ address: 'M1', source: 'pumpportal_new' });
    expect(parsePumpPortalMessage(JSON.stringify({ txType: 'migrate', mint: 'M2' }))?.source).toBe('pumpportal_migrated');
    expect(parsePumpPortalMessage(JSON.stringify({ txType: 'create', mint: 'M3', pool: 'bonk' }))).toBeNull();
    expect(parsePumpPortalMessage(JSON.stringify({ message: 'Successfully subscribed' }))).toBeNull();
    expect(parsePumpPortalMessage(JSON.stringify({ txType: 'buy', mint: 'M4' }))).toBeNull();
    expect(parsePumpPortalMessage('not json')).toBeNull();
  });

  it('dedupe com limite de memória', () => {
    const s = new BoundedSet(2);
    s.add('a');
    s.add('b');
    s.add('c');
    expect(s.has('a')).toBe(false);
    expect(s.has('c')).toBe(true);
  });
});
