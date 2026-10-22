// Coletor: roda no navegador enquanto o painel está aberto.
// Fonte externa → adapter → modelo interno → snapshots → motor de alertas → store → UI.
import { DexScreenerAdapter } from '@/adapters/dexscreener/client';
import { PumpPortalAdapter } from '@/adapters/pumpportal/stream';
import type { DiscoveredToken, MarketFetchResult } from '@/adapters/types';
import { dedupeKey, evaluateRevival, evaluateTimeframe, soundLevel, type Candidate } from '@/domain/engine';
import { fmtUsd } from '@/domain/num';
import { PRESET_META } from '@/domain/presets';
import type { Alert, DiscoverySource, IndicatorConfig, MarketObservation, MyAlert, PresetKey, TimeframeConfig, TokenMeta, TrackedToken } from '@/domain/types';
import { PRESET_KEYS } from '@/domain/types';
import { getState, useStore } from '@/state/store';
import { store as db } from '@/storage/db';
import { playSound } from '@/services/sound';
import { onTick } from '@/services/clock';
import { operatorHooks } from '@/operators/hooks';

const SOLANA_ADDR = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const BLUE_CHIPS = new Set(['SOL', 'WSOL', 'USDC', 'USDT', 'WETH', 'ETH', 'WBTC', 'BTC', 'CBBTC', 'JITOSOL', 'MSOL', 'BSOL', 'USD1', 'PYUSD', 'EURC', 'USDS']);
const MAX_AUTO_MCAP = 250_000_000; // acima disso não é memecoin em movimento: sai da lista automática
const SNAPSHOT_PERSIST_MS = 5 * 60_000;
const SNAPSHOT_RETENTION_MS = 48 * 3600_000;
const HISTORY_FULL_MS = 20 * 60_000;
const HISTORY_SPARSE_STEP_MS = 10 * 60_000;
const HISTORY_MAX_MS = 24 * 3600_000;
const MAX_CONCURRENT = 4;

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

export function isValidSolanaAddress(a: string) {
  return SOLANA_ADDR.test(a.trim());
}

function emptyMeta(address: string, d?: Partial<DiscoveredToken>): TokenMeta {
  return { address, name: d?.name ?? null, symbol: d?.symbol ?? null, imageUrl: d?.imageUrl ?? null, websites: [], socials: [] };
}

class Collector {
  readonly ds = new DexScreenerAdapter(() => getState().prefs.dsBaseUrl);
  readonly pp = new PumpPortalAdapter(() => getState().prefs.netRoute ?? 'auto');
  private history = new Map<string, MarketObservation[]>();
  private debug = new Map<string, Record<string, string[]>>();
  private lastAlertAt = new Map<string, number>();
  private lastEvalAt = new Map<string, number>();
  private lastPersistAt = new Map<string, number>();
  private soundAt = new Map<string, number>();
  private notifAt = new Map<string, number>();
  private inflight = new Set<string>();
  private batches = 0;
  private pendingSnapshots: MarketObservation[] = [];
  private tickTimer: (() => void) | null = null;
  private tickCount = 0;
  private lastTrendingAt = 0;
  private buryLater: string[] = [];
  private graveCursor = 0;
  private lastGraveAt = 0;
  private lastErrorFeedAt = 0;
  private booted: Promise<void> | null = null;

  // ---------- ciclo de vida ----------

  boot(): Promise<void> {
    if (!this.booted) this.booted = this.doBoot();
    return this.booted;
  }

  private async doBoot() {
    const s = getState();
    const tokens: Record<string, TrackedToken> = {};
    for (const t of s.savedTokens) tokens[t.address] = { ...t, lastObservation: null, lastFetchAt: null, status: 'waiting', zeroVolCycles: 0, fetchAttempts: 0, firstObservedMcap: t.firstObservedMcap ?? null };
    const alerts = await db.recentAlerts(500);
    for (const a of alerts) {
      const prev = this.lastAlertAt.get(a.dedupeKey) ?? 0;
      if (a.detectedAt > prev) this.lastAlertAt.set(a.dedupeKey, a.detectedAt);
    }
    const snaps = await db.snapshotsSince(Date.now() - HISTORY_MAX_MS);
    for (const o of snaps.sort((x, y) => x.observedAt - y.observedAt)) {
      if (!tokens[o.tokenAddress]) continue;
      const arr = this.history.get(o.tokenAddress) ?? [];
      arr.push(o);
      this.history.set(o.tokenAddress, arr);
    }
    void db.pruneSnapshots(Date.now() - SNAPSHOT_RETENTION_MS);
    useStore.setState({ tokens, alerts });
    // Mantém a lista salva em dia quando favoritos/pastas mudam.
    useStore.subscribe((st, prev) => {
      if (st.favorites !== prev.favorites || st.folders !== prev.folders || st.myAlerts !== prev.myAlerts) this.syncSaved();
    });
  }

