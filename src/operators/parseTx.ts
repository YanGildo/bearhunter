// Converte uma transação da Solana (getTransaction, encoding jsonParsed) nos movimentos
// de uma carteira: compra, venda ou transferência de token. Função pura e testada.

export const PUMP_PROGRAM = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
export const PUMPSWAP_PROGRAM = 'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA';
export const WSOL_MINT = 'So11111111111111111111111111111111111111112';

export type WalletMoveKind = 'buy' | 'sell' | 'transfer_in' | 'transfer_out';

export interface WalletMove {
  signature: string;
  wallet: string;
  mint: string;
  kind: WalletMoveKind;
  tokenAmount: number; // sempre positivo
  solAmount: number; // sempre positivo (0 em transferências)
  at: number; // epoch ms
  venue: 'pump' | 'pumpswap' | 'other';
  counterparty: string | null; // em transferências: a outra carteira
}

interface TokenBal {
  accountIndex: number;
  mint: string;
  owner?: string;
  uiTokenAmount?: { amount?: string; decimals?: number };
}

export interface RpcTx {
  blockTime?: number | null;
  meta?: {
    err?: unknown;
    fee?: number;
    preBalances?: number[];
    postBalances?: number[];
    preTokenBalances?: TokenBal[];
    postTokenBalances?: TokenBal[];
    logMessages?: string[];
  } | null;
  transaction?: {
    signatures?: string[];
    message?: { accountKeys?: (string | { pubkey: string })[] };
  };
}

const DUST_SOL = 0.002; // abaixo disso é só taxa

function amount(b: TokenBal): number {
  const raw = Number(b.uiTokenAmount?.amount ?? '0');
  const dec = b.uiTokenAmount?.decimals ?? 0;
  return raw / 10 ** dec;
}

/** Ação indicada pelos logs (rápido, sem precisar da transação inteira). */
export function actionFromLogs(logs: string[] | undefined | null): 'buy' | 'sell' | null {
  if (!logs) return null;
  let buy = false;
  let sell = false;
  for (const l of logs) {
    if (/Instruction: (Buy|BuyExactIn|BuyExactSolIn)\b/.test(l)) buy = true;
    else if (/Instruction: Sell\b/.test(l)) sell = true;
  }
  if (sell && !buy) return 'sell';
  if (buy && !sell) return 'buy';
  return null;
}

export function parseWalletTx(tx: RpcTx | null | undefined, wallet: string): WalletMove[] {
  if (!tx?.meta || tx.meta.err) return [];
  const sig = tx.transaction?.signatures?.[0] ?? '';
  const keys = (tx.transaction?.message?.accountKeys ?? []).map((k) => (typeof k === 'string' ? k : k.pubkey));
  const at = (tx.blockTime ?? Math.floor(Date.now() / 1000)) * 1000;
  const venue: WalletMove['venue'] = keys.includes(PUMP_PROGRAM) ? 'pump' : keys.includes(PUMPSWAP_PROGRAM) ? 'pumpswap' : 'other';

  const idx = keys.indexOf(wallet);
  let solDelta = 0;
  if (idx >= 0) {
    const pre = tx.meta.preBalances?.[idx];
    const post = tx.meta.postBalances?.[idx];
    if (pre != null && post != null) solDelta = (post - pre) / 1e9;
  }

  // variação de cada mint por dono
  const deltas = new Map<string, Map<string, number>>(); // mint -> owner -> delta
  const add = (b: TokenBal, sign: 1 | -1) => {
    if (!b.owner) return;
    const m = deltas.get(b.mint) ?? new Map<string, number>();
    m.set(b.owner, (m.get(b.owner) ?? 0) + sign * amount(b));
    deltas.set(b.mint, m);
  };
  for (const b of tx.meta.preTokenBalances ?? []) add(b, -1);
  for (const b of tx.meta.postTokenBalances ?? []) add(b, 1);

  // WSOL da própria carteira conta como SOL
  const wsol = deltas.get(WSOL_MINT)?.get(wallet);
  if (wsol) solDelta += wsol;

  const out: WalletMove[] = [];
  for (const [mint, owners] of deltas) {
    if (mint === WSOL_MINT) continue;
    const d = owners.get(wallet) ?? 0;
    if (Math.abs(d) < 1e-9) continue;
    let kind: WalletMoveKind;
    if (d > 0) kind = solDelta < -DUST_SOL ? 'buy' : 'transfer_in';
    else kind = solDelta > DUST_SOL / 4 ? 'sell' : 'transfer_out';
    let counterparty: string | null = null;
    if (kind === 'transfer_in' || kind === 'transfer_out') {
      let best = 0;
      for (const [owner, od] of owners) {
        if (owner === wallet) continue;
        if (Math.sign(od) === -Math.sign(d) && Math.abs(od) > best) {
          best = Math.abs(od);
          counterparty = owner;
        }
      }
    }
    out.push({
      signature: sig,
      wallet,
      mint,
      kind,
      tokenAmount: Math.abs(d),
      solAmount: kind === 'buy' || kind === 'sell' ? Math.abs(solDelta) : 0,
      at,
      venue,
      counterparty,
    });
  }
  return out;
}
