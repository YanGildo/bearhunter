import { describe, expect, it } from 'vitest';
import { actionFromLogs, parseWalletTx, PUMP_PROGRAM, PUMPSWAP_PROGRAM, type RpcTx } from './parseTx';
import { botsState, bundleSignature, distinctSellers, extractAddresses, fastMigrationSeconds, isDump } from './detectors';
import { soundLevel } from '@/domain/engine';
import type { MarketObservation, WindowMetrics } from '@/domain/types';

const W = 'Wa11et1111111111111111111111111111111111111';
const OTHER = 'Other22222222222222222222222222222222222222';
const MINT = 'Mint333333333333333333333333333333333333pump';

function tx(opts: { solPre: number; solPost: number; tokPre: number; tokPost: number; otherPre?: number; otherPost?: number; program?: string; err?: unknown }): RpcTx {
  const bal = (owner: string, ui: number, idx: number) => ({ accountIndex: idx, mint: MINT, owner, uiTokenAmount: { amount: String(Math.round(ui * 1e6)), decimals: 6 } });
  return {
    blockTime: 1_800_000_000,
    meta: {
      err: opts.err ?? null,
      fee: 5000,
      preBalances: [opts.solPre * 1e9, 0],
      postBalances: [opts.solPost * 1e9, 0],
      preTokenBalances: [bal(W, opts.tokPre, 2), ...(opts.otherPre != null ? [bal(OTHER, opts.otherPre, 3)] : [])],
      postTokenBalances: [bal(W, opts.tokPost, 2), ...(opts.otherPost != null ? [bal(OTHER, opts.otherPost, 3)] : [])],
    },
    transaction: { signatures: ['SIG1'], message: { accountKeys: [{ pubkey: W }, { pubkey: opts.program ?? PUMP_PROGRAM }] } },
  };
}

describe('parseWalletTx', () => {
  it('compra: token entra e SOL sai', () => {
    const [m] = parseWalletTx(tx({ solPre: 1, solPost: 0.948, tokPre: 0, tokPost: 1_500_000 }), W);
    expect(m.kind).toBe('buy');
    expect(m.solAmount).toBeCloseTo(0.052);
    expect(m.venue).toBe('pump');
  });
  it('venda: token sai e SOL entra', () => {
    const [m] = parseWalletTx(tx({ solPre: 0, solPost: 3.3, tokPre: 6_500_000, tokPost: 0, program: PUMPSWAP_PROGRAM }), W);
    expect(m.kind).toBe('sell');
    expect(m.venue).toBe('pumpswap');
  });
  it('transferência: token sai sem SOL e identifica quem recebeu', () => {
    const [m] = parseWalletTx(tx({ solPre: 0.1, solPost: 0.09999, tokPre: 164_700_000, tokPost: 0, otherPre: 0, otherPost: 164_700_000, program: 'Tokenkeg' }), W);
    expect(m.kind).toBe('transfer_out');
    expect(m.counterparty).toBe(OTHER);
    expect(m.tokenAmount).toBeCloseTo(164_700_000);
  });
  it('transação com erro é ignorada', () => {
    expect(parseWalletTx(tx({ solPre: 1, solPost: 0.9, tokPre: 0, tokPost: 10, err: { x: 1 } }), W)).toEqual([]);
  });
  it('logs indicam compra/venda', () => {
    expect(actionFromLogs(['Program log: Instruction: Sell'])).toBe('sell');
    expect(actionFromLogs(['Program log: Instruction: Buy'])).toBe('buy');
    expect(actionFromLogs(['Program log: Instruction: Transfer'])).toBeNull();
  });
});

describe('detectores', () => {
  it('despejo: 3 carteiras diferentes vendendo em até 10s', () => {
    const now = 1_000_000;
    const marks = [
      { wallet: 'a', at: now - 2000 },
      { wallet: 'a', at: now - 1000 },
      { wallet: 'b', at: now - 500 },
    ];
    expect(isDump(marks, now, 3, 10)).toBe(false);
    expect(isDump([...marks, { wallet: 'c', at: now }], now, 3, 10)).toBe(true);
    expect(distinctSellers([{ wallet: 'x', at: now - 60_000 }], now, 10)).toEqual([]);
  });
  it('migração rápida', () => {
    expect(fastMigrationSeconds(1000, 147_000, 360)).toBe(146);
    expect(fastMigrationSeconds(1000, 1000 + 400_000, 360)).toBeNull();
    expect(fastMigrationSeconds(null, 5000, 360)).toBeNull();
  });

  const win = (v: Partial<WindowMetrics>): WindowMetrics => ({ volumeUsd: null, buys: null, sells: null, priceChangePct: null, ...v });
  const obs = (t: number, w5: Partial<WindowMetrics>, extra: Partial<MarketObservation> = {}): MarketObservation => ({
    tokenAddress: MINT,
    pairAddress: 'P',
    dexId: 'pumpfun',
    quoteSymbol: 'SOL',
    source: 't',
    observedAt: t,
    priceUsd: 1,
    priceNative: 1,
    marketCapUsd: 33000,
    mcapBasis: 'reported',
    fdvUsd: 33000,
    liquidityUsd: null,
    pairCreatedAt: t - 40_000,
    boostsActive: null,
    windows: { '5m': win(w5), '1h': win(w5), '6h': win({}), '24h': win({}) },
    ...extra,
  });

  it('bundle: poucas compras grandes logo no lançamento', () => {
    const now = 2_000_000_000_000;
    expect(bundleSignature(obs(now, { volumeUsd: 13_000, buys: 7, sells: 0 }), now, 180, 500)).not.toBeNull();
    expect(bundleSignature(obs(now, { volumeUsd: 13_000, buys: 300, sells: 120 }), now, 180, 500)).toBeNull();
    expect(bundleSignature(obs(now, { volumeUsd: 13_000, buys: 7, sells: 0 }, { pairCreatedAt: now - 3600_000 }), now, 180, 500)).toBeNull();
  });

  it('bots de volume: queda forte de transações = off; volta = on', () => {
    const t0 = 2_000_000_000_000;
    const hist = [0, 1, 2, 3].map((i) => obs(t0 + i * 30_000, { buys: 600, sells: 500 }));
    const low = obs(t0 + 150_000, { buys: 100, sells: 90 });
    expect(botsState(hist, low, 0.3, 'on')).toBe('off');
    const back = obs(t0 + 180_000, { buys: 500, sells: 400 });
    expect(botsState([...hist, low], back, 0.3, 'off')).toBe('on');
  });

  it('extrai endereços de links', () => {
    const t = 'https://gmgn.ai/sol/address/8c3ssYCwFCyLv5yf11UF9FPznkS6i4VrNtRSNtmjifEe e https://solscan.io/token/836WHSkEp2KozMQ53MGPMci1zr2DHHsjQ6A7FEYzpump#metadata';
    expect(extractAddresses(t)).toEqual(['8c3ssYCwFCyLv5yf11UF9FPznkS6i4VrNtRSNtmjifEe', '836WHSkEp2KozMQ53MGPMci1zr2DHHsjQ6A7FEYzpump']);
  });
});

describe('indicadores', () => {
  it('nível do som pela subida de volume', () => {
    expect(soundLevel(60, 100, 200)).toBe('normal');
    expect(soundLevel(150, 100, 200)).toBe('critical');
    expect(soundLevel(250, 100, 200)).toBe('mega');
    expect(soundLevel(null, 100, 200)).toBe('normal');
  });
});
