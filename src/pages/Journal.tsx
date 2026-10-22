import { useMemo, useState } from 'react';
import { Copy, NotebookPen, Pencil, Trash2, X } from 'lucide-react';
import { useStore, type JournalEntry } from '@/state/store';
import { toast } from '@/ui/primitives';
import { copyText } from '@/lib/links';
import { cn } from '@/lib/cn';

type Unit = JournalEntry['unit'];
const DAY = 86_400_000;
const SOLANA_ADDR = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

const fmt = (v: number, unit: Unit) => {
  const abs = Math.abs(v);
  const s = unit === 'USD' ? `$${abs.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}` : `${abs.toLocaleString('pt-BR', { maximumFractionDigits: 4 })} SOL`;
  return `${v < 0 ? '−' : v > 0 ? '+' : ''}${s}`;
};
const startOfDay = (t: number) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
const startOfWeek = (t: number) => {
  const d = new Date(startOfDay(t));
  const dow = (d.getDay() + 6) % 7; // semana começa na segunda
  return d.getTime() - dow * DAY;
};
const startOfMonth = (t: number) => {
  const d = new Date(startOfDay(t));
  d.setDate(1);
  return d.getTime();
};
const toLocalInput = (t: number) => {
  const d = new Date(t);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};
const parseNum = (s: string) => {
  const n = Number(s.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
};

interface Totals {
  profit: Record<Unit, number>;
  n: number;
  wins: number;
}
function totals(list: JournalEntry[]): Totals {
  const t: Totals = { profit: { SOL: 0, USD: 0 }, n: 0, wins: 0 };
  for (const e of list) {
    const p = e.sell - e.buy;
    t.profit[e.unit] += p;
    t.n++;
    if (p > 0) t.wins++;
  }
  return t;
}

function TotalCard({ label, t }: { label: string; t: Totals }) {
  const units = (['SOL', 'USD'] as Unit[]).filter((u) => t.profit[u] !== 0);
  return (
    <div className="rounded-lg border border-line bg-card p-3">
      <div className="label">{label}</div>
      {units.length ? (
        units.map((u) => (
          <div key={u} className={cn('num mt-1 text-[18px] font-bold', t.profit[u] > 0 ? 'text-up' : 'text-down')}>
            {fmt(t.profit[u], u)}
          </div>
        ))
      ) : (
        <div className="num mt-1 text-[18px] font-bold text-dim">—</div>
      )}
      <div className="mt-1 text-[11px] text-muted">
        {t.n} operaç{t.n === 1 ? 'ão' : 'ões'}
        {t.n > 0 && ` · ${Math.round((t.wins / t.n) * 100)}% no lucro`}
      </div>
    </div>
  );
}

const EMPTY = { symbol: '', ca: '', unit: 'SOL' as Unit, buy: '', sell: '', at: '', note: '' };

export default function Journal() {
  const journal = useStore((s) => s.journal);
  const tokens = useStore((s) => s.tokens);
  const [f, setF] = useState(EMPTY);
  const [editing, setEditing] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');

  const now = Date.now();
  const sorted = useMemo(() => [...journal].sort((a, b) => b.at - a.at), [journal]);
  const sums = useMemo(() => {
    const t = Date.now();
    return {
      day: totals(journal.filter((e) => e.at >= startOfDay(t))),
      week: totals(journal.filter((e) => e.at >= startOfWeek(t))),
      month: totals(journal.filter((e) => e.at >= startOfMonth(t))),
      all: totals(journal),
    };
  }, [journal]);
  const byDay = useMemo(() => {
    const m = new Map<number, JournalEntry[]>();
    for (const e of journal) {
      const d = startOfDay(e.at);
      m.set(d, [...(m.get(d) ?? []), e]);
    }
    return [...m.entries()].sort((a, b) => b[0] - a[0]).slice(0, 14);
  }, [journal]);
  const shown = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return qq ? sorted.filter((e) => e.symbol.toLowerCase().includes(qq) || (e.ca ?? '').toLowerCase().includes(qq) || e.note.toLowerCase().includes(qq)) : sorted;
  }, [sorted, q]);

  const onCa = (v: string) => {
    const ca = v.trim();
    const t = SOLANA_ADDR.test(ca) ? tokens[ca] : undefined;
    setF((x) => ({ ...x, ca: v, symbol: x.symbol || (t?.meta.symbol ?? '') }));
  };

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    const buy = parseNum(f.buy);
    const sell = parseNum(f.sell);
    const ca = f.ca.trim() || null;
    if (!f.symbol.trim() && !ca) return setErr('Informe o par (nome/símbolo) ou o CA.');
    if (ca && !SOLANA_ADDR.test(ca)) return setErr('O CA não parece um endereço Solana válido.');
    if (!Number.isFinite(buy) || buy < 0) return setErr('Valor de entrada inválido.');
    if (!Number.isFinite(sell) || sell < 0) return setErr('Valor de saída inválido.');
    const at = f.at ? new Date(f.at).getTime() : Date.now();
    const entry: JournalEntry = {
      id: editing ?? `j_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      at: Number.isFinite(at) ? at : Date.now(),
      symbol: f.symbol.trim().replace(/^\$/, '') || (ca ? ca.slice(0, 6) : ''),
      ca,
      unit: f.unit,
      buy,
      sell,
      note: f.note.trim(),
    };
    const list = useStore.getState().journal;
    useStore.setState({ journal: editing ? list.map((x) => (x.id === editing ? entry : x)) : [entry, ...list] });
    toast(editing ? 'Operação atualizada' : `Registrado: ${fmt(sell - buy, f.unit)}`);
    setEditing(null);
    setF({ ...EMPTY, unit: f.unit });
  };

  const edit = (e: JournalEntry) => {
    setEditing(e.id);
    setF({ symbol: e.symbol, ca: e.ca ?? '', unit: e.unit, buy: String(e.buy), sell: String(e.sell), at: toLocalInput(e.at), note: e.note });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const remove = (id: string) => {
    useStore.setState({ journal: useStore.getState().journal.filter((x) => x.id !== id) });
    if (editing === id) {
      setEditing(null);
      setF(EMPTY);
    }
  };

  const buyN = parseNum(f.buy);
  const sellN = parseNum(f.sell);
  const preview = Number.isFinite(buyN) && Number.isFinite(sellN) && f.buy !== '' && f.sell !== '' ? sellN - buyN : null;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-[1100px] space-y-4 p-3 sm:p-4">
        <div>
          <h1 className="flex items-center gap-2 text-[18px] font-bold">
            <NotebookPen size={18} className="text-primary" /> Ganhos
          </h1>
          <p className="text-[11.5px] text-muted">Registro manual das suas operações. Fica salvo na sua conta e aparece igual em qualquer aparelho.</p>
        </div>

        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <TotalCard label="Hoje" t={sums.day} />
          <TotalCard label="Esta semana" t={sums.week} />
          <TotalCard label="Este mês" t={sums.month} />
          <TotalCard label="Total" t={sums.all} />
        </div>

        <form onSubmit={save} className="space-y-2.5 rounded-lg border border-line bg-panel p-3">
          <div className="flex items-center gap-2">
            <div className="label">{editing ? 'Editar operação' : 'Nova operação'}</div>
            {editing && (
              <button
                type="button"
                className="btn-ghost ml-auto"
                onClick={() => {
                  setEditing(null);
                  setF(EMPTY);
                }}
              >
                <X size={12} /> Cancelar edição
              </button>
            )}
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_1.6fr]">
            <input className="input h-9" placeholder="Par (ex.: PIG)" value={f.symbol} onChange={(e) => setF({ ...f, symbol: e.target.value })} />
            <input className="input num h-9 text-[11px]" placeholder="CA (opcional)" value={f.ca} onChange={(e) => onCa(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-[auto_1fr_1fr_1fr]">
            <div className="col-span-2 flex rounded-md border border-line p-0.5 sm:col-span-1">
              {(['SOL', 'USD'] as Unit[]).map((u) => (
                <button key={u} type="button" className={cn('h-8 flex-1 rounded px-3 text-[12px] font-bold', f.unit === u ? 'bg-primary/20 text-primary' : 'text-muted')} onClick={() => setF({ ...f, unit: u })}>
                  {u}
                </button>
              ))}
            </div>
            <input className="input num h-9" inputMode="decimal" placeholder={`Entrada (${f.unit})`} value={f.buy} onChange={(e) => setF({ ...f, buy: e.target.value })} />
            <input className="input num h-9" inputMode="decimal" placeholder={`Saída (${f.unit})`} value={f.sell} onChange={(e) => setF({ ...f, sell: e.target.value })} />
            <input className="input num col-span-2 h-9 text-[11px] sm:col-span-1" type="datetime-local" value={f.at} onChange={(e) => setF({ ...f, at: e.target.value })} title="Data da operação (vazio = agora)" />
          </div>
          <input className="input h-9" placeholder="Anotação (opcional): qual alerta/sinal te levou a entrar, etc." value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
          <div className="flex flex-wrap items-center gap-3">
            <button className="btn h-9 border-primary/60 bg-primary/20 px-4 text-[12px] text-primary">{editing ? 'Salvar alterações' : 'Registrar'}</button>
            {preview != null && (
              <span className={cn('num text-[13px] font-bold', preview > 0 ? 'text-up' : preview < 0 ? 'text-down' : 'text-muted')}>
                {fmt(preview, f.unit)}
                {buyN > 0 && ` (${preview >= 0 ? '+' : ''}${((preview / buyN) * 100).toFixed(1)}%)`}
              </span>
            )}
            {err && <span className="text-[12px] text-down">{err}</span>}
          </div>
        </form>

        <div className="grid gap-3 lg:grid-cols-[1fr_300px]">
          <section className="rounded-lg border border-line bg-panel">
            <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
              <div className="label">Operações ({journal.length})</div>
              <input className="input ml-auto h-7 w-full max-w-[220px] text-[11px]" placeholder="Buscar par, CA ou anotação…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            {!shown.length && <div className="p-6 text-center text-[12px] text-dim">{journal.length ? 'Nada encontrado.' : 'Nenhuma operação registrada ainda.'}</div>}
            <div className="divide-y divide-line">
              {shown.map((e) => {
                const p = e.sell - e.buy;
                return (
                  <div key={e.id} className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2', editing === e.id && 'bg-primary/10')}>
                    <div className="min-w-[140px] flex-1">
                      <div className="flex items-center gap-1.5 text-[13px] font-semibold">
                        ${e.symbol}
                        {e.ca && (
                          <button className="text-dim hover:text-fg" title={`Copiar CA ${e.ca}`} onClick={() => void copyText(e.ca!).then(() => toast('CA copiado'))}>
                            <Copy size={11} />
                          </button>
                        )}
                      </div>
                      <div className="num text-[10.5px] text-dim">
                        {new Date(e.at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        {e.note && <span className="ml-1.5 font-sans text-muted">· {e.note}</span>}
                      </div>
                    </div>
                    <div className="num text-right text-[11px] text-muted">
                      {e.buy.toLocaleString('pt-BR', { maximumFractionDigits: 4 })} → {e.sell.toLocaleString('pt-BR', { maximumFractionDigits: 4 })} {e.unit}
                    </div>
                    <div className={cn('num w-[120px] text-right text-[13px] font-bold', p > 0 ? 'text-up' : p < 0 ? 'text-down' : 'text-muted')}>
                      {fmt(p, e.unit)}
                      {e.buy > 0 && <div className="text-[10px] font-medium">{`${p >= 0 ? '+' : ''}${((p / e.buy) * 100).toFixed(1)}%`}</div>}
                    </div>
                    <div className="flex gap-0.5">
                      <button className="btn-ghost" title="Editar" onClick={() => edit(e)}>
                        <Pencil size={12} />
                      </button>
                      <button className="btn-ghost hover:text-down" title="Excluir" onClick={() => remove(e.id)}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
          <section className="h-fit rounded-lg border border-line bg-panel">
            <div className="label border-b border-line px-3 py-2">Por dia (últimos 14 com operação)</div>
            {!byDay.length && <div className="p-4 text-center text-[12px] text-dim">—</div>}
            <div className="divide-y divide-line">
              {byDay.map(([d, list]) => {
                const t = totals(list);
                return (
                  <div key={d} className="flex items-start justify-between gap-2 px-3 py-1.5 text-[12px]">
                    <span className="num text-muted">
                      {d === startOfDay(now) ? 'Hoje' : new Date(d).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}
                      <span className="ml-1 text-[10.5px] text-dim">({t.n})</span>
                    </span>
                    <span className="num text-right">
                      {(['SOL', 'USD'] as Unit[])
                        .filter((u) => t.profit[u] !== 0 || list.some((x) => x.unit === u))
                        .map((u) => (
                          <div key={u} className={cn('font-bold', t.profit[u] > 0 ? 'text-up' : t.profit[u] < 0 ? 'text-down' : 'text-muted')}>
                            {fmt(t.profit[u], u)}
                          </div>
                        ))}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
