// Rastreador do operador: acompanha as carteiras cadastradas pela RPC pública da Solana
// (WebSocket logsSubscribe + varredura periódica de segurança) e gera sinais próprios.
// Também recebe do coletor: criação/migração (PumpPortal) e observações (DexScreener).
import { SolanaLogsSocket, SolanaRpc } from '@/adapters/solana-rpc/client';
import { BoundedSet } from '@/adapters/pumpportal/stream';
import type { SourceHealth } from '@/adapters/types';
import { collector } from '@/collector/collector';
import { fmtUsd, shortAddr } from '@/domain/num';
import type { MarketObservation, TrackedToken } from '@/domain/types';
import { onTick } from '@/services/clock';
import { playSound } from '@/services/sound';
import { getState, useStore } from '@/state/store';
import { botsState, bundleSignature, distinctSellers, fastMigrationSeconds, isDump, type SellMark } from './detectors';
import { operatorHooks } from './hooks';
import { actionFromLogs, parseWalletTx, type WalletMove } from './parseTx';
import type { AccountTrade } from '@/adapters/pumpportal/stream';
import { CANDIDATE_KINDS, ROLE_META, type OperatorSignal, type OperatorToken, type OperatorWallet, type SignalKind, type WalletRole } from './types';

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const FARM_MILESTONES = [1, 3, 5, 10, 15];
const MAX_TOKENS = 200;
const OPERATOR_TOKEN_TTL = 24 * 3600_000;

interface QueueItem {
  wallet: string;
  sig: string;
  tries: number;
  notBefore: number;
}

export interface HolderRow {
  owner: string;
  tokens: { mint: string; pct: number | null }[];
  known: WalletRole | null;
}

class OperatorTracker {
  readonly rpc = new SolanaRpc(() => getState().prefs.rpcUrl);
  private socketState: { state: SourceHealth['state']; detail: string | null } = { state: 'off', detail: null };
  private socket = new SolanaLogsSocket(
    () => getState().prefs.rpcUrl,
    (w, sig, logs) => this.onLogs(w, sig, logs),
    (state, detail) => {
      this.socketState = { state, detail: detail ?? null };
    },
  );
  private seen = new BoundedSet(8000);
  private queue: QueueItem[] = [];
  private inflight = 0;
  private createdAt = new Map<string, number>();
  private sellMarks = new Map<string, SellMark[]>();
  private logSells: SellMark[] = [];
  private lastDumpAt = new Map<string, number>();
  private lastFastDump: { at: number; id: string } | null = null;
  private supply = new Map<string, number | null>();
  private lastPollAt = new Map<string, number>();
  private bundleSeen = new BoundedSet(5000);
  private stopTick: (() => void) | null = null;
  private inited = false;
  running = false;

  init() {
    if (this.inited) return;
    this.inited = true;
    operatorHooks.onCreated = (mint, at) => {
      this.createdAt.set(mint, at);
      if (this.createdAt.size > 30_000) {
        const first = this.createdAt.keys().next().value;
        if (first !== undefined) this.createdAt.delete(first);
      }
    };
    operatorHooks.onMigration = (mint, at, symbol) => this.onMigration(mint, at, symbol);
    operatorHooks.onObservation = (t, o, hist) => this.onObservation(t, o, hist);
    operatorHooks.isOperatorToken = (mint) => {
      const t = getState().operator.tokens[mint];
      return !!t && Date.now() - t.firstSeenAt < OPERATOR_TOKEN_TTL;
    };
    operatorHooks.health = () => (getState().operator.wallets.length || this.running ? this.health() : null);
    operatorHooks.isEnabledForUser = () => this.allowed();
    collector.pp.onAccountTrade = (t) => this.onPumpTrade(t);
    useStore.subscribe((st, prev) => {
      if (st.operator.wallets !== prev.operator.wallets) this.syncWallets();
      if (st.operator.settings.enabled !== prev.operator.settings.enabled) {
        if (st.operator.settings.enabled) this.start();
        else this.stop();
      }
      if (st.prefs.pumpPortalKey !== prev.prefs.pumpPortalKey) this.syncPumpPortal();
      if (st.prefs.rpcUrl !== prev.prefs.rpcUrl && this.running) {
        this.socket.stop();
        this.socket.start(this.activeAddresses());
      }
    });
  }