  async start() {
    await this.boot();
    if (getState().running) return;
    useStore.setState({ running: true });
    if (this.wantsPumpPortal()) this.pp.start((t) => this.onDiscovered(t));
    // relógio em Web Worker: continua batendo com a aba em segundo plano
    this.tickTimer = onTick(() => {
      this.tick();
      if (++this.tickCount % 2 === 0) this.syncHealth();
    });
    getState().pushFeed({ kind: 'info', text: 'Coleta iniciada' });
    this.tick();
    this.syncHealth();
  }

  stop() {
    useStore.setState({ running: false });
    this.pp.stop();
    this.tickTimer?.();
    this.tickTimer = null;
    void this.flushSnapshots();
    getState().pushFeed({ kind: 'info', text: 'Coleta pausada' });
    this.syncHealth();
  }

  /** Reaplica as preferências de descoberta (liga/desliga o PumpPortal). */
  applyDiscoveryPrefs() {
    if (!getState().running) return;
    if (this.wantsPumpPortal()) this.pp.start((t) => this.onDiscovered(t));
    else this.pp.stop();
  }

  private wantsPumpPortal() {
    const s = getState();
    const opOn = s.operator.settings.enabled && operatorHooks.isEnabledForUser?.() !== false;
    return s.prefs.discoverNew || s.prefs.discoverMigrations || (opOn && (s.operator.settings.detectFastMigration || (!!s.prefs.pumpPortalKey && s.operator.wallets.length > 0)));
  }

  private syncHealth() {
    const health = [this.pp.health(), this.ds.health()];
    if (!getState().prefs.discoverNew && !getState().prefs.discoverMigrations) health[0] = { ...health[0], state: 'off', detail: 'desligado em Configurações' };
    const op = operatorHooks.health?.();
    if (op) health.push(op);
    useStore.setState({ health });
  }

  // ---------- universo de tokens ----------

  private activePresets(): PresetKey[] {
    return PRESET_KEYS.filter((k) => getState().presets[k].active);
  }

  private activeIndicators(): IndicatorConfig[] {
    return getState().indicators.filter((i) => i.active);
  }

  /** Configs de timeframe ativas (presets nativos, exceto Revival, + indicadores). */
  private tfConfigs(): TimeframeConfig[] {
    const ps = getState().presets;
    const out: TimeframeConfig[] = [];
    for (const k of this.activePresets()) if (k !== 'revival') for (const tf of ps[k].timeframes) out.push(ps[k].tf[tf]);
    for (const ind of this.activeIndicators()) for (const tf of ind.timeframes) out.push(ind.tf[tf]);
    return out;
  }

  baseIntervalS(): number {
    const ps = getState().presets;
    const vals = this.tfConfigs().map((c) => c.checkIntervalS);
    if (ps.revival.active) vals.push(ps.revival.revival?.checkIntervalS ?? 30);
    const v = vals.length ? Math.min(...vals) : 30;
    return Math.max(10, Math.min(300, v));
  }

  private maxTokens(): number {
    const vals = this.tfConfigs().map((c) => c.maxTokens);
    return Math.max(50, Math.min(5000, vals.length ? Math.max(...vals) : 3000));
  }

  private noVolLimit(): number | null {
    const vals = this.tfConfigs()
      .map((c) => c.noVolRemoveCycles)
      .filter((v): v is number => v != null && v > 0);
    return vals.length ? Math.max(...vals) : null;
  }

  private hiVolThreshold(): number | null {
    const vals = this.tfConfigs()
      .map((c) => c.hiVolThreshold)
      .filter((v): v is number => v != null && v > 0);
    return vals.length ? Math.min(...vals) : null;
  }

  isProtected(a: string): boolean {
    const s = getState();
    return (
      !!s.tokens[a]?.manual ||
      s.favorites.includes(a) ||
      s.folders.some((f) => f.tokens.includes(a)) ||
      s.myAlerts.some((m) => m.tokenAddress === a && m.status === 'waiting') ||
      !!operatorHooks.isOperatorToken?.(a)
    );
  }

  syncSaved() {
    const s = getState();
    const saved = Object.values(s.tokens)
      .filter((t) => this.isProtected(t.address))
      .map((t) => ({ ...t, lastObservation: null }));
    useStore.setState({ savedTokens: saved });
  }

  private onDiscovered(d: DiscoveredToken) {
    const p = getState().prefs;
    if (d.source === 'pumpportal_new') operatorHooks.onCreated?.(d.address, d.at);
    if (d.source === 'pumpportal_migrated') operatorHooks.onMigration?.(d.address, d.at, d.symbol ?? getState().tokens[d.address]?.meta.symbol ?? null);
    if (d.source === 'pumpportal_new' && !p.discoverNew) return;
    if (d.source === 'pumpportal_migrated' && !p.discoverMigrations) return;
    const existing = getState().tokens[d.address];
    if (existing && d.source === 'pumpportal_migrated') {
      // token que já estava na lista migrou: atualiza a origem e força nova consulta
      useStore.setState({ tokens: { ...getState().tokens, [d.address]: { ...existing, discovery: 'pumpportal_migrated', lastFetchAt: null } } });
      getState().pushFeed({ kind: 'discovery', text: `Migrou: ${existing.meta.symbol ?? d.address.slice(0, 6)}` });
      return;
    }
    const added = this.addToken(d.address, d.source, d);
    if (added && d.source === 'pumpportal_migrated') getState().pushFeed({ kind: 'discovery', text: `Migrou: ${d.symbol ?? d.address.slice(0, 6)}` });
  }

