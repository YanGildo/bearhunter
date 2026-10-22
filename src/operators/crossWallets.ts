// Cruza o histórico recente de várias carteiras (as que você viu trabalhando nos pares do operador)
// para achar: tokens em comum, quem entrou junto (mesmos segundos) e quem vendeu junto. Função pura.
import type { WalletMove } from './parseTx';

export interface WalletInToken {
  wallet: string;
  firstBuyAt: number | null;
  buySol: number;
  sellSol: number;
  lastSellAt: number | null;
  buys: number;
  sells: number;
}

export interface SharedToken {
  mint: string;
  wallets: WalletInToken[];
  /** diferença entre a primeira e a última "primeira compra" das carteiras (s) */
  buySpreadS: number | null;
  /** diferença entre as últimas vendas (s), entre as que venderam */
  sellSpreadS: number | null;
  firstBuyAt: number | null;
}

export interface WalletSummary {
  wallet: string;
  txs: number;
  tokens: number;
  /** tokens que esta carteira tem em comum com pelo menos outra da lista */
  shared: number;
  /** vezes que comprou um token em comum a até N s de outra carteira da lista */
  syncBuys: number;
  /** vezes que vendeu um token em comum a até N s de outra carteira da lista */
  syncSells: number;
  boughtSol: number;
  soldSol: number;
  /** sugestão de papel, só uma dica: quem entra primeiro com pouco = marcador; quem vende junto = fazenda */
  hint: 'marcador' | 'fazenda' | 'auxiliar' | null;
  firstAt: number | null;
  lastAt: number | null;
}

export interface CrossResult {
  wallets: WalletSummary[];
  shared: SharedToken[];
}

const IGNORE_MINTS = new Set(['So11111111111111111111111111111111111111112', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB']);

export function crossWallets(moves: Map<string, WalletMove[]>, windowS = 10): CrossResult {
  const perToken = new Map<string, Map<string, WalletInToken>>();
  const txCount = new Map<string, Set<string>>();
  for (const [wallet, list] of moves) {
    txCount.set(wallet, new Set(list.map((m) => m.signature)));
    for (const m of list) {
      if (IGNORE_MINTS.has(m.mint) || (m.kind !== 'buy' && m.kind !== 'sell')) continue;
      const byW = perToken.get(m.mint) ?? new Map<string, WalletInToken>();
      const w = byW.get(wallet) ?? { wallet, firstBuyAt: null, buySol: 0, sellSol: 0, lastSellAt: null, buys: 0, sells: 0 };
      if (m.kind === 'buy') {
        w.buys++;
        w.buySol += m.solAmount;
        w.firstBuyAt = w.firstBuyAt == null ? m.at : Math.min(w.firstBuyAt, m.at);
      } else {
        w.sells++;
        w.sellSol += m.solAmount;
        w.lastSellAt = w.lastSellAt == null ? m.at : Math.max(w.lastSellAt, m.at);
      }
      byW.set(wallet, w);
      perToken.set(m.mint, byW);
    }
  }

  const shared: SharedToken[] = [];
  for (const [mint, byW] of perToken) {
    if (byW.size < 2) continue;
    const ws = [...byW.values()].sort((a, b) => (a.firstBuyAt ?? Infinity) - (b.firstBuyAt ?? Infinity));
    const buys = ws.map((w) => w.firstBuyAt).filter((v): v is number => v != null);
    const sells = ws.map((w) => w.lastSellAt).filter((v): v is number => v != null);
    shared.push({
      mint,
      wallets: ws,
      buySpreadS: buys.length >= 2 ? (Math.max(...buys) - Math.min(...buys)) / 1000 : null,
      sellSpreadS: sells.length >= 2 ? (Math.max(...sells) - Math.min(...sells)) / 1000 : null,
      firstBuyAt: buys.length ? Math.min(...buys) : null,
    });
  }
  shared.sort((a, b) => b.wallets.length - a.wallets.length || (b.firstBuyAt ?? 0) - (a.firstBuyAt ?? 0));

  const near = (a: number | null, others: (number | null)[]) => a != null && others.some((o) => o != null && Math.abs(o - a) <= windowS * 1000);

  const wallets: WalletSummary[] = [...moves.keys()].map((wallet) => {
    let tokens = 0;
    let sharedN = 0;
    let syncBuys = 0;
    let syncSells = 0;
    let boughtSol = 0;
    let soldSol = 0;
    let firstBuyRank = 0;
    let smallFirst = 0;
    for (const [mint, byW] of perToken) {
      const me = byW.get(wallet);
      if (!me) continue;
      tokens++;
      boughtSol += me.buySol;
      soldSol += me.sellSol;
      if (byW.size < 2) continue;
      sharedN++;
      const others = [...byW.values()].filter((w) => w.wallet !== wallet);
      if (near(me.firstBuyAt, others.map((o) => o.firstBuyAt))) syncBuys++;
      if (near(me.lastSellAt, others.map((o) => o.lastSellAt))) syncSells++;
      const st = shared.find((s) => s.mint === mint);
      if (st && st.wallets[0]?.wallet === wallet && me.firstBuyAt != null) {
        firstBuyRank++;
        if (me.buySol > 0 && me.buySol <= 0.2) smallFirst++;
      }
    }
    const times = (moves.get(wallet) ?? []).map((m) => m.at);
    let hint: WalletSummary['hint'] = null;
    if (sharedN >= 2 && smallFirst >= Math.max(1, Math.ceil(sharedN / 2))) hint = 'marcador';
    else if (syncSells >= 2) hint = 'fazenda';
    else if (sharedN >= 2) hint = 'auxiliar';
    void firstBuyRank;
    return {
      wallet,
      txs: txCount.get(wallet)?.size ?? 0,
      tokens,
      shared: sharedN,
      syncBuys,
      syncSells,
      boughtSol,
      soldSol,
      hint,
      firstAt: times.length ? Math.min(...times) : null,
      lastAt: times.length ? Math.max(...times) : null,
    };
  });
  wallets.sort((a, b) => b.shared - a.shared || b.syncSells - a.syncSells || b.syncBuys - a.syncBuys);
  return { wallets, shared };
}