  health(): SourceHealth {
    const h = this.rpc.health();
    const ws = this.socketState;
    const n = this.activeAddresses().length;
    let state = h.state === 'error' ? 'error' : ws.state === 'ok' ? 'ok' : ws.state === 'degraded' ? 'degraded' : h.state;
    if (!this.running) state = 'off';
    return {
      ...h,
      label: 'Solana RPC',
      state: state as SourceHealth['state'],
      detail: ws.detail ?? (this.running ? `${n} carteira(s) monitorada(s)${ws.state === 'ok' ? ' em tempo real' : ''}` : 'Operadores desligado'),
    };
  }

  private activeAddresses() {
    return getState()
      .operator.wallets.filter((w) => w.active)
      .map((w) => w.address);
  }

  /** Quem pode usar o módulo (definido pelo login; no modo local é sempre liberado). */
  allowedForUser: () => boolean = () => true;
  private allowed() {
    return this.allowedForUser();
  }

  private syncPumpPortal() {
    const key = getState().prefs.pumpPortalKey;
    collector.pp.setApiKey(this.running ? key : '');
    collector.pp.setAccounts(this.running && key ? this.activeAddresses() : []);
    collector.applyDiscoveryPrefs();
  }

  start() {
    this.init();
    if (this.running || !getState().operator.settings.enabled || !this.allowed()) return;
    this.running = true;
    const addrs = this.activeAddresses();
    if (addrs.length) this.socket.start(addrs);
    this.stopTick = onTick(() => this.tick());
    this.syncPumpPortal();
  }

  stop() {
    this.running = false;
    this.socket.stop();
    this.stopTick?.();
    this.stopTick = null;
    this.syncPumpPortal();
  }

  private syncWallets() {
    if (!this.running) return;
    this.syncPumpPortal();
    const addrs = this.activeAddresses();
    if (addrs.length) this.socket.start(addrs);
    else this.socket.setWallets([]);
  }

  // ---------- carteiras ----------

  private wallet(address: string): OperatorWallet | undefined {
    return getState().operator.wallets.find((w) => w.address === address);
  }

  private patchWallet(address: string, patch: Partial<OperatorWallet>) {
    const op = getState().operator;
    useStore.setState({ operator: { ...op, wallets: op.wallets.map((w) => (w.address === address ? { ...w, ...patch } : w)) } });
  }

  private label(w: OperatorWallet) {
    return w.label || shortAddr(w.address);
  }

  // ---------- ciclo ----------

  private tick() {
    if (!this.running) return;
    const now = Date.now();
    // processa a fila de transações (até 3 em paralelo; o limitador da RPC segura o ritmo)
    while (this.inflight < 3) {
      const i = this.queue.findIndex((q) => q.notBefore <= now);
      if (i === -1) break;
      const item = this.queue.splice(i, 1)[0];
      this.inflight++;
      void this.process(item).finally(() => this.inflight--);
    }
    // varredura de segurança: 1 carteira por segundo, cada uma a cada 90s (20s se o WebSocket caiu)
    const every = this.socket.connected ? 90_000 : 20_000;
    const due = getState()
      .operator.wallets.filter((w) => w.active)
      .sort((a, b) => (this.lastPollAt.get(a.address) ?? 0) - (this.lastPollAt.get(b.address) ?? 0))[0];
    if (due && now - (this.lastPollAt.get(due.address) ?? 0) >= every && this.queue.length < 30) {
      this.lastPollAt.set(due.address, now);
      void this.poll(due.address);
    }
    // limpa marcas antigas
    if (now % 15_000 < 1000) {
      const cut = now - 120_000;
      this.logSells = this.logSells.filter((m) => m.at >= cut);
      for (const [k, v] of this.sellMarks) {
        const nv = v.filter((m) => m.at >= cut);
        if (nv.length) this.sellMarks.set(k, nv);
        else this.sellMarks.delete(k);
      }
    }
  }