  addToken(address: string, discovery: DiscoverySource, d?: Partial<DiscoveredToken>): boolean {
    const a = address.trim();
    if (!isValidSolanaAddress(a)) return false;
    const s = getState();
    const existing = s.tokens[a];
    const manual = discovery === 'manual';
    if (existing) {
      if (manual && !existing.manual) {
        useStore.setState({ tokens: { ...s.tokens, [a]: { ...existing, manual: true, lastFetchAt: null } } });
        this.syncSaved();
      }
      return false;
    }
    if (!manual && d?.symbol && BLUE_CHIPS.has(d.symbol.toUpperCase())) return false;
    let tokens = { ...s.tokens };
    const cap = this.maxTokens();
    const count = Object.keys(tokens).length;
    if (count >= cap) {
      const victim = this.pickEviction(tokens);
      if (!victim) return false;
      delete tokens[victim];
      this.history.delete(victim);
    }
    tokens[a] = {
      address: a,
      meta: emptyMeta(a, d),
      discovery,
      addedAt: Date.now(),
      manual,
      status: 'waiting',
      lastFetchAt: null,
      lastObservation: null,
      observedPeakMcap: null,
      observedPeakAt: null,
      zeroVolCycles: 0,
      fetchAttempts: 0,
      boostAmount: d?.boostAmount ?? null,
      hot: false,
      firstObservedMcap: null,
    };
    useStore.setState({ tokens });
    if (manual) this.syncSaved();
    return true;
  }

  private pickEviction(tokens: Record<string, TrackedToken>): string | null {
    let worst: TrackedToken | null = null;
    const score = (t: TrackedToken) => (t.lastObservation?.windows['5m'].volumeUsd ?? -1) + (t.hot ? 1e12 : 0);
    for (const t of Object.values(tokens)) {
      if (this.isProtected(t.address)) continue;
      if (!worst || score(t) < score(worst) || (score(t) === score(worst) && t.addedAt < worst.addedAt)) worst = t;
    }
    return worst?.address ?? null;
  }

  removeToken(a: string) {
    const s = getState();
    const tokens = { ...s.tokens };
    delete tokens[a];
    this.history.delete(a);
    this.debug.delete(a);
    useStore.setState({
      tokens,
      favorites: s.favorites.filter((x) => x !== a),
      folders: s.folders.map((f) => ({ ...f, tokens: f.tokens.filter((x) => x !== a) })),
      selected: s.selected === a ? null : s.selected,
    });
    this.syncSaved();
  }

  clearAuto() {
    const s = getState();
    const tokens: Record<string, TrackedToken> = {};
    for (const t of Object.values(s.tokens)) if (this.isProtected(t.address)) tokens[t.address] = t;
    for (const a of this.history.keys()) if (!tokens[a]) this.history.delete(a);
    useStore.setState({ tokens });
  }

  async loadTop() {
    try {
      const list = await this.ds.listTrending();
      let n = 0;
      for (const d of list) if (this.addToken(d.address, d.source, d)) n++;
      // atualiza o valor de boost dos que já existiam
      const tokens = { ...getState().tokens };
      for (const d of list) if (tokens[d.address] && d.boostAmount != null) tokens[d.address] = { ...tokens[d.address], boostAmount: d.boostAmount };
      useStore.setState({ tokens });
      getState().pushFeed({ kind: 'discovery', text: `Load Top Solana: +${n} tokens (${list.length} na lista)` });
      this.lastTrendingAt = Date.now();
      return n;
    } catch (e) {
      getState().pushFeed({ kind: 'error', text: `Load Top falhou: ${(e as Error).message}` });
      return 0;
    }
  }

  refreshAll() {
    const tokens = { ...getState().tokens };
    for (const a of Object.keys(tokens)) tokens[a] = { ...tokens[a], lastFetchAt: null };
    useStore.setState({ tokens });
    this.tick();
  }

  getHistory(a: string): MarketObservation[] {
    return this.history.get(a) ?? [];
  }

  search(q: string) {
    return this.ds.search(q);
  }

  // ---------- agendamento ----------

  private intervalFor(t: TrackedToken, base: number, now: number): number {
    if (t.manual || t.hot) return base;
    if (t.status === 'waiting' && now - t.addedAt < 3 * 60_000) return Math.min(base, 15);
    if (t.status === 'waiting') return base * 2;
    if (t.zeroVolCycles > 3) return base * 3;
    return base;
  }

