import { useEffect, useMemo, useState } from 'react';
import { Copy, ExternalLink, LineChart, Plus, Search, Skull, Trash2, Wallet, Radar, Settings2, Users, Zap, Check, X, FileText, Undo2, BadgeCheck, Play } from 'lucide-react';
import { useStore } from '@/state/store';
import { useUi } from '@/state/ui';
import { operatorTracker, signalSound, type HolderRow } from '@/operators/tracker';
import type { CrossResult } from '@/operators/crossWallets';
import { extractAddresses } from '@/operators/detectors';
import { CANDIDATE_KINDS, MAX_OPERATOR_WALLETS, ROLE_META, SIGNAL_META, type OperatorSignal, type OperatorToken, type SignalKind, type WalletRole } from '@/operators/types';
import { fmtAge, fmtTime, fmtUsd, shortAddr } from '@/domain/num';
import { axiomUrl, copyText, dexUrl, gmgnUrl } from '@/lib/links';
import { cn } from '@/lib/cn';
import { Switch, toast, useNow } from '@/ui/primitives';
import { SourceRow } from '@/ui/Header';
import { ScamBadge, toggleScamWithToast } from '@/ui/ScamMark';
import { allSounds, builtinSounds, playSound, unlockAudio, type SoundOption } from '@/services/sound';

const ROLES: WalletRole[] = ['marcador', 'auxiliar', 'fazenda'];
const roleTone: Record<WalletRole, string> = {
  marcador: 'border-up/50 bg-up/10 text-up',
  auxiliar: 'border-initial/50 bg-initial/10 text-initial',
  fazenda: 'border-revival/50 bg-revival/10 text-revival',
};
const toneCls: Record<string, string> = {
  up: 'border-up/50 bg-up/15 text-up',
  down: 'border-down/60 bg-down/15 text-down',
  warn: 'border-warn/50 bg-warn/15 text-warn',
  info: 'border-initial/50 bg-initial/10 text-initial',
};

function openChart(mint: string) {
  const t = useStore.getState().tokens[mint];
  useUi.getState().set({ chartModal: { token: mint, pair: t?.lastObservation?.pairAddress ?? null, symbol: t?.meta.symbol ?? null, name: t?.meta.name ?? null, imageUrl: t?.meta.imageUrl ?? null } });
}

function Card({ title, icon: Icon, children, right, fixed }: { title: string; icon: typeof Wallet; children: React.ReactNode; right?: React.ReactNode; fixed?: boolean }) {
  return (
    <section className={cn('flex min-h-0 flex-col rounded-lg border border-line bg-panel', fixed && 'h-[65vh] min-h-[360px] lg:h-full')}>
      <div className="flex min-h-10 items-center gap-2 border-b border-line px-3 py-1.5">
        <Icon size={14} className="text-primary" />
        <h2 className="text-[12px] font-bold uppercase tracking-[0.12em]">{title}</h2>
        <div className="ml-auto flex items-center gap-1.5">{right}</div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </section>
  );
}

/** Botões "É ele" / "Não é ele" para um token. */
function Verdict({ mint }: { mint: string }) {
  const confirmed = useStore((s) => !!s.operator.confirmed[mint]);
  return (
    <span className="flex items-center gap-1.5">
      <button
        className={cn('flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10.5px] font-bold', confirmed ? 'border-up/70 bg-up/20 text-up' : 'border-up/40 text-up hover:bg-up/10')}
        title="Confirmar que este token é do operador"
        onClick={() => {
          operatorTracker.confirm(mint);
          toast('Token salvo nos confirmados');
        }}
      >
        <Check size={11} /> {confirmed ? 'É ele ✓' : 'É ele'}
      </button>
      <button
        className="flex items-center gap-1 rounded border border-down/40 px-1.5 py-0.5 text-[10.5px] font-bold text-down hover:bg-down/10"
        title="Não é ele: oculta tudo deste token"
        onClick={() => {
          operatorTracker.discard(mint);
          toast('Token descartado e oculto (pode desfazer em Descartados)');
        }}
      >
        <X size={11} /> Não é ele
      </button>
    </span>
  );
}

// ---------- carteiras ----------

