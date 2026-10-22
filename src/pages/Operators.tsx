import { useEffect, useMemo, useState } from 'react';
import { Copy, ExternalLink, LineChart, Plus, Search, Skull, Trash2, Wallet, Radar, Settings2, Users, Zap, Check, X, FileText, Undo2, BadgeCheck } from 'lucide-react';
import { useStore } from '@/state/store';
import { useUi } from '@/state/ui';
import { operatorTracker, type HolderRow } from '@/operators/tracker';
import { extractAddresses } from '@/operators/detectors';
import { CANDIDATE_KINDS, MAX_OPERATOR_WALLETS, ROLE_META, SIGNAL_META, type OperatorSignal, type SignalKind, type WalletRole } from '@/operators/types';
import { fmtAge, fmtTime, fmtUsd, shortAddr } from '@/domain/num';
import { axiomUrl, copyText, dexUrl, gmgnUrl } from '@/lib/links';
import { cn } from '@/lib/cn';
import { Switch, toast, useNow } from '@/ui/primitives';
import { SourceRow } from '@/ui/Header';
import { ScamBadge, toggleScamWithToast } from '@/ui/ScamMark';
import { builtinSounds } from '@/services/sound';

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

function OpTokens() {
  const tokens = useStore((s) => s.operator.tokens);
  const market = useStore((s) => s.tokens);
  const scams = useStore((s) => s.scams);
  const confirmed = useStore((s) => s.operator.confirmed);
  const now = useNow(10_000);
  const list = useMemo(() => Object.values(tokens).sort((a, b) => b.lastSignalAt - a.lastSignalAt).slice(0, 60), [tokens]);
  return (
    <Card fixed title={`Tokens do operador (${Object.keys(tokens).length})`} icon={Zap}>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {!list.length && <div className="p-6 text-center text-[12px] text-dim">Os tokens ligados ao operador aparecem aqui, com quantas carteiras da fazenda estão dentro.</div>}
        {list.map((t) => {
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
        })}
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
  const opTokens = useStore((s) => s.operator.tokens);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [rows, setRows] = useState<HolderRow[] | null>(null);
  const [minRepeat, setMinRepeat] = useState(2);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const run = async () => {
    const mints = extractAddresses(text).slice(0, 25);
    if (!mints.length) return toast('Cole links ou endereços de tokens do operador');
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
    <Card title="Descobrir fazenda pelos holders" icon={Users}>
      <div className="space-y-2 p-3">
        <p className="text-[11px] text-muted">
          Cole links (GMGN, DexScreener, Solscan) ou endereços de tokens do operador. O bot busca os ~20 maiores holders de cada um pela RPC, ignora pools e bonding curve, e mostra as carteiras que se repetem entre os tokens.
        </p>
        <textarea className="input num h-auto py-2 text-[11px]" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="https://gmgn.ai/sol/token/…  (até 25 tokens)" />
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn h-8" disabled={!Object.keys(opTokens).length} onClick={() => setText(Object.keys(opTokens).slice(0, 25).join('\n'))}>
            Usar tokens do operador
          </button>
          <label className="flex items-center gap-1.5 text-[11px] text-muted">
            Aparece em pelo menos
            <input className="input num h-8 w-14 text-right" type="number" min={1} max={25} value={minRepeat} onChange={(e) => setMinRepeat(Math.max(1, Number(e.target.value) || 1))} />
            tokens
          </label>
          <button className="btn ml-auto h-8 border-primary/50 bg-primary/15 text-primary" disabled={!!busy} onClick={run}>
            <Search size={13} /> {busy ? `Analisando ${busy}…` : 'Analisar'}
          </button>
        </div>
        {errors.length > 0 && <div className="text-[10.5px] text-down">{errors.slice(0, 4).join(' · ')}</div>}
        {rows && (
          <div className="rounded-md border border-line">
            <div className="flex items-center gap-2 border-b border-line px-2.5 py-1.5 text-[11px]">
              <span className="text-muted">{shown.length} carteira(s)</span>
              <button
                className="btn ml-auto h-7 border-revival/50 text-revival"
                disabled={!sel.size}
                onClick={() => {
                  const n = operatorTracker.addWallets([...sel], 'fazenda', 'Fazenda');
                  toast(`${n} carteira(s) adicionada(s) como Fazenda`);
                  setSel(new Set());
                  setRows(rows.map((r) => (sel.has(r.owner) ? { ...r, known: 'fazenda' } : r)));
                }}
              >
                <Plus size={12} /> Adicionar {sel.size} como Fazenda
              </button>
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
                  <span className="text-revival">em {r.tokens.length} token(s)</span>
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
    </Card>
  );
}

// ---------- ajustes ----------

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
  const sounds = builtinSounds();
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
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 text-[12px]">
            Som dos sinais
            <select className="input h-8 w-48" value={s.soundId ?? ''} onChange={(e) => set({ soundId: e.target.value || null })}>
              <option value="">Sem som</option>
              {sounds.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center justify-between gap-2 text-[12px]">
            Som do despejo
            <select className="input h-8 w-48" value={s.dumpSoundId ?? ''} onChange={(e) => set({ dumpSoundId: e.target.value || null })}>
              <option value="">Sem som</option>
              {sounds.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </div>
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