  private tick() {
    const s = getState();
    if (!s.running) return;
    const now = Date.now();
    if (s.prefs.discoverTrending && now - this.lastTrendingAt > 3 * 60_000) {
      this.lastTrendingAt = now;
      void this.loadTop();
    }
    const base = this.baseIntervalS();
    const due = Object.values(s.tokens).filter(
      (t) => !this.inflight.has(t.address) && (t.lastFetchAt == null || now - t.lastFetchAt >= this.intervalFor(t, base, now) * 1000),
    );
    if (due.length) {
      const prio = (t: TrackedToken) => (t.lastFetchAt == null ? 0 : 1) * 10 + (t.manual ? 0 : 1) + (t.hot ? 0 : 2) + (s.favorites.includes(t.address) ? 0 : 1);
      due.sort((x, y) => prio(x) - prio(y) || (x.lastFetchAt ?? 0) - (y.lastFetchAt ?? 0));
      const slots = Math.min(MAX_CONCURRENT - this.batches, this.ds.marketCapacity());
      const max = this.ds.maxBatch;
      for (let i = 0; i < slots && i * max < due.length; i++) {
        void this.fetchBatch(due.slice(i * max, (i + 1) * max).map((t) => t.address));
      }
    }
    if (this.pendingSnapshots.length >= 50 || (this.pendingSnapshots.length && now % 10_000 < 1000)) void this.flushSnapshots();
    this.checkResort(now);
    this.checkGraveyard(now);
  }

  /**
   * Cemitério do Revival: tokens que saíram por falta de volume são conferidos devagar
   * (1 lote de 30 a cada 6s, só com folga no limite). Se um deles voltar a ter volume real,
   * entra de novo na lista e o Revival avalia.
   */
  private checkGraveyard(now: number) {
    const s = getState();
    if (this.buryLater.length) {
      const g = { ...s.graveyard };
      for (const a of this.buryLater) g[a] = now;
      this.buryLater = [];
      const keys = Object.keys(g);
      if (keys.length > 3000) keys.sort((x, y) => g[x] - g[y]).slice(0, keys.length - 3000).forEach((k) => delete g[k]);
      useStore.setState({ graveyard: g });
    }
    if (!s.prefs.revivalGraveyard || !s.presets.revival.active) return;
    if (now - this.lastGraveAt < 6000 || this.ds.marketCapacity() < 120) return;
    const all = Object.keys(getState().graveyard).filter((a) => !s.tokens[a]);
    if (!all.length) return;
    this.lastGraveAt = now;
    if (this.graveCursor >= all.length) this.graveCursor = 0;
    const batch = all.slice(this.graveCursor, this.graveCursor + this.ds.maxBatch);
    this.graveCursor += batch.length;
    const cfg = s.presets.revival.revival;
    void this.ds
      .fetchTokens(batch)
      .then((res) => {
        const g = { ...getState().graveyard };
        const week = Date.now() - 7 * 86400_000;
        for (const a of res.missing) delete g[a];
        for (const o of res.observations) {
          const v5 = o.windows['5m'].volumeUsd;
          if (g[o.tokenAddress] < week) delete g[o.tokenAddress];
          if (v5 != null && cfg && v5 >= cfg.realVolumeFloor) {
            const m = res.metas.find((x) => x.address === o.tokenAddress);
            delete g[o.tokenAddress];
            if (this.addToken(o.tokenAddress, 'graveyard', { symbol: m?.symbol, name: m?.name, imageUrl: m?.imageUrl })) {
              getState().pushFeed({ kind: 'discovery', text: `Cemitério: ${m?.symbol ?? o.tokenAddress.slice(0, 6)} voltou com ${fmtUsd(v5)} em 5m` });
            }
          }
        }
        useStore.setState({ graveyard: g });
      })
      .catch(() => {});
  }

  private checkResort(now: number) {
    const s = getState();
    const every = s.prefs.autoResortS;
    if (every > 0 && now - s.lastResortAt >= every * 1000) useStore.setState({ lastResortAt: now });
  }

  private async flushSnapshots() {
    const list = this.pendingSnapshots;
    this.pendingSnapshots = [];
    await db.putSnapshots(list);
  }

  private async fetchBatch(addrs: string[]) {
    this.batches++;
    addrs.forEach((a) => this.inflight.add(a));
    const tokens = getState().tokens;
    const current: Record<string, string> = {};
    for (const a of addrs) {
      const p = tokens[a]?.lastObservation?.pairAddress;
      if (p) current[a] = p;
    }
    try {
      const res = await this.ds.fetchTokens(addrs, current);
      this.apply(res, addrs);
    } catch (e) {
      const now = Date.now();
      const t = { ...getState().tokens };
      for (const a of addrs) if (t[a]) t[a] = { ...t[a], lastFetchAt: now };
      useStore.setState({ tokens: t });
      if (now - this.lastErrorFeedAt > 30_000) {
        this.lastErrorFeedAt = now;
        getState().pushFeed({ kind: 'error', text: `DexScreener: ${(e as Error).message}` });
      }
    } finally {
      addrs.forEach((a) => this.inflight.delete(a));
      this.batches--;
    }
  }

  // ---------- aplicação dos dados + motor ----------