function Wallets() {
  const wallets = useStore((s) => s.operator.wallets);
  const [text, setText] = useState('');
  const [role, setRole] = useState<WalletRole>('fazenda');
  const [label, setLabel] = useState('');
  const [filter, setFilter] = useState<WalletRole | 'all'>('all');
  const now = useNow(10_000);
  const add = () => {
    const addrs = extractAddresses(text);
    if (!addrs.length) return toast('Nenhum endereço encontrado no texto');
    const n = operatorTracker.addWallets(addrs, role, label.trim());
    toast(`${n} carteira(s) adicionada(s)${addrs.length - n ? `, ${addrs.length - n} já estava(m) na lista` : ''}`);
    setText('');
    setLabel('');
  };
  const patch = (address: string, p: Partial<(typeof wallets)[number]>) => {
    const op = useStore.getState().operator;
    useStore.setState({ operator: { ...op, wallets: op.wallets.map((w) => (w.address === address ? { ...w, ...p } : w)) } });
  };
  const remove = (address: string) => {
    const op = useStore.getState().operator;
    useStore.setState({ operator: { ...op, wallets: op.wallets.filter((w) => w.address !== address) } });
  };
  const list = wallets.filter((w) => filter === 'all' || w.role === filter);
  return (
    <Card fixed title={`Carteiras (${wallets.length}/${MAX_OPERATOR_WALLETS})`} icon={Wallet}>
      <div className="space-y-2 border-b border-line p-3">
        <textarea
          className="input num h-auto py-2 text-[11px]"
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Cole endereços ou links do GMGN/Solscan (vários de uma vez)"
        />
        <div className="flex flex-wrap gap-1.5">
          <select className="input h-8 w-32" value={role} onChange={(e) => setRole(e.target.value as WalletRole)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_META[r].label}
              </option>
            ))}
          </select>
          <input className="input h-8 min-w-[120px] flex-1" placeholder="Apelido (opcional)" value={label} onChange={(e) => setLabel(e.target.value)} />
          <button className="btn h-8 border-primary/50 bg-primary/15 text-primary" onClick={add}>
            <Plus size={13} /> Adicionar
          </button>
        </div>
        <p className="text-[10.5px] text-dim">{ROLE_META[role].hint}</p>
      </div>
      <div className="flex flex-wrap gap-1 border-b border-line px-3 py-1.5">
        {(['all', ...ROLES] as const).map((r) => (
          <button key={r} className={cn('tab h-6', filter === r && 'tab-active')} onClick={() => setFilter(r)}>
            {r === 'all' ? 'Todas' : ROLE_META[r].label} ({r === 'all' ? wallets.length : wallets.filter((w) => w.role === r).length})
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {!list.length && <div className="p-4 text-center text-[11px] text-dim">Nenhuma carteira. Adicione a 8c3ss como Marcador para começar.</div>}
        {list.map((w) => (
          <div key={w.address} className={cn('border-b border-line px-3 py-2', !w.active && 'opacity-50')}>
            <div className="flex items-center gap-1.5">
              <select className={cn('chip h-6 cursor-pointer bg-transparent', roleTone[w.role])} value={w.role} onChange={(e) => patch(w.address, { role: e.target.value as WalletRole })}>
                {ROLES.map((r) => (
                  <option key={r} value={r} className="bg-panel text-fg">
                    {ROLE_META[r].label}
                  </option>
                ))}
              </select>
              <input className="min-w-0 flex-1 bg-transparent text-[12px] font-semibold outline-none" value={w.label} placeholder={shortAddr(w.address, 5)} onChange={(e) => patch(w.address, { label: e.target.value })} />
              <Switch checked={w.active} onChange={(v) => patch(w.address, { active: v })} label="Ativa" />
              <button className="btn-ghost hover:text-down" title="Remover" onClick={() => remove(w.address)}>
                <Trash2 size={12} />
              </button>
            </div>
            <div className="num mt-1 flex items-center gap-2 text-[10.5px] text-dim">
              <span>{shortAddr(w.address, 5)}</span>
              <button className="hover:text-fg" title="Copiar" onClick={() => void copyText(w.address).then(() => toast('Endereço copiado'))}>
                <Copy size={11} />
              </button>
              <a className="hover:text-fg" href={`https://gmgn.ai/sol/address/${w.address}`} target="_blank" rel="noreferrer">
                GMGN
              </a>
              <a className="hover:text-fg" href={`https://solscan.io/account/${w.address}`} target="_blank" rel="noreferrer">
                Solscan
              </a>
              <span className="ml-auto">{w.lastActivityAt ? `ativa há ${fmtAge(w.lastActivityAt, now)}` : 'sem atividade ainda'}</span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ---------- sinais ----------

type SigFilter = 'all' | 'entrada' | 'fazenda' | 'despejo' | 'transferencia' | 'candidatos';

function SignalRow({ s, now }: { s: OperatorSignal; now: number }) {
  const meta = SIGNAL_META[s.kind];
  const scam = useStore((st) => (s.mint ? !!st.scams[s.mint] : false));
  const tokenSym = useStore((st) => (s.mint ? st.tokens[s.mint]?.meta.symbol ?? s.symbol : s.symbol));
  const mcapNow = useStore((st) => (s.mint ? st.tokens[s.mint]?.lastObservation?.marketCapUsd ?? null : null));
  const knownCp = useStore((st) => (s.kind === 'transferencia' && s.wallets[1] ? st.operator.wallets.some((w) => w.address === s.wallets[1]) : true));
  return (
    <div
      className={cn('border-b border-line px-3 py-2.5', s.mint && 'cursor-pointer hover:bg-card', s.kind === 'despejo' && 'bg-down/[0.05]')}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('a,button')) return;
        if (s.mint) openChart(s.mint);
      }}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={cn('chip', toneCls[meta.tone])}>{meta.label}</span>
        <span className="text-[13px] font-bold">{tokenSym ?? (s.mint ? shortAddr(s.mint) : '—')}</span>
        {scam && <ScamBadge />}
        <span className="num ml-auto text-[10.5px] text-dim" title={new Date(s.at).toLocaleString()}>
          {fmtTime(s.at)} · há {fmtAge(s.at, now)}
        </span>
      </div>
      <div className="mt-1 text-[12px] text-fg/85">{s.text}</div>
      <div className="num mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] text-dim">
        {s.mcap != null && <span>MCAP no sinal {fmtUsd(s.mcap)}</span>}
        {mcapNow != null && <span>agora {fmtUsd(mcapNow)}</span>}
        {s.wallets.length > 0 && <span>{s.wallets.slice(0, 4).map((w) => shortAddr(w)).join(', ')}{s.wallets.length > 4 ? ` +${s.wallets.length - 4}` : ''}</span>}
      </div>
      {s.mint && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold">
          <button className="flex items-center gap-1 text-warn hover:underline" onClick={() => openChart(s.mint!)}>
            <LineChart size={12} /> Gráfico
          </button>
          <a className="flex items-center gap-1 text-up hover:underline" href={gmgnUrl(s.mint)} target="_blank" rel="noreferrer">
            <ExternalLink size={12} /> GMGN
          </a>
          <a className="flex items-center gap-1 text-initial hover:underline" href={axiomUrl(s.mint)} target="_blank" rel="noreferrer">
            <ExternalLink size={12} /> Axiom
          </a>
          <a className="flex items-center gap-1 text-warn hover:underline" href={dexUrl(s.mint)} target="_blank" rel="noreferrer">
            <ExternalLink size={12} /> DexScreener
          </a>
          <button className="flex items-center gap-1 text-muted hover:text-fg" onClick={() => void copyText(s.mint!).then(() => toast('CA copiado'))}>
            <Copy size={12} /> CA
          </button>
          <span className="ml-auto">
            <Verdict mint={s.mint} />
          </span>
          {s.kind === 'transferencia' && s.wallets[1] && !knownCp && (
            <button
              className="flex items-center gap-1 text-revival hover:underline"
              onClick={() => toast(operatorTracker.addWallets([s.wallets[1]], 'fazenda', 'Recebeu tokens') ? 'Carteira adicionada como Fazenda' : 'Já estava na lista')}
            >
              <Plus size={12} /> Rastrear {shortAddr(s.wallets[1])} como Fazenda
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Signals() {
  const signals = useStore((s) => s.operator.signals);
  const [f, setF] = useState<SigFilter>('all');
  const now = useNow(10_000);
  const list = signals.filter((s) => (f === 'all' ? true : f === 'candidatos' ? CANDIDATE_KINDS.includes(s.kind) : s.kind === (f as SignalKind)));
  const filters: { k: SigFilter; l: string }[] = [
    { k: 'all', l: 'Todos' },
    { k: 'entrada', l: 'Entrada' },
    { k: 'fazenda', l: 'Fazenda' },
    { k: 'despejo', l: 'Despejo' },
    { k: 'transferencia', l: 'Transferência' },
    { k: 'candidatos', l: 'Candidatos' },
  ];
  return (
    <Card
      fixed
      title={`Sinais (${signals.length})`}
      icon={Radar}
      right={
        signals.length > 0 && (
          <button className="btn-ghost" onClick={() => useStore.setState({ operator: { ...useStore.getState().operator, signals: [] } })}>
            <Trash2 size={12} /> Limpar
          </button>
        )
      }
    >
      <div className="flex flex-wrap gap-1 border-b border-line px-3 py-1.5">
        {filters.map((x) => (
          <button key={x.k} className={cn('tab h-6', f === x.k && 'tab-active')} onClick={() => setF(x.k)}>
            {x.l}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {!list.length && (
          <div className="p-6 text-center text-[12px] text-dim">
            Nenhum sinal ainda. Com carteiras cadastradas, as compras e vendas delas aparecem aqui. Migrações rápidas e bundles aparecem como <b className="text-fg">Candidatos</b>.
          </div>
        )}
        {list.map((s) => (
          <SignalRow key={s.id} s={s} now={now} />
        ))}
      </div>
    </Card>
  );
}

// ---------- tokens ----------

type TokTab = 'pending' | 'yes' | 'no';

function OpTokenRow({ t }: { t: OperatorToken }) {
  const market = useStore((s) => s.tokens);
  const scams = useStore((s) => s.scams);
  const confirmed = useStore((s) => s.operator.confirmed);
  const now = useNow(10_000);
  const o = market[t.mint]?.lastObservation;
  const w5 = o?.windows['5m'];
  const tx = w5?.buys != null && w5?.sells != null ? w5.buys + w5.sells : null;
  const pos = Object.entries(t.wallets);
  const farm = pos.filter(([, p]) => p.role === 'fazenda' && p.buys > 0);
  const farmIn = farm.filter(([, p]) => p.sells === 0).length;
  const markers = pos.filter(([, p]) => p.role !== 'fazenda' && p.buys > 0).length;
  const born = t.createdAt ?? o?.pairCreatedAt ?? t.firstSeenAt;
  return (
    <div
      key={t.mint}
      className="cursor-pointer border-b border-line px-3 py-2.5 hover:bg-card"
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('a,button')) return;
        openChart(t.mint);
      }}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[13px] font-bold">{market[t.mint]?.meta.symbol ?? t.symbol ?? shortAddr(t.mint)}</span>
        <span className={cn('chip', toneCls[SIGNAL_META[t.reason].tone])}>{SIGNAL_META[t.reason].label}</span>
        {t.botsState && <span className={cn('chip', t.botsState === 'on' ? 'border-up/50 text-up' : 'border-warn/50 text-warn')}>bots {t.botsState}</span>}
        {scams[t.mint] && <ScamBadge />}
        {confirmed[t.mint] && (
          <span className="chip border-up/60 bg-up/15 text-up">
            <BadgeCheck size={10} /> confirmado
          </span>
        )}
        <span className="num ml-auto text-[10.5px] text-dim">{fmtAge(born, now)}</span>
      </div>
      <div className="mt-1.5 grid grid-cols-4 gap-2">
        <div>
          <div className="label">MCAP</div>
          <div className="num text-[12px] font-semibold">{fmtUsd(o?.marketCapUsd)}</div>
        </div>
        <div>
          <div className="label">5M VOL</div>
          <div className="num text-[12px] font-semibold text-warn">{fmtUsd(w5?.volumeUsd)}</div>
        </div>
        <div>
          <div className="label">TXNS 5M</div>
          <div className="num text-[12px]">{tx ?? '—'}</div>
        </div>
        <div>
          <div className="label">PEAK</div>
          <div className="num text-[12px] text-muted">{fmtUsd(market[t.mint]?.observedPeakMcap)}</div>
        </div>
      </div>
      <div className="num mt-1.5 flex flex-wrap items-center gap-x-3 text-[10.5px] text-dim">
        <span className={farm.length ? 'text-revival' : ''}>
          Fazenda: {farmIn} dentro{farm.length - farmIn ? ` · ${farm.length - farmIn} vendeu` : ''}
        </span>
        <span>Marcadores/aux: {markers}</span>
        {t.migratedAt && t.createdAt && <span>migrou em {Math.round((t.migratedAt - t.createdAt) / 1000)}s</span>}
        <span className="ml-auto flex gap-2">
          <a className="hover:text-fg" href={gmgnUrl(t.mint)} target="_blank" rel="noreferrer">
            GMGN
          </a>
          <a className="hover:text-fg" href={axiomUrl(t.mint, o?.pairAddress)} target="_blank" rel="noreferrer">
            Axiom
          </a>
          <button className={cn('hover:text-down', scams[t.mint] && 'text-down')} title="Marcar scam" onClick={() => toggleScamWithToast(t.mint, t.symbol)}>
            <Skull size={11} />
          </button>
        </span>
      </div>
      <div className="mt-1.5">
        <Verdict mint={t.mint} />
      </div>
    </div>
  );
}

function OpTokens() {
  const tokens = useStore((s) => s.operator.tokens);
  const confirmed = useStore((s) => s.operator.confirmed);
  const discarded = useStore((s) => s.operator.discarded);
  const market = useStore((s) => s.tokens);
  // abre em "É ele"; se ainda não confirmou nenhum, abre em "A definir"
  const [tab, setTab] = useState<TokTab>(() => (Object.keys(useStore.getState().operator.confirmed).length ? 'yes' : 'pending'));
  const pending = useMemo(
    () => Object.values(tokens).filter((t) => !confirmed[t.mint] && !discarded[t.mint]).sort((a, b) => b.lastSignalAt - a.lastSignalAt).slice(0, 80),
    [tokens, confirmed, discarded],
  );
  const yes = useMemo(() => Object.entries(confirmed).sort((a, b) => b[1].at - a[1].at), [confirmed]);
  const no = useMemo(() => Object.entries(discarded).sort((a, b) => b[1] - a[1]), [discarded]);
  const sym = (mint: string) => market[mint]?.meta.symbol ?? tokens[mint]?.symbol ?? confirmed[mint]?.symbol ?? shortAddr(mint, 5);
  const tabs: { k: TokTab; l: string; n: number }[] = [
    { k: 'yes', l: 'É ele', n: yes.length },
    { k: 'pending', l: 'A definir', n: Object.values(tokens).filter((t) => !confirmed[t.mint] && !discarded[t.mint]).length },
    { k: 'no', l: 'Não é ele', n: no.length },
  ];
  return (
    <Card fixed title="Tokens do operador" icon={Zap}>
      <div className="flex flex-wrap gap-1 border-b border-line px-3 py-1.5">
        {tabs.map((x) => (
          <button key={x.k} className={cn('tab h-6', tab === x.k && 'tab-active', x.k === 'yes' && tab === x.k && 'bg-up/15 text-up', x.k === 'no' && tab === x.k && 'bg-down/15 text-down')} onClick={() => setTab(x.k)}>
            {x.l} <span className="num ml-1 text-[10px] opacity-70">{x.n}</span>
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {tab === 'pending' && (
          <>
            {!pending.length && (
              <div className="p-6 text-center text-[12px] text-dim">
                Os tokens que aparecem nos sinais ficam aqui até você decidir: <b className="text-up">É ele</b> manda para a aba "É ele"; <b className="text-down">Não é ele</b> descarta (dá para desfazer na aba "Não é ele").
              </div>
            )}
            {pending.map((t) => (
              <OpTokenRow key={t.mint} t={t} />
            ))}
          </>
        )}
        {tab === 'yes' && (
          <>
            {!yes.length && <div className="p-6 text-center text-[12px] text-dim">Nenhum token confirmado ainda. Use "É ele" na aba A definir, ou adicione em Confirmados do operador.</div>}
            {yes.map(([mint, c]) =>
              tokens[mint] ? (
                <OpTokenRow key={mint} t={tokens[mint]} />
              ) : (
                <div key={mint} className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2 text-[12px]">
                  <button className="font-bold hover:text-primary" onClick={() => openChart(mint)}>
                    {sym(mint)}
                  </button>
                  <span className="chip border-up/60 bg-up/15 text-up">
                    <BadgeCheck size={10} /> é ele
                  </span>
                  {c.note && <span className="truncate text-[11px] text-muted">{c.note}</span>}
                  <span className="num ml-auto text-[10.5px] text-dim">{new Date(c.at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                  <a className="text-dim hover:text-fg" href={gmgnUrl(mint)} target="_blank" rel="noreferrer">
                    <ExternalLink size={11} />
                  </a>
                </div>
              ),
            )}
          </>
        )}
        {tab === 'no' && (
          <>
            {!no.length && <div className="p-6 text-center text-[12px] text-dim">Nenhum token descartado. Os que você marcar como "Não é ele" ficam aqui, ocultos dos sinais.</div>}
            {no.map(([mint, at]) => (
              <div key={mint} className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2 text-[12px]">
                <button className="font-semibold text-muted hover:text-primary" onClick={() => openChart(mint)}>
                  {sym(mint)}
                </button>
                <span className="chip border-down/50 text-down">não é ele</span>
                <span className="num ml-auto text-[10.5px] text-dim">{new Date(at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                <a className="text-dim hover:text-fg" href={gmgnUrl(mint)} target="_blank" rel="noreferrer">
                  <ExternalLink size={11} />
                </a>
                <button className="btn-ghost" title="Voltar para A definir" onClick={() => operatorTracker.undiscard(mint)}>
                  <Undo2 size={11} /> desfazer
                </button>
                <button className="btn-ghost hover:text-up" title="Na verdade é ele" onClick={() => operatorTracker.confirm(mint)}>
                  <Check size={11} /> é ele
                </button>
              </div>
            ))}
          </>
        )}
      </div>
    </Card>
  );
}

// ---------- confirmados ----------

function Confirmed() {
  const confirmed = useStore((s) => s.operator.confirmed);
  const discarded = useStore((s) => s.operator.discarded);
  const market = useStore((s) => s.tokens);
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [report, setReport] = useState<string | null>(null);
  const [showDiscarded, setShowDiscarded] = useState(false);
  const list = Object.entries(confirmed).sort((a, b) => b[1].at - a[1].at);
  const add = () => {
    const mints = extractAddresses(text);
    if (!mints.length) return toast('Cole o CA ou o link do token');
    mints.forEach((m) => operatorTracker.confirm(m, note.trim()));
    toast(`${mints.length} token(s) salvo(s) nos confirmados`);
    setText('');
    setNote('');
  };
  const setNoteOf = (mint: string, v: string) => {
    const op = useStore.getState().operator;
    useStore.setState({ operator: { ...op, confirmed: { ...op.confirmed, [mint]: { ...op.confirmed[mint], note: v } } } });
  };
  const remove = (mint: string) => {
    const op = useStore.getState().operator;
    const c = { ...op.confirmed };
    delete c[mint];
    useStore.setState({ operator: { ...op, confirmed: c } });
  };
  const gen = async () => {
    setBusy('0/' + list.length);
    const r = await operatorTracker.report((d, t) => setBusy(`${d}/${t}`));
    setReport(r);
    setBusy(null);
    void copyText(r).then((ok) => ok && toast('Relatório copiado — cole no chat'));
  };
  return (
    <Card
      title={`Confirmados do operador (${list.length})`}
      icon={BadgeCheck}
      right={
        <button className="btn h-7" disabled={!list.length || !!busy} onClick={gen}>
          <FileText size={12} /> {busy ? `Gerando ${busy}…` : 'Gerar relatório'}
        </button>
      }
    >
      <div className="space-y-2 border-b border-line p-3">
        <div className="flex flex-wrap gap-1.5">
          <input className="input num h-8 min-w-[200px] flex-[2]" placeholder="CA ou link do token (vários separados por espaço)" value={text} onChange={(e) => setText(e.target.value)} />
          <input className="input h-8 min-w-[120px] flex-1" placeholder="Nota (opcional)" value={note} onChange={(e) => setNote(e.target.value)} />
          <button className="btn h-8 border-up/50 bg-up/10 text-up" onClick={add}>
            <Plus size={13} /> Salvar
          </button>
        </div>
        <p className="text-[10.5px] text-dim">Aqui ficam só os tokens que você confirmou que são dele. O relatório junta os dados públicos (DexScreener) e o que o bot observou, pronto para colar no chat.</p>
      </div>
      <div className="max-h-72 overflow-y-auto">
        {!list.length && <div className="p-4 text-center text-[11px] text-dim">Nenhum token confirmado. Use "É ele" nos sinais ou cole o CA acima.</div>}
        {list.map(([mint, c]) => (
          <div key={mint} className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-1.5 text-[11px]">
            <button className="font-bold hover:underline" onClick={() => openChart(mint)}>
              {market[mint]?.meta.symbol ?? c.symbol ?? shortAddr(mint)}
            </button>
            <span className="num text-dim">{shortAddr(mint, 5)}</span>
            <span className="num text-muted">MCAP {fmtUsd(market[mint]?.lastObservation?.marketCapUsd)}</span>
            <input className="min-w-[100px] flex-1 bg-transparent text-[11px] text-fg/80 outline-none" placeholder="nota…" value={c.note} onChange={(e) => setNoteOf(mint, e.target.value)} />
            <a className="text-dim hover:text-fg" href={gmgnUrl(mint)} target="_blank" rel="noreferrer">
              GMGN
            </a>
            <button className="btn-ghost hover:text-down" title="Tirar dos confirmados" onClick={() => remove(mint)}>
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>
      {report && (
        <div className="space-y-1.5 border-t border-line p-3">
          <div className="flex gap-2">
            <button className="btn h-7" onClick={() => void copyText(report).then(() => toast('Copiado'))}>
              <Copy size={12} /> Copiar
            </button>
            <button
              className="btn h-7"
              onClick={() => {
                const a = document.createElement('a');
                a.href = URL.createObjectURL(new Blob([report], { type: 'text/markdown' }));
                a.download = `relatorio-operador-${new Date().toISOString().slice(0, 10)}.md`;
                a.click();
              }}
            >
              <FileText size={12} /> Baixar .md
            </button>
          </div>
          <textarea readOnly className="input num h-40 py-2 text-[10.5px]" value={report} />
        </div>
      )}
      <div className="border-t border-line px-3 py-1.5">
        <button className="text-[11px] text-muted hover:text-fg" onClick={() => setShowDiscarded(!showDiscarded)}>
          Descartados ("não é ele"): {Object.keys(discarded).length} {showDiscarded ? '▲' : '▼'}
        </button>
        {showDiscarded && (
          <div className="mt-1 max-h-40 overflow-y-auto">
            {Object.entries(discarded).map(([mint, at]) => (
              <div key={mint} className="num flex items-center gap-2 py-0.5 text-[10.5px] text-dim">
                <span>{market[mint]?.meta.symbol ?? shortAddr(mint, 5)}</span>
                <span>{new Date(at).toLocaleString('pt-BR')}</span>
                <button className="ml-auto flex items-center gap-1 hover:text-fg" onClick={() => operatorTracker.undiscard(mint)}>
                  <Undo2 size={11} /> desfazer
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

// ---------- descobrir fazenda ----------

function Discover() {
  const [mode, setMode] = useState<'wallets' | 'tokens'>('wallets');
  const [walletSeed, setWalletSeed] = useState('');
  return (
    <Card title="Descobrir fazenda" icon={Users}>
      <div className="flex flex-wrap gap-1 border-b border-line px-3 py-1.5">
        <button className={cn('tab h-7 px-3', mode === 'wallets' && 'tab-active')} onClick={() => setMode('wallets')}>
          Pelas carteiras que você viu
        </button>
        <button className={cn('tab h-7 px-3', mode === 'tokens' && 'tab-active')} onClick={() => setMode('tokens')}>
          Pelos holders dos tokens
        </button>
      </div>
      {mode === 'wallets' ? (
        <DiscoverWallets seed={walletSeed} />
      ) : (
        <DiscoverTokens
          onAnalyzeWallets={(ws) => {
            setWalletSeed(ws.join('\n'));
            setMode('wallets');
          }}
        />
      )}
      <p className="border-t border-line px-3 py-2 text-[10.5px] text-dim">
        As duas análises leem dados da blockchain pela RPC configurada em Ajustes. A RPC pública é lenta e pode recusar; com uma RPC grátis da Helius fica bem mais rápido.
      </p>
    </Card>
  );
}

function RoleAdd({ addrs, onDone }: { addrs: string[]; onDone: (role: WalletRole) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="text-[11px] text-muted">Rastrear {addrs.length} como</span>
      {ROLES.map((r) => (
        <button
          key={r}
          className={cn('chip h-6 cursor-pointer', roleTone[r])}
          disabled={!addrs.length}
          onClick={() => {
            const n = operatorTracker.addWallets(addrs, r, ROLE_META[r].label);
            toast(n ? `${n} carteira(s) adicionada(s) como ${ROLE_META[r].label}` : 'Essas carteiras já estão na lista');
            onDone(r);
          }}
        >
          <Plus size={10} /> {ROLE_META[r].label}
        </button>
      ))}
    </div>
  );
}

function DiscoverWallets({ seed }: { seed: string }) {
  const known = useStore((s) => s.operator.wallets);
  const market = useStore((s) => s.tokens);
  const [text, setText] = useState(seed);
  const [perWallet, setPerWallet] = useState(25);
  const [windowS, setWindowS] = useState(10);
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [res, setRes] = useState<CrossResult | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (seed) setText(seed);
  }, [seed]);
  const roles = useMemo(() => new Map(known.map((w) => [w.address, w.role])), [known]);
  const run = async () => {
    const ws = extractAddresses(text).slice(0, 15);
    if (ws.length < 2) return toast('Cole pelo menos 2 carteiras para cruzar');
    setErrors([]);
    setRes(null);
    setBusy('0%');
    const errs: string[] = [];
    const r = await operatorTracker.analyzeWallets(ws, perWallet, windowS, (d, t, err) => {
      setBusy(`${Math.round((d / t) * 100)}%`);
      if (err) errs.push(err);
    });
    setErrors(errs);
    setRes(r);
    setSel(new Set(r.wallets.filter((w) => w.shared > 0 && !roles.has(w.wallet)).map((w) => w.wallet)));
    setBusy(null);
  };
  const sym = (mint: string) => market[mint]?.meta.symbol ?? shortAddr(mint, 4);
  const t = (ms: number | null) => (ms == null ? '—' : new Date(ms).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }));
  const est = Math.ceil((extractAddresses(text).slice(0, 15).length * (perWallet + 1)) / 3);
  return (
    <div className="space-y-2 p-3">
      <p className="text-[11px] text-muted">
        Cole as carteiras que você viu trabalhando nos pares do operador (GMGN, Solscan ou endereço, até 15). O bot lê as últimas transações de cada uma e mostra:
        <b className="text-fg"> em quais tokens elas estiveram juntas</b>, <b className="text-fg">quem comprou nos mesmos segundos</b> e <b className="text-fg">quem vendeu junto</b>. Daí você escolhe quais rastrear e com qual papel.
      </p>
      <textarea className="input num h-auto py-2 text-[11px]" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Uma carteira por linha (ou links do GMGN)" />
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
        <label className="flex items-center gap-1">
          Últimas
          <input className="input num h-8 w-14 text-right" type="number" min={5} max={100} value={perWallet} onChange={(e) => setPerWallet(Math.max(5, Math.min(100, Number(e.target.value) || 25)))} />
          transações por carteira
        </label>
        <label className="flex items-center gap-1">
          "Junto" = até
          <input className="input num h-8 w-14 text-right" type="number" min={1} max={300} value={windowS} onChange={(e) => setWindowS(Math.max(1, Math.min(300, Number(e.target.value) || 10)))} />s
        </label>
        <button className="btn ml-auto h-8 border-primary/50 bg-primary/15 text-primary" disabled={!!busy} onClick={run}>
          <Search size={13} /> {busy ? `Analisando ${busy}…` : 'Cruzar carteiras'}
        </button>
      </div>
      {!busy && !res && <div className="text-[10.5px] text-dim">Tempo estimado com a RPC pública: ~{est}s.</div>}
      {errors.length > 0 && <div className="text-[10.5px] text-down">{errors.slice(0, 4).join(' · ')}</div>}
      {res && (
        <>
          <div className="rounded-md border border-line">
            <div className="flex flex-wrap items-center gap-2 border-b border-line px-2.5 py-1.5">
              <span className="label">Carteiras</span>
              <span className="ml-auto" />
              <RoleAdd
                addrs={[...sel]}
                onDone={() => {
                  setSel(new Set());
                }}
              />
            </div>
            <div className="max-h-72 overflow-y-auto">
              {res.wallets.map((w) => {
                const k = roles.get(w.wallet);
                return (
                  <label key={w.wallet} className="num flex cursor-pointer flex-wrap items-center gap-x-2 gap-y-0.5 border-b border-line/60 px-2.5 py-1.5 text-[11px]">
                    <input
                      type="checkbox"
                      disabled={!!k}
                      checked={sel.has(w.wallet)}
                      onChange={() => {
                        const n = new Set(sel);
                        if (n.has(w.wallet)) n.delete(w.wallet);
                        else n.add(w.wallet);
                        setSel(n);
                      }}
                    />
                    <span className="font-semibold">{shortAddr(w.wallet, 5)}</span>
                    {k && <span className={cn('chip', roleTone[k])}>{ROLE_META[k].label}</span>}
                    {!k && w.hint && <span className={cn('chip opacity-80', roleTone[w.hint])} title="Sugestão do bot (só uma dica)">parece {ROLE_META[w.hint].label}</span>}
                    <span className="text-muted">{w.txs} tx · {w.tokens} token(s)</span>
                    <span className={w.shared ? 'text-revival' : 'text-dim'}>{w.shared} em comum</span>
                    <span className={w.syncBuys ? 'text-up' : 'text-dim'} title={`Comprou a até ${windowS}s de outra carteira da lista`}>
                      comprou junto {w.syncBuys}×
                    </span>
                    <span className={w.syncSells ? 'text-down' : 'text-dim'} title={`Vendeu a até ${windowS}s de outra carteira da lista`}>
                      vendeu junto {w.syncSells}×
                    </span>
                    <span className="ml-auto text-dim">
                      {w.boughtSol.toFixed(2)} → {w.soldSol.toFixed(2)} SOL
                    </span>
                    <a className="text-dim hover:text-fg" href={`https://gmgn.ai/sol/address/${w.wallet}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                      <ExternalLink size={11} />
                    </a>
                  </label>
                );
              })}
            </div>
          </div>
          <div className="rounded-md border border-line">
            <div className="label border-b border-line px-2.5 py-1.5">Tokens em comum ({res.shared.length})</div>
            <div className="max-h-72 overflow-y-auto">
              {!res.shared.length && <div className="p-3 text-center text-[11px] text-dim">Nenhum token em comum nessas transações. Aumente o número de transações por carteira.</div>}
              {res.shared.map((s) => (
                <div key={s.mint} className="border-b border-line/60 px-2.5 py-1.5 text-[11px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <button className="font-semibold hover:text-primary" onClick={() => openChart(s.mint)}>
                      ${sym(s.mint)}
                    </button>
                    <span className="text-revival">{s.wallets.length} carteiras</span>
                    {s.buySpreadS != null && (
                      <span className={s.buySpreadS <= windowS ? 'text-up' : 'text-muted'}>
                        entradas em {s.buySpreadS < 60 ? `${Math.round(s.buySpreadS)}s` : `${Math.round(s.buySpreadS / 60)}min`}
                      </span>
                    )}
                    {s.sellSpreadS != null && (
                      <span className={s.sellSpreadS <= windowS ? 'text-down' : 'text-muted'}>
                        saídas em {s.sellSpreadS < 60 ? `${Math.round(s.sellSpreadS)}s` : `${Math.round(s.sellSpreadS / 60)}min`}
                      </span>
                    )}
                    <span className="num ml-auto text-dim">{t(s.firstBuyAt)}</span>
                    <a className="text-dim hover:text-fg" href={gmgnUrl(s.mint)} target="_blank" rel="noreferrer">
                      <ExternalLink size={11} />
                    </a>
                  </div>
                  <div className="num mt-0.5 flex flex-wrap gap-x-3 text-[10.5px] text-muted">
                    {s.wallets.map((w) => (
                      <span key={w.wallet}>
                        {shortAddr(w.wallet, 4)}: {w.buys ? `comprou ${w.buySol.toFixed(2)}` : '—'}
                        {w.sells ? ` · vendeu ${w.sellSol.toFixed(2)}` : ''}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function DiscoverTokens({ onAnalyzeWallets }: { onAnalyzeWallets: (ws: string[]) => void }) {
  const opTokens = useStore((s) => s.operator.tokens);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [rows, setRows] = useState<HolderRow[] | null>(null);
  const [minRepeat, setMinRepeat] = useState(2);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const run = async () => {
    const mints = extractAddresses(text).slice(0, 25);
    if (!mints.length) return toast('Cole links ou endereços dos pares do operador');
    setErrors([]);
    setRows(null);
    setBusy(`0/${mints.length}`);
    const errs: string[] = [];
    const r = await operatorTracker.discoverHolders(mints, (d, t, err) => {
      setBusy(`${d}/${t}`);
      if (err) errs.push(err);
    });
    setErrors(errs);
    setRows(r);
    setSel(new Set(r.filter((x) => x.tokens.length >= Math.min(minRepeat, mints.length) && !x.known).map((x) => x.owner)));
    setBusy(null);
  };
  const shown = (rows ?? []).filter((r) => r.tokens.length >= minRepeat || (rows && extractAddresses(text).length === 1));
  return (
    <div className="space-y-2 p-3">
      <p className="text-[11px] text-muted">
        Cole os CAs (ou links) dos pares que ele lançou ao mesmo tempo. O bot pega os ~20 maiores holders de cada um (ignorando pool e bonding curve) e mostra as carteiras que <b className="text-fg">seguram vários desses pares ao mesmo tempo</b> e quanto do supply cada uma tem. Funciona melhor com os pares ainda vivos (quem já vendeu tudo não aparece como holder).
      </p>
      <textarea className="input num h-auto py-2 text-[11px]" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="CAs ou links dos pares (até 25)" />
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn h-8" disabled={!Object.keys(opTokens).length} onClick={() => setText(Object.keys(opTokens).slice(0, 25).join('\n'))}>
          Usar tokens do operador
        </button>
        <label className="flex items-center gap-1.5 text-[11px] text-muted">
          Aparece em pelo menos
          <input className="input num h-8 w-14 text-right" type="number" min={1} max={25} value={minRepeat} onChange={(e) => setMinRepeat(Math.max(1, Number(e.target.value) || 1))} />
          pares
        </label>
        <button className="btn ml-auto h-8 border-primary/50 bg-primary/15 text-primary" disabled={!!busy} onClick={run}>
          <Search size={13} /> {busy ? `Analisando ${busy}…` : 'Analisar holders'}
        </button>
      </div>
      {errors.length > 0 && <div className="text-[10.5px] text-down">{errors.slice(0, 4).join(' · ')}</div>}
      {rows && (
        <div className="rounded-md border border-line">
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-2.5 py-1.5 text-[11px]">
            <span className="text-muted">{shown.length} carteira(s)</span>
            <button className="btn h-7" disabled={sel.size < 2} onClick={() => onAnalyzeWallets([...sel].slice(0, 15))} title="Lê o histórico dessas carteiras para ver quem comprou e vendeu junto">
              Cruzar histórico das {Math.min(sel.size, 15)}
            </button>
            <span className="ml-auto" />
            <RoleAdd
              addrs={[...sel]}
              onDone={(role) => {
                setRows(rows.map((r) => (sel.has(r.owner) ? { ...r, known: role } : r)));
                setSel(new Set());
              }}
            />
          </div>
          <div className="max-h-72 overflow-y-auto">
            {shown.map((r) => (
              <label key={r.owner} className="num flex cursor-pointer items-center gap-2 border-b border-line/60 px-2.5 py-1.5 text-[11px]">
                <input
                  type="checkbox"
                  disabled={!!r.known}
                  checked={sel.has(r.owner)}
                  onChange={() => {
                    const n = new Set(sel);
                    if (n.has(r.owner)) n.delete(r.owner);
                    else n.add(r.owner);
                    setSel(n);
                  }}
                />
                <span className="font-semibold">{shortAddr(r.owner, 5)}</span>
                {r.known && <span className={cn('chip', roleTone[r.known])}>{ROLE_META[r.known].label}</span>}
                <span className="text-revival">em {r.tokens.length} par(es)</span>
                <span className="ml-auto text-dim">{r.tokens.map((t) => (t.pct != null ? `${t.pct.toFixed(1)}%` : '?')).join(' · ')}</span>
                <a className="text-dim hover:text-fg" href={`https://gmgn.ai/sol/address/${r.owner}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                  <ExternalLink size={11} />
                </a>
              </label>
            ))}
            {!shown.length && <div className="p-3 text-center text-[11px] text-dim">Nenhuma carteira se repete com esse filtro. Diminua o "aparece em pelo menos".</div>}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- ajustes ----------

const KIND_ORDER: SignalKind[] = ['entrada', 'fazenda', 'despejo', 'transferencia', 'migracao_rapida', 'bundle', 'bots_off', 'bots_on'];

/** Som padrão + um som por tipo de sinal (os mesmos sons dos alertas: enviados, globais e embutidos). */
function SignalSounds() {
  const s = useStore((st) => st.operator.settings);
  const [sounds, setSounds] = useState<SoundOption[]>(builtinSounds());
  useEffect(() => {
    void allSounds().then(setSounds);
  }, []);
  const set = (p: Partial<typeof s>) => {
    const op = useStore.getState().operator;
    useStore.setState({ operator: { ...op, settings: { ...op.settings, ...p } } });
  };
  const setKind = (k: SignalKind, v: string) => {
    const ks = { ...(s.kindSounds ?? {}) };
    if (v === '__default') delete ks[k];
    else ks[k] = v === '' ? null : v;
    set({ kindSounds: ks });
  };
  const options = (
    <>
      <option value="">Sem som</option>
      {sounds.map((x) => (
        <option key={x.id} value={x.id}>
          {x.global ? '🌐 ' : x.builtin ? '' : '★ '}
          {x.name}
        </option>
      ))}
    </>
  );
  const play = (id: string | null) => {
    if (!id) return;
    unlockAudio();
    void playSound(id, s.volume);
  };
  return (
    <div className="rounded-md border border-line bg-card p-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="label">Sons dos sinais</div>
        <label className="ml-auto flex items-center gap-2 text-[11px] text-muted">
          Volume
          <input type="range" min={0} max={1} step={0.05} value={s.volume} onChange={(e) => set({ volume: Number(e.target.value) })} />
          <span className="num w-8 text-right">{Math.round(s.volume * 100)}%</span>
        </label>
      </div>
      <p className="mt-1 text-[10.5px] text-dim">
        Escolha um som para cada tipo de sinal (os mesmos sons dos alertas: ★ enviados por você, 🌐 globais e os embutidos). "Padrão" usa o som padrão abaixo. Um som escolhido para um candidato (bundle, migração rápida, bots) toca mesmo com "Som também para candidatos" desligado.
      </p>
      <div className="mt-2 grid gap-x-6 gap-y-1.5 md:grid-cols-2">
        <SoundPick label="Padrão dos sinais" value={s.soundId ?? ''} onChange={(v) => set({ soundId: v || null })} onPlay={() => play(s.soundId)}>
          {options}
        </SoundPick>
        <SoundPick label="Padrão do despejo" value={s.dumpSoundId ?? ''} onChange={(v) => set({ dumpSoundId: v || null })} onPlay={() => play(s.dumpSoundId)}>
          {options}
        </SoundPick>
        {KIND_ORDER.map((k) => {
          const v = s.kindSounds?.[k];
          return (
            <SoundPick
              key={k}
              label={SIGNAL_META[k].label}
              tone={SIGNAL_META[k].tone}
              value={v === undefined ? '__default' : (v ?? '')}
              onChange={(nv) => setKind(k, nv)}
              onPlay={() => play(signalSound(s, k))}
            >
              <option value="__default">Padrão</option>
              {options}
            </SoundPick>
          );
        })}
      </div>
    </div>
  );
}

function SoundPick({ label, tone, value, onChange, onPlay, children }: { label: string; tone?: string; value: string; onChange: (v: string) => void; onPlay: () => void; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 text-[12px]">
      {tone ? <span className={cn('chip', toneCls[tone])}>{label}</span> : <span>{label}</span>}
      <span className="flex items-center gap-1">
        <select className="input h-8 w-44 sm:w-52" value={value} onChange={(e) => onChange(e.target.value)}>
          {children}
        </select>
        <button className="btn-ghost h-8" title="Ouvir" onClick={onPlay}>
          <Play size={12} />
        </button>
      </span>
    </div>
  );
}

function Num({ label, value, onChange, unit, help }: { label: string; value: number; onChange: (v: number) => void; unit?: string; help?: string }) {
  return (
    <label className="flex items-center justify-between gap-3 py-1 text-[12px]" title={help}>
      <span className="text-fg/85">{label}</span>
      <span className="flex items-center gap-1">
        <input className="input num h-8 w-20 text-right" type="number" value={value} onChange={(e) => Number.isFinite(Number(e.target.value)) && onChange(Number(e.target.value))} />
        <span className="w-6 text-[10px] text-dim">{unit}</span>
      </span>
    </label>
  );
}

function PumpKey() {
  const key = useStore((st) => st.prefs.pumpPortalKey);
  const [v, setV] = useState(key);
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-2">
        <input className="input num min-w-[220px] flex-1" type={show ? 'text' : 'password'} placeholder="cole aqui a API key do PumpPortal" value={v} onChange={(e) => setV(e.target.value)} />
        <button className="btn h-8" onClick={() => setShow(!show)}>
          {show ? 'Ocultar' : 'Mostrar'}
        </button>
        <button
          className="btn h-8 border-primary/50 bg-primary/15 text-primary"
          onClick={() => {
            useStore.getState().setPrefs({ pumpPortalKey: v.trim() });
            toast(v.trim() ? 'API key salva — trades das carteiras em tempo real ligados' : 'API key removida');
          }}
        >
          Salvar
        </button>
      </div>
      <p className="text-[10.5px] text-dim">
        Com a key, as compras e vendas das carteiras chegam direto do PumpPortal (subscribeAccountTrade, 0,01 SOL a cada 10 mil eventos, cobrado da carteira ligada à key). A key fica salva só neste navegador e não vai para a nuvem. Status: {key ? <b className="text-up">ativa</b> : 'sem key (usando só a RPC)'}.
      </p>
    </div>
  );
}

function Settings() {
  const s = useStore((st) => st.operator.settings);
  const rpcUrl = useStore((st) => st.prefs.rpcUrl);
  const health = useStore((st) => st.health.find((h) => h.id === 'solana-rpc'));
  const [rpc, setRpc] = useState(rpcUrl);
  const set = (p: Partial<typeof s>) => {
    const op = useStore.getState().operator;
    useStore.setState({ operator: { ...op, settings: { ...op.settings, ...p } } });
  };
  const toggle = (label: string, v: boolean, k: keyof typeof s, hint?: string) => (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <div>
        <div className="text-[12px]">{label}</div>
        {hint && <div className="text-[10.5px] text-dim">{hint}</div>}
      </div>
      <Switch checked={v} onChange={(nv) => set({ [k]: nv })} />
    </div>
  );
  return (
    <Card title="Ajustes" icon={Settings2}>
      <div className="grid gap-x-8 gap-y-3 p-3 md:grid-cols-2">
        <div>
          {toggle('Módulo Operadores ligado', s.enabled, 'enabled', 'Rastreia as carteiras pela RPC enquanto o painel estiver aberto.')}
          {toggle('Detectar migração rápida', s.detectFastMigration, 'detectFastMigration', 'Criado e migrado em poucos minutos (PumpPortal).')}
          {toggle('Detectar bundle no lançamento', s.detectBundle, 'detectBundle', 'Poucas compras grandes nos primeiros minutos (DexScreener).')}
          {toggle('Som também para candidatos', s.soundOnCandidates, 'soundOnCandidates', 'Desligado: bundle, migração rápida e bots só aparecem na lista.')}
          {toggle('Notificação do navegador', s.notify, 'notify', 'Usa a permissão do botão Notif do Dashboard.')}
        </div>
        <div>
          <Num label="Despejo: mínimo de carteiras vendendo" value={s.dumpMinWallets} onChange={(v) => set({ dumpMinWallets: Math.max(2, v) })} />
          <Num label="Despejo: dentro de" unit="s" value={s.dumpWindowS} onChange={(v) => set({ dumpWindowS: Math.max(1, v) })} />
          <Num label="Migração rápida: até" unit="s" value={s.fastMigrationMaxS} onChange={(v) => set({ fastMigrationMaxS: Math.max(1, v) })} />
          <Num label="Bundle: token com até" unit="s" value={s.bundleMaxAgeS} onChange={(v) => set({ bundleMaxAgeS: Math.max(30, v) })} />
          <Num label="Bundle: compra média mínima" unit="$" value={s.bundleMinAvgBuyUsd} onChange={(v) => set({ bundleMinAvgBuyUsd: Math.max(0, v) })} />
          <Num label="Transferência: a partir de" unit="%" value={s.transferMinPctSupply} onChange={(v) => set({ transferMinPctSupply: Math.max(0.1, v) })} help="% do supply movido de/para uma carteira da lista" />
          <Num label="Bots off: txns caem para" unit="%" value={Math.round(s.botsOffRatio * 100)} onChange={(v) => set({ botsOffRatio: Math.min(0.9, Math.max(0.05, v / 100)) })} help="% do pico de transações em 5m dos últimos 30 min" />
        </div>
        <div className="space-y-2 md:col-span-2">
          <SignalSounds />
        </div>
        <div className="space-y-2 md:col-span-2">
          <div className="label">PumpPortal — API key (opcional, canal pago)</div>
          <PumpKey />
        </div>
        <div className="space-y-2">
          <div className="label">RPC da Solana</div>
          <div className="flex gap-2">
            <input className="input num" value={rpc} onChange={(e) => setRpc(e.target.value)} />
            <button
              className="btn h-8"
              onClick={() => {
                useStore.getState().setPrefs({ rpcUrl: rpc.trim() || 'https://api.mainnet-beta.solana.com' });
                toast('RPC salva');
              }}
            >
              Salvar
            </button>
          </div>
          <p className="text-[10.5px] text-dim">Padrão: RPC pública (grátis, com limite por IP). Se ficar lenta, dá para colar aqui a URL de um plano grátis da Helius ou QuickNode.</p>
          {health && <SourceRow h={health} />}
        </div>
      </div>
    </Card>
  );
}

export default function Operators() {
  useEffect(() => {
    // ao abrir a aba, zera o contador de sinais não lidos
    const op = useStore.getState().operator;
    if (op.unread) useStore.setState({ operator: { ...op, unread: 0 } });
    const un = useStore.subscribe((st, prev) => {
      if (st.operator.unread > prev.operator.unread) useStore.setState({ operator: { ...useStore.getState().operator, unread: 0 } });
    });
    return un;
  }, []);
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="space-y-3 p-3">
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <h1 className="text-[18px] font-bold">Operadores</h1>
            <p className="text-[11.5px] text-muted">Rastreio das carteiras do operador e sinais do padrão dele. Separado dos alertas de volume — a decisão de entrar e sair é sua.</p>
          </div>
        </div>
        {/* altura fixa: cada quadro rola por dentro; rolando fora deles você chega em Confirmados e Descobrir */}
        <div className="grid gap-3 md:grid-cols-2 lg:h-[max(460px,calc(100dvh-200px))] lg:grid-cols-[minmax(280px,0.9fr)_minmax(320px,1.2fr)_minmax(300px,1fr)]">
          <Wallets />
          <Signals />
          <OpTokens />
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <Confirmed />
          <Discover />
        </div>
        <Settings />
      </div>
    </div>
  );
}