  private async poll(address: string) {
    try {
      const sigs = await this.rpc.getSignatures(address, 10);
      const w = this.wallet(address);
      if (!w) return;
      if (!sigs.length) return;
      if (!w.lastSignature) {
        // primeira varredura: só marca o ponto de partida (não puxa histórico antigo)
        this.patchWallet(address, { lastSignature: sigs[0].signature });
        return;
      }
      const fresh: string[] = [];
      for (const s of sigs) {
        if (s.signature === w.lastSignature) break;
        if (!s.err) fresh.push(s.signature);
      }
      this.patchWallet(address, { lastSignature: sigs[0].signature });
      for (const sig of fresh.reverse()) this.enqueue(address, sig);
    } catch {
      /* erro já registrado no health da RPC */
    }
  }

  private enqueue(wallet: string, sig: string) {
    const key = `${wallet}:${sig}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    this.queue.push({ wallet, sig, tries: 0, notBefore: Date.now() });
  }

  private onLogs(wallet: string, sig: string, logs: string[]) {
    const now = Date.now();
    this.patchWallet(wallet, { lastActivityAt: now, lastSignature: sig });
    // caminho rápido: venda detectada pelos logs, antes de baixar a transação
    if (actionFromLogs(logs) === 'sell') {
      this.logSells.push({ wallet, at: now });
      this.checkFastDump(now);
    }
    this.enqueue(wallet, sig);
  }

  /** Trade vindo do canal pago do PumpPortal (mais rápido e confiável que a RPC pública). */
  private onPumpTrade(t: AccountTrade) {
    if (!this.running) return;
    const key = `${t.wallet}:${t.signature}`;
    if (t.signature && this.seen.has(key)) return;
    if (t.signature) this.seen.add(key);
    const now = Date.now();
    this.patchWallet(t.wallet, { lastActivityAt: now });
    if (t.kind === 'sell') {
      this.logSells.push({ wallet: t.wallet, at: now });
      this.checkFastDump(now);
    }
    void this.handleMove({
      signature: t.signature,
      wallet: t.wallet,
      mint: t.mint,
      kind: t.kind,
      tokenAmount: t.tokenAmount,
      solAmount: t.solAmount,
      at: now,
      venue: t.pool === 'pump' ? 'pump' : 'pumpswap',
      counterparty: null,
    });
  }

  private isDiscarded(mint: string | null) {
    return !!mint && !!getState().operator.discarded[mint];
  }

  private async process(item: QueueItem) {
    try {
      const tx = await this.rpc.getTransaction(item.sig);
      if (!tx) {
        if (item.tries < 3) this.queue.push({ ...item, tries: item.tries + 1, notBefore: Date.now() + 2000 * (item.tries + 1) });
        return;
      }
      for (const m of parseWalletTx(tx, item.wallet)) await this.handleMove(m);
    } catch {
      if (item.tries < 2) this.queue.push({ ...item, tries: item.tries + 1, notBefore: Date.now() + 5000 });
    }
  }

  // ---------- regras ----------

  private tokenRecord(mint: string, reason: SignalKind, symbol?: string | null): OperatorToken {
    const op = getState().operator;
    if (op.discarded[mint]) throw new Error('descartado');
    const existing = op.tokens[mint];
    if (existing) return existing;
    const rec: OperatorToken = {
      mint,
      symbol: symbol ?? getState().tokens[mint]?.meta.symbol ?? null,
      firstSeenAt: Date.now(),
      reason,
      createdAt: this.createdAt.get(mint) ?? null,
      migratedAt: null,
      wallets: {},
      botsState: null,
      lastSignalAt: Date.now(),
    };
    this.saveToken(rec);
    collector.addToken(mint, 'operator', { symbol: rec.symbol });
    return rec;
  }

  private saveToken(rec: OperatorToken) {
    const op = getState().operator;
    let tokens = { ...op.tokens, [rec.mint]: rec };
    const list = Object.values(tokens);
    if (list.length > MAX_TOKENS) {
      list.sort((a, b) => b.lastSignalAt - a.lastSignalAt);
      tokens = Object.fromEntries(list.slice(0, MAX_TOKENS).map((t) => [t.mint, t]));
    }
    useStore.setState({ operator: { ...getState().operator, tokens } });
  }

  private async handleMove(m: WalletMove) {
    const w = this.wallet(m.wallet);
    if (!w || this.isDiscarded(m.mint)) return;
    const now = Date.now();
    const s = getState().operator.settings;
    const known = getState().operator.tokens[m.mint];
    const sym = known?.symbol ?? getState().tokens[m.mint]?.meta.symbol ?? null;
    const isTrade = m.kind === 'buy' || m.kind === 'sell';

    // só cria registro de token quando o movimento tem a ver com o padrão
    if (!known && !(m.kind === 'buy' || m.kind === 'transfer_in' || m.kind === 'transfer_out')) return;
    const rec = { ...this.tokenRecord(m.mint, w.role === 'fazenda' ? 'fazenda' : 'entrada', sym) };
    const pos = { ...(rec.wallets[w.address] ?? { role: w.role, boughtSol: 0, soldSol: 0, buys: 0, sells: 0, lastAt: 0 }) };
    if (m.kind === 'buy') {
      pos.buys++;
      pos.boughtSol += m.solAmount;
    }
    if (m.kind === 'sell') {
      pos.sells++;
      pos.soldSol += m.solAmount;
    }
    pos.lastAt = m.at;
    pos.role = w.role;
    const firstBuyOfWallet = m.kind === 'buy' && (rec.wallets[w.address]?.buys ?? 0) === 0;
    rec.wallets = { ...rec.wallets, [w.address]: pos };
    this.saveToken(rec);
    this.patchWallet(w.address, { lastActivityAt: now });

    if (m.kind === 'buy' && (w.role === 'marcador' || w.role === 'auxiliar')) {
      const already = getState().operator.signals.some((x) => x.kind === 'entrada' && x.mint === m.mint);
      if (!already) {
        this.signal('entrada', m.mint, [w.address], `${ROLE_META[w.role].label} ${this.label(w)} comprou ${m.solAmount.toFixed(3)} SOL — possível lançamento do operador`, m.signature);
      }
    }
    if (m.kind === 'buy' && w.role === 'fazenda' && firstBuyOfWallet) {
      const n = Object.values(rec.wallets).filter((p) => p.role === 'fazenda' && p.buys > 0).length;
      if (FARM_MILESTONES.includes(n)) this.signal('fazenda', m.mint, [w.address], `${n} carteira(s) da fazenda compraram este token`, m.signature);
    }
    if (m.kind === 'sell') {
      const marks = [...(this.sellMarks.get(m.mint) ?? []), { wallet: w.address, at: now }];
      this.sellMarks.set(m.mint, marks);
      if (isDump(marks, now, s.dumpMinWallets, s.dumpWindowS) && now - (this.lastDumpAt.get(m.mint) ?? 0) > 120_000) {
        this.lastDumpAt.set(m.mint, now);
        const sellers = distinctSellers(marks, now, s.dumpWindowS);
        const text = `${sellers.length} carteiras da lista venderam em até ${s.dumpWindowS}s`;
        if (this.lastFastDump && now - this.lastFastDump.at < 60_000) this.updateSignal(this.lastFastDump.id, { mint: m.mint, symbol: sym, text, wallets: sellers });
        else this.signal('despejo', m.mint, sellers, text, m.signature);
      }
    }
    if (!isTrade) {
      const supply = await this.getSupply(m.mint);
      const pct = supply ? (m.tokenAmount / supply) * 100 : null;
      if (pct != null && pct >= s.transferMinPctSupply) {
        const dir = m.kind === 'transfer_out' ? `enviou ${pct.toFixed(1)}% do supply para` : `recebeu ${pct.toFixed(1)}% do supply de`;
        const cp = m.counterparty ? shortAddr(m.counterparty) : 'outra carteira';
        this.signal('transferencia', m.mint, m.counterparty ? [w.address, m.counterparty] : [w.address], `${this.label(w)} ${dir} ${cp} — pode ser preparação de despejo`, m.signature);
      }
    }
  }

  private checkFastDump(now: number) {
    const s = getState().operator.settings;
    const sellers = distinctSellers(this.logSells, now, s.dumpWindowS);
    if (sellers.length < s.dumpMinWallets) return;
    if (this.lastFastDump && now - this.lastFastDump.at < 60_000) return;
    const id = this.signal('despejo', null, sellers, `${sellers.length} carteiras da lista vendendo agora (identificando o token…)`, null);
    this.lastFastDump = { at: now, id };
  }

  private async getSupply(mint: string): Promise<number | null> {
    if (this.supply.has(mint)) return this.supply.get(mint) ?? null;
    try {
      const v = await this.rpc.getTokenSupply(mint);
      this.supply.set(mint, v);
      return v;
    } catch {
      return null;
    }
  }

  private onMigration(mint: string, at: number, symbol: string | null) {
    const s = getState().operator.settings;
    const known = getState().operator.tokens[mint];
    if (known) this.saveToken({ ...known, migratedAt: at });
    if (!s.enabled || !s.detectFastMigration || !this.running || this.isDiscarded(mint)) return;
    const secs = fastMigrationSeconds(this.createdAt.get(mint) ?? null, at, s.fastMigrationMaxS);
    if (secs == null) return;
    const rec = this.tokenRecord(mint, 'migracao_rapida', symbol);
    this.saveToken({ ...rec, migratedAt: at, createdAt: this.createdAt.get(mint) ?? rec.createdAt });
    const t = secs < 60 ? `${Math.round(secs)}s` : `${Math.floor(secs / 60)}m${String(Math.round(secs % 60)).padStart(2, '0')}s`;
    this.signal('migracao_rapida', mint, [], `Migrou para o PumpSwap ${t} depois de criado (padrão de bundle no lançamento)`, null);
  }

  private onObservation(t: TrackedToken, o: MarketObservation, hist: MarketObservation[]) {
    const s = getState().operator.settings;
    if (!s.enabled || !this.running) return;
    const now = Date.now();
    const mint = t.address;
    if (this.isDiscarded(mint)) return;
    if (s.detectBundle && !this.bundleSeen.has(mint)) {
      const b = bundleSignature(o, now, s.bundleMaxAgeS, s.bundleMinAvgBuyUsd);
      if (b) {
        this.bundleSeen.add(mint);
        this.tokenRecord(mint, 'bundle', t.meta.symbol);
        const age = o.pairCreatedAt ? Math.round((now - o.pairCreatedAt) / 1000) : null;
        this.signal('bundle', mint, [], `${b.buys} compras somando ${fmtUsd(b.vol)} (média ${fmtUsd(b.avg)}) ${age != null ? `nos primeiros ${age}s` : 'logo no lançamento'}, quase sem vendas`, null);
      }
    }
    const rec = getState().operator.tokens[mint];
    if (rec) {
      const next = botsState(hist, o, s.botsOffRatio, rec.botsState);
      const patch: Partial<OperatorToken> = {};
      if (t.meta.symbol && rec.symbol !== t.meta.symbol) patch.symbol = t.meta.symbol;
      if (next !== rec.botsState) {
        patch.botsState = next;
        const w = o.windows['5m'];
        const tx = w.buys != null && w.sells != null ? w.buys + w.sells : null;
        if (rec.botsState != null && next === 'off') this.signal('bots_off', mint, [], `Transações em 5m caíram para ${tx ?? '—'} — volume artificial pode ter sido desligado`, null);
        if (rec.botsState === 'off' && next === 'on') this.signal('bots_on', mint, [], `Transações em 5m voltaram a subir (${tx ?? '—'}) — volume ligado de novo`, null);
      }
      if (Object.keys(patch).length) this.saveToken({ ...getState().operator.tokens[mint], ...patch });
    }
  }

  // ---------- sinais ----------

  private signal(kind: SignalKind, mint: string | null, wallets: string[], text: string, signature: string | null): string {
    const st = getState();
    if (this.isDiscarded(mint)) return '';
    const sym = mint ? st.operator.tokens[mint]?.symbol ?? st.tokens[mint]?.meta.symbol ?? null : null;
    const sig: OperatorSignal = {
      id: uid(),
      kind,
      at: Date.now(),
      mint,
      symbol: sym,
      wallets,
      text,
      mcap: mint ? st.tokens[mint]?.lastObservation?.marketCapUsd ?? null : null,
      signature,
    };
    const op = getState().operator;
    const tokens = mint && op.tokens[mint] ? { ...op.tokens, [mint]: { ...op.tokens[mint], lastSignalAt: sig.at } } : op.tokens;
    useStore.setState({ operator: { ...op, tokens, signals: [sig, ...op.signals].slice(0, 300), unread: op.unread + 1 } });
    this.notify(sig);
    return sig.id;
  }

  private updateSignal(id: string, patch: Partial<OperatorSignal>) {
    const op = getState().operator;
    useStore.setState({ operator: { ...op, signals: op.signals.map((x) => (x.id === id ? { ...x, ...patch } : x)) } });
  }

  private notify(sig: OperatorSignal) {
    const st = getState();
    const s = st.operator.settings;
    const candidate = CANDIDATE_KINDS.includes(sig.kind);
    if (sig.mint && st.prefs.muteScamSound && st.scams[sig.mint]) return;
    if (!st.prefs.soundMuted && (!candidate || s.soundOnCandidates)) {
      void playSound(sig.kind === 'despejo' ? s.dumpSoundId : s.soundId, s.volume);
    }
    if (s.notify && (!candidate || s.soundOnCandidates) && st.prefs.notifEnabled && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try {
        new Notification(`Operador · ${sig.symbol ?? (sig.mint ? shortAddr(sig.mint) : '')}`, { body: sig.text, icon: '/favicon.svg', tag: `op-${sig.id}` });
      } catch {
        /* ignore */
      }
    }
    window.dispatchEvent(new CustomEvent('bh:operator-signal', { detail: sig }));
  }

  // ---------- ações da página ----------

  addWallets(addresses: string[], role: WalletRole, label = ''): number {
    const op = getState().operator;
    const have = new Set(op.wallets.map((w) => w.address));
    const fresh = addresses
      .filter((a) => !have.has(a))
      .map((address, i) => ({
        address,
        label: addresses.length === 1 ? label : label ? `${label} ${i + 1}` : '',
        role,
        active: true,
        addedAt: Date.now(),
        lastActivityAt: null,
        lastSignature: null,
      }));
    if (fresh.length) useStore.setState({ operator: { ...op, wallets: [...op.wallets, ...fresh].slice(0, 150) } });
    return fresh.length;
  }

  /** "É ele": guarda o token na lista de confirmados. */
  confirm(mint: string, note = '') {
    const st = getState();
    const op = st.operator;
    const symbol = op.tokens[mint]?.symbol ?? st.tokens[mint]?.meta.symbol ?? null;
    const discarded = { ...op.discarded };
    delete discarded[mint];
    useStore.setState({ operator: { ...op, discarded, confirmed: { ...op.confirmed, [mint]: { at: Date.now(), symbol, note: op.confirmed[mint]?.note ?? note } } } });
    if (!st.tokens[mint]) collector.addToken(mint, 'operator', { symbol });
  }

  /** "Não é ele": oculta tudo daquele token e ignora sinais futuros dele. */
  discard(mint: string) {
    const op = getState().operator;
    const tokens = { ...op.tokens };
    delete tokens[mint];
    const confirmed = { ...op.confirmed };
    delete confirmed[mint];
    useStore.setState({ operator: { ...op, tokens, confirmed, discarded: { ...op.discarded, [mint]: Date.now() }, signals: op.signals.filter((s) => s.mint !== mint) } });
  }

  undiscard(mint: string) {
    const op = getState().operator;
    const discarded = { ...op.discarded };
    delete discarded[mint];
    useStore.setState({ operator: { ...op, discarded } });
  }

  /** Relatório em texto (Markdown) dos tokens confirmados, para colar no chat e analisar. */
  async report(onProgress?: (d: number, t: number) => void): Promise<string> {
    const st = getState();
    const op = st.operator;
    const mints = Object.keys(op.confirmed);
    const lines: string[] = [`# Relatório do operador — ${new Date().toLocaleString('pt-BR')}`, '', `Tokens confirmados: ${mints.length}`, ''];
    const fmtT = (ms: number | null | undefined) => (ms ? new Date(ms).toLocaleString('pt-BR') : '—');
    let i = 0;
    for (const mint of mints) {
      const c = op.confirmed[mint];
      const rec = op.tokens[mint];
      const tok = getState().tokens[mint];
      let pairs: Awaited<ReturnType<typeof collector.ds.tokenPairs>> = [];
      try {
        pairs = await collector.ds.tokenPairs(mint);
      } catch {
        pairs = [];
      }
      onProgress?.(++i, mints.length);
      const curve = pairs.find((p) => p.observation.dexId === 'pumpfun');
      const pools = pairs.filter((p) => p.observation.dexId !== 'pumpfun').sort((a, b) => (b.observation.liquidityUsd ?? 0) - (a.observation.liquidityUsd ?? 0));
      const main = pools[0]?.observation ?? curve?.observation ?? tok?.lastObservation ?? null;
      const firstPool = pools.map((p) => p.observation.pairCreatedAt).filter((x): x is number => x != null).sort((a, b) => a - b)[0] ?? null;
      const created = curve?.observation.pairCreatedAt ?? rec?.createdAt ?? null;
      const migS = created && firstPool ? Math.round((firstPool - created) / 1000) : null;
      const w24 = main?.windows['24h'];
      lines.push(`## ${c.symbol ?? tok?.meta.symbol ?? mint.slice(0, 6)} — \`${mint}\``);
      lines.push(`- GMGN: https://gmgn.ai/sol/token/${mint}`);
      lines.push(`- Criado (curva): ${fmtT(created)} · Primeiro pool: ${fmtT(firstPool)} · Tempo até migrar: ${migS != null ? `${migS}s` : '—'}`);
      lines.push(`- Agora: MCAP ${fmtUsd(main?.marketCapUsd)} · Liquidez ${fmtUsd(main?.liquidityUsd)} · Vol 24h ${fmtUsd(w24?.volumeUsd)} · Txns 24h ${w24?.buys ?? '—'}/${w24?.sells ?? '—'} · Variação 24h ${w24?.priceChangePct != null ? `${w24.priceChangePct.toFixed(0)}%` : '—'}`);
      lines.push(`- Perfil pago no DexScreener: ${pairs.some((p) => p.hasProfile) ? 'sim' : 'não'} · Pares: ${pairs.map((p) => p.observation.dexId).join(', ') || '—'}`);
      lines.push(`- Pico observado pelo bot: ${fmtUsd(tok?.observedPeakMcap)}${tok?.observedPeakAt ? ` em ${fmtT(tok.observedPeakAt)}` : ''}`);
      const sigs = op.signals.filter((s) => s.mint === mint);
      if (sigs.length) lines.push(`- Sinais: ${sigs.map((s) => `${s.kind} ${new Date(s.at).toLocaleTimeString('pt-BR')}${s.mcap != null ? ` (${fmtUsd(s.mcap)})` : ''}`).join('; ')}`);
      const ws = Object.entries(rec?.wallets ?? {});
      if (ws.length) lines.push(`- Carteiras da lista: ${ws.map(([a, p]) => `${p.role} ${a} compras ${p.buys} (${p.boughtSol.toFixed(2)} SOL) vendas ${p.sells} (${p.soldSol.toFixed(2)} SOL)`).join('; ')}`);
      if (c.note) lines.push(`- Nota: ${c.note}`);
      lines.push('');
    }
    return lines.join('\n');
  }