  private pushHistory(a: string, o: MarketObservation) {
    const arr = this.history.get(a) ?? [];
    arr.push(o);
    // compacta: resolução total nos últimos 20 min, 1 ponto a cada 10 min até 24h
    if (arr.length > 60) {
      const now = o.observedAt;
      const out: MarketObservation[] = [];
      let lastSparse = -Infinity;
      for (const h of arr) {
        const age = now - h.observedAt;
        if (age > HISTORY_MAX_MS) continue;
        if (age <= HISTORY_FULL_MS) out.push(h);
        else if (h.observedAt - lastSparse >= HISTORY_SPARSE_STEP_MS) {
          out.push(h);
          lastSparse = h.observedAt;
        }
      }
      this.history.set(a, out);
    } else this.history.set(a, arr);
  }

  private apply(res: MarketFetchResult, addrs: string[]) {
    const now = Date.now();
    const s = getState();
    const tokens = { ...s.tokens };
    const metaBy = new Map(res.metas.map((m) => [m.address, m]));
    const removed: string[] = [];
    const noVolLimit = this.noVolLimit();
    const hiVol = this.hiVolThreshold();
    const newMin = s.prefs.newTokenMinutes * 60_000;
    const stayVals = this.activeIndicators()
      .map((i) => i.minMcapToStay)
      .filter((v): v is number => v != null && v > 0);
    const minMcapToStay = stayVals.length ? Math.min(...stayVals) : null;

    for (const o of res.observations) {
      const t = tokens[o.tokenAddress];
      if (!t) continue;
      const m = metaBy.get(o.tokenAddress);
      const meta: TokenMeta = m
        ? { ...m, name: m.name ?? t.meta.name, symbol: m.symbol ?? t.meta.symbol, imageUrl: m.imageUrl ?? t.meta.imageUrl }
        : t.meta;
      const prevHist = this.getHistory(o.tokenAddress);
      const v5 = o.windows['5m'].volumeUsd;
      const mcap = o.marketCapUsd;
      const peakUp = mcap != null && (t.observedPeakMcap == null || mcap > t.observedPeakMcap);
      const next: TrackedToken = {
        ...t,
        meta,
        status: 'active',
        lastFetchAt: now,
        lastObservation: o,
        fetchAttempts: 0,
        zeroVolCycles: v5 == null || v5 === 0 ? t.zeroVolCycles + 1 : 0,
        observedPeakMcap: peakUp ? mcap : t.observedPeakMcap,
        observedPeakAt: peakUp ? now : t.observedPeakAt,
        hot: hiVol != null && v5 != null && v5 >= hiVol,
        firstObservedMcap: t.firstObservedMcap ?? mcap,
      };
      const prot = this.isProtected(t.address);
      if (!prot) {
        const sym = (meta.symbol ?? '').toUpperCase();
        const tooBig = mcap != null && mcap >= MAX_AUTO_MCAP;
        const deadNew = t.discovery === 'pumpportal_new' && now - t.addedAt > newMin && (v5 ?? 0) < 1000;
        const noVol = noVolLimit != null && next.zeroVolCycles >= noVolLimit;
        // MCAP mínimo para continuar monitorado (indicadores); tokens novos têm o tempo de vida próprio
        const isFresh = t.discovery === 'pumpportal_new' && now - t.addedAt <= newMin;
        const belowStay = minMcapToStay != null && mcap != null && mcap < minMcapToStay && !isFresh;
        if (BLUE_CHIPS.has(sym) || tooBig || deadNew || noVol || belowStay) {
          delete tokens[t.address];
          removed.push(t.address);
          if (noVol && !deadNew) this.buryLater.push(t.address); // vai para o cemitério do Revival
          continue;
        }
      }
      tokens[t.address] = next;
      this.evaluate(next, o, prevHist, now);
      this.checkMyAlerts(next, o);
      try {
        operatorHooks.onObservation?.(next, o, prevHist);
      } catch (e) {
        console.warn('[operators]', e);
      }
      this.pushHistory(t.address, o);
      if (now - (this.lastPersistAt.get(t.address) ?? 0) >= SNAPSHOT_PERSIST_MS) {
        this.lastPersistAt.set(t.address, now);
        this.pendingSnapshots.push(o);
      }
    }

    for (const a of res.missing) {
      const t = tokens[a];
      if (!t) continue;
      const attempts = t.fetchAttempts + 1;
      const prot = this.isProtected(a);
      const expiredNew = t.discovery === 'pumpportal_new' && now - t.addedAt > newMin;
      if (!prot && (expiredNew || attempts >= 20)) {
        delete tokens[a];
        removed.push(a);
        continue;
      }
      tokens[a] = { ...t, lastFetchAt: now, fetchAttempts: attempts, status: attempts >= 20 ? 'stale' : t.status };
    }
    // garante que tokens consultados mas sem resposta também avancem
    for (const a of addrs) if (tokens[a] && tokens[a].lastFetchAt !== now && !res.missing.includes(a)) tokens[a] = { ...tokens[a], lastFetchAt: now };

    for (const a of removed) {
      this.history.delete(a);
      this.debug.delete(a);
    }
    useStore.setState({ tokens, lastCycleAt: now });
  }

  private evaluate(t: TrackedToken, o: MarketObservation, hist: MarketObservation[], now: number) {
    const s = getState();
    const debug: Record<string, string[]> = {};
    for (const k of this.activePresets()) {
      const p = s.presets[k];
      if (k === 'revival') {
        const cfg = p.revival;
        if (!cfg) continue;
        const ek = `${t.address}|revival`;
        if (now - (this.lastEvalAt.get(ek) ?? 0) < cfg.checkIntervalS * 900) continue;
        this.lastEvalAt.set(ek, now);
        const r = evaluateRevival(cfg, o, hist, now);
        debug.revival = r.candidate ? ['ok'] : r.rejects;
        if (r.candidate) this.emit(t, o, r.candidate, cfg.cooldownS);
        continue;
      }
      for (const tf of p.timeframes) {
        const cfg = p.tf[tf];
        const ek = `${t.address}|${k}|${tf}`;
        if (now - (this.lastEvalAt.get(ek) ?? 0) < cfg.checkIntervalS * 900) continue;
        this.lastEvalAt.set(ek, now);
        const r = evaluateTimeframe(k, tf, cfg, o, hist, now);
        debug[`${k}:${tf}`] = r.candidates.length ? ['ok'] : r.rejects;
        for (const c of r.candidates) this.emit(t, o, c, cfg.cooldownS);
      }
    }
    for (const ind of this.activeIndicators()) {
      for (const tf of ind.timeframes) {
        const cfg = ind.tf[tf];
        const ek = `${t.address}|${ind.id}|${tf}`;
        if (now - (this.lastEvalAt.get(ek) ?? 0) < cfg.checkIntervalS * 900) continue;
        this.lastEvalAt.set(ek, now);
        const r = evaluateTimeframe(ind.id, tf, cfg, o, hist, now);
        debug[`${ind.name}:${tf}`] = r.candidates.length ? ['ok'] : r.rejects;
        for (const c of r.candidates) this.emit(t, o, c, cfg.cooldownS, ind);
      }
      this.indicatorExtras(t, o, ind, now);
    }
    if (Object.keys(debug).length) this.debug.set(t.address, { ...(this.debug.get(t.address) ?? {}), ...debug });
  }

  /** Motivos do último ciclo (por preset/timeframe) — usado no painel Histórico/Debug. */
  getDebug(a: string): Record<string, string[]> | undefined {
    return this.debug.get(a);
  }

  /** Extras dos indicadores: "high vol new coin" e "PumpFun live" (alertas únicos por token). */
  private indicatorExtras(t: TrackedToken, o: MarketObservation, ind: IndicatorConfig, now: number) {
    const sym = t.meta.symbol ?? t.address.slice(0, 6);
    const name = ind.name.toUpperCase();
    const hv = ind.highVolNewCoin;
    const v24 = o.windows['24h'].volumeUsd;
    if (hv.minTotalVol != null && o.pairCreatedAt != null && now - o.pairCreatedAt <= hv.maxAgeH * 3600_000 && v24 != null && v24 >= hv.minTotalVol) {
      this.emitExtra(t, o, ind, `${t.address}|${ind.id}|hvnc`, 86_400, `ALERTA ${name} — ${sym} HIGH VOL NEW COIN | Vol 24H ${fmtUsd(v24)}`, 'critical', v24);
    }
    const pl = ind.pumpLive;
    const mcap = o.marketCapUsd;
    const fromPump = t.discovery === 'pumpportal_new' || t.discovery === 'pumpportal_migrated' || o.dexId === 'pumpfun';
    if (pl.alertMcap != null && fromPump && mcap != null && mcap >= pl.alertMcap && t.firstObservedMcap != null && (pl.entryMcap == null || t.firstObservedMcap <= pl.entryMcap)) {
      this.emitExtra(t, o, ind, `${t.address}|${ind.id}|pumplive`, 86_400, `ALERTA ${name} — ${sym} PUMPFUN LIVE | entrou a ${fmtUsd(t.firstObservedMcap)} → MCAP ${fmtUsd(mcap)}`, 'mega', o.windows['5m'].volumeUsd);
    }
  }

  private emitExtra(t: TrackedToken, o: MarketObservation, ind: IndicatorConfig, key: string, cooldownS: number, summary: string, level: 'normal' | 'critical' | 'mega', vol: number | null) {
    const now = Date.now();
    if (now - (this.lastAlertAt.get(key) ?? 0) < cooldownS * 1000) return;
    this.lastAlertAt.set(key, now);
    const w = o.windows['5m'];
    this.publish({
      id: uid(),
      dedupeKey: key,
      tokenAddress: t.address,
      pairAddress: o.pairAddress,
      symbol: t.meta.symbol,
      name: t.meta.name,
      imageUrl: t.meta.imageUrl,
      preset: ind.id,
      presetName: ind.name,
      presetColor: ind.color,
      level,
      timeframe: key.endsWith('hvnc') ? '24h' : '5m',
      direction: 'buy',
      dexId: o.dexId,
      detectedAt: now,
      marketCapUsd: o.marketCapUsd,
      volumeUsd: vol,
      prevVolumeUsd: null,
      volRisePct: null,
      mcapRisePct: null,
      priceChangePct: w.priceChangePct,
      buys: w.buys,
      sells: w.sells,
      liquidityUsd: o.liquidityUsd,
      pairCreatedAt: o.pairCreatedAt,
      summary,
      reasons: [summary],
      warnings: [],
      isTest: false,
    });
  }