  /** Cruza os maiores holders de vários tokens: carteiras que se repetem são candidatas a fazenda. */
  async discoverHolders(mints: string[], onProgress: (done: number, total: number, err?: string) => void): Promise<HolderRow[]> {
    const byOwner = new Map<string, { mint: string; pct: number | null }[]>();
    let done = 0;
    for (const mint of mints) {
      try {
        const pair = getState().tokens[mint]?.lastObservation?.pairAddress;
        const rows = await this.rpc.topHolders(mint, pair ? [pair] : []);
        for (const r of rows) byOwner.set(r.owner, [...(byOwner.get(r.owner) ?? []), { mint, pct: r.pct }]);
        onProgress(++done, mints.length);
      } catch (e) {
        onProgress(++done, mints.length, `${shortAddr(mint)}: ${(e as Error).message}`);
      }
    }
    const roles = new Map(getState().operator.wallets.map((w) => [w.address, w.role]));
    return [...byOwner.entries()]
      .map(([owner, tokens]) => ({ owner, tokens, known: roles.get(owner) ?? null }))
      .sort((a, b) => b.tokens.length - a.tokens.length || (b.tokens[0]?.pct ?? 0) - (a.tokens[0]?.pct ?? 0));
  }
}

export const operatorTracker = new OperatorTracker();