  private emit(t: TrackedToken, o: MarketObservation, c: Candidate, cooldownS: number, ind?: IndicatorConfig) {
    const now = Date.now();
    const key = dedupeKey(t.address, o.pairAddress, c.preset, c.timeframe, c.direction);
    if (now - (this.lastAlertAt.get(key) ?? 0) < cooldownS * 1000) return;
    this.lastAlertAt.set(key, now);
    const level = ind ? soundLevel(c.volRisePct, ind.tiers.criticalPct, ind.tiers.megaPct) : undefined;
    const label = ind ? `${ind.name.toUpperCase()}${level && level !== 'normal' ? ` ${level.toUpperCase()}` : ''}` : PRESET_META[c.preset as PresetKey].short.toUpperCase();
    const sym = t.meta.symbol ?? t.address.slice(0, 6);
    const summary =
      c.preset === 'revival'
        ? `ALERTA ${label} — ${sym} ${c.summaryCore}`
        : `ALERTA ${label} — ${sym} ${c.summaryCore} | Vol ${fmtUsd(c.volumeUsd)}`;
    const alert: Alert = {
      id: uid(),
      dedupeKey: key,
      tokenAddress: t.address,
      pairAddress: o.pairAddress,
      symbol: t.meta.symbol,
      name: t.meta.name,
      imageUrl: t.meta.imageUrl,
      preset: c.preset,
      presetName: ind?.name,
      presetColor: ind?.color,
      level,
      timeframe: c.timeframe,
      direction: c.direction,
      dexId: o.dexId,
      detectedAt: now,
      marketCapUsd: o.marketCapUsd,
      volumeUsd: c.volumeUsd,
      prevVolumeUsd: c.prevVolumeUsd,
      volRisePct: c.volRisePct,
      mcapRisePct: c.mcapRisePct,
      priceChangePct: c.priceChangePct,
      buys: c.buys,
      sells: c.sells,
      liquidityUsd: o.liquidityUsd,
      pairCreatedAt: o.pairCreatedAt,
      summary,
      reasons: c.reasons,
      warnings: c.warnings,
      isTest: false,
    };
    this.publish(alert);
  }

  /** Insere o alerta final e só então toca som / notifica. */
  publish(alert: Alert) {
    const s = getState();
    const ids = new Set(s.newAlertIds);
    ids.add(alert.id);
    useStore.setState({ alerts: [alert, ...s.alerts].slice(0, 500), newAlertIds: ids });
    void db.putAlert(alert);
    s.pushFeed({ kind: 'alert', text: alert.summary });
    this.ring(alert);
    setTimeout(() => {
      const n = new Set(getState().newAlertIds);
      n.delete(alert.id);
      useStore.setState({ newAlertIds: n });
    }, 4000);
  }

  private ring(alert: Alert) {
    const s = getState();
    const now = Date.now();
    if (s.prefs.muteScamSound && s.scams[alert.tokenAddress]) return; // token marcado como scam: aparece, mas não toca
    if (!s.prefs.soundMuted) {
      const k = alert.preset;
      if (now - (this.soundAt.get(k) ?? 0) > 2000) {
        this.soundAt.set(k, now);
        if (k === 'custom') {
          const ma = s.myAlerts.find((m) => m.tokenAddress === alert.tokenAddress && m.status === 'triggered');
          void playSound(ma?.soundId ?? 'builtin:custom', 0.7);
        } else if (k === 'test') void playSound('builtin:initial', 0.7);
        else if (k.startsWith('ind:')) {
          const ind = s.indicators.find((i) => i.id === k);
          if (ind) void playSound(this.indicatorSound(ind, alert.level), ind.volume);
        } else void playSound(s.presets[k as PresetKey].soundId, s.presets[k as PresetKey].volume);
      }
    }
    if (s.prefs.notifEnabled && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      const nk = `${alert.tokenAddress}|${alert.preset}`;
      if (now - (this.notifAt.get(nk) ?? 0) > 60_000) {
        this.notifAt.set(nk, now);
        try {
          new Notification(`BearHunter · ${alert.symbol ?? 'token'}`, { body: alert.summary, icon: alert.imageUrl ?? '/favicon.svg', tag: nk });
        } catch {
          /* ignore */
        }
      }
    }
  }

  private indicatorSound(ind: IndicatorConfig, level?: 'normal' | 'critical' | 'mega') {
    if (level === 'mega') return ind.tiers.megaSoundId ?? ind.soundId;
    if (level === 'critical') return ind.tiers.criticalSoundId ?? ind.soundId;
    return ind.soundId;
  }

  testAlert(preset: PresetKey | `ind:${string}`) {
    const s = getState();
    const sel = s.selected ? s.tokens[s.selected] : null;
    const o = sel?.lastObservation ?? null;
    const ind = preset.startsWith('ind:') ? s.indicators.find((i) => i.id === preset) : undefined;
    const label = ind ? ind.name.toUpperCase() : PRESET_META[preset as PresetKey].label.toUpperCase();
    const sym = sel?.meta.symbol ?? 'TEST';
    const alert: Alert = {
      id: uid(),
      dedupeKey: `test|${uid()}`,
      tokenAddress: sel?.address ?? 'TEST',
      pairAddress: o?.pairAddress ?? null,
      symbol: sym,
      name: sel?.meta.name ?? 'Alerta de teste',
      imageUrl: sel?.meta.imageUrl ?? null,
      preset: preset as Alert['preset'],
      presetName: ind?.name,
      presetColor: ind?.color,
      timeframe: '5m',
      direction: 'buy',
      dexId: o?.dexId ?? null,
      detectedAt: Date.now(),
      marketCapUsd: o?.marketCapUsd ?? null,
      volumeUsd: o?.windows['5m'].volumeUsd ?? null,
      prevVolumeUsd: null,
      volRisePct: null,
      mcapRisePct: null,
      priceChangePct: o?.windows['5m'].priceChangePct ?? null,
      buys: o?.windows['5m'].buys ?? null,
      sells: o?.windows['5m'].sells ?? null,
      liquidityUsd: o?.liquidityUsd ?? null,
      pairCreatedAt: o?.pairCreatedAt ?? null,
      summary: `TESTE ${label} — ${sym} (alerta de teste, não é sinal real)`,
      reasons: ['teste manual'],
      warnings: [],
      isTest: true,
    };
    const ids = new Set(s.newAlertIds);
    ids.add(alert.id);
    useStore.setState({ alerts: [alert, ...s.alerts].slice(0, 500), newAlertIds: ids });
    void db.putAlert(alert);
    if (!s.prefs.soundMuted) {
      if (ind) void playSound(ind.soundId, ind.volume);
      else void playSound(s.presets[preset as PresetKey].soundId, s.presets[preset as PresetKey].volume);
    }
  }

  private checkMyAlerts(t: TrackedToken, o: MarketObservation) {
    const s = getState();
    const mine = s.myAlerts.filter((m) => m.tokenAddress === t.address && m.status === 'waiting');
    if (!mine.length) return;
    const val = (m: MyAlert): number | null =>
      m.metric === 'mcap'
        ? o.marketCapUsd
        : m.metric === 'volume5m'
          ? o.windows['5m'].volumeUsd
          : m.metric === 'priceChange5m'
            ? o.windows['5m'].priceChangePct
            : o.liquidityUsd;
    const hit = mine.filter((m) => {
      const v = val(m);
      return v != null && (m.op === '>' ? v > m.target : v < m.target);
    });
    if (!hit.length) return;
    const now = Date.now();
    const ids = new Set(hit.map((h) => h.id));
    useStore.setState({ myAlerts: getState().myAlerts.map((m) => (ids.has(m.id) ? { ...m, status: 'triggered', triggeredAt: now } : m)) });
    const names: Record<string, string> = { mcap: 'MCAP', volume5m: 'Vol 5M', priceChange5m: 'Δ 5M', liquidity: 'Liquidez' };
    for (const m of hit) {
      const v = val(m);
      const shown = m.metric === 'priceChange5m' ? `${v?.toFixed(1)}%` : fmtUsd(v);
      const target = m.metric === 'priceChange5m' ? `${m.target}%` : fmtUsd(m.target);
      this.publish({
        id: uid(),
        dedupeKey: `custom|${m.id}`,
        tokenAddress: t.address,
        pairAddress: o.pairAddress,
        symbol: t.meta.symbol,
        name: t.meta.name,
        imageUrl: t.meta.imageUrl,
        preset: 'custom',
        timeframe: '5m',
        direction: 'buy',
        dexId: o.dexId,
        detectedAt: now,
        marketCapUsd: o.marketCapUsd,
        volumeUsd: o.windows['5m'].volumeUsd,
        prevVolumeUsd: null,
        volRisePct: null,
        mcapRisePct: null,
        priceChangePct: o.windows['5m'].priceChangePct,
        buys: o.windows['5m'].buys,
        sells: o.windows['5m'].sells,
        liquidityUsd: o.liquidityUsd,
        pairCreatedAt: o.pairCreatedAt,
        summary: `MY ALERT — ${t.meta.symbol ?? ''} ${names[m.metric]} ${m.op} ${target} (agora ${shown})`,
        reasons: [`${names[m.metric]} ${m.op} ${target}`],
        warnings: [],
        isTest: false,
      });
    }
  }

  async clearAlerts() {
    useStore.setState({ alerts: [] });
    await db.clearAlerts();
  }
}

export const collector = new Collector();
