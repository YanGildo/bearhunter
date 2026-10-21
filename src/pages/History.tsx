import { useEffect, useMemo, useState } from 'react';
import { Download, Search } from 'lucide-react';
import { store as db } from '@/storage/db';
import type { Alert } from '@/domain/types';
import { useStore, type AlertFilter } from '@/state/store';
import { AlertCard } from '@/ui/alerts/AlertsPanel';
import { cn } from '@/lib/cn';
import { useNow } from '@/ui/primitives';

const FILTERS: { k: AlertFilter; l: string }[] = [
  { k: 'all', l: 'Todos' },
  { k: 'initial', l: 'Initial' },
  { k: 'strong', l: 'Strong' },
  { k: 'explosive', l: 'Explosive' },
  { k: 'revival', l: 'Revival' },
  { k: 'custom', l: 'Custom' },
];
const PAGE = 40;

export default function History() {
  const [all, setAll] = useState<Alert[] | null>(null);
  const [q, setQ] = useState('');
  const [f, setF] = useState<AlertFilter>('all');
  const [sort, setSort] = useState<'time' | 'mcap' | 'vol'>('time');
  const [page, setPage] = useState(0);
  const favorites = useStore((s) => s.favorites);
  const scams = useStore((s) => s.scams);
  const now = useNow(30_000);

  // carregado sob demanda, só ao abrir a página
  useEffect(() => {
    void db.recentAlerts(5000).then(setAll);
  }, []);

  const list = useMemo(() => {
    const qq = q.trim().toLowerCase();
    const l = (all ?? []).filter(
      (a) =>
        (f === 'all' || a.preset === f) &&
        (!qq || a.tokenAddress.toLowerCase().includes(qq) || (a.symbol ?? '').toLowerCase().includes(qq) || (a.name ?? '').toLowerCase().includes(qq)),
    );
    const v = (a: Alert) => (sort === 'time' ? a.detectedAt : sort === 'mcap' ? a.marketCapUsd ?? -1 : a.volumeUsd ?? -1);
    return l.sort((a, b) => v(b) - v(a));
  }, [all, q, f, sort]);

  const pages = Math.max(1, Math.ceil(list.length / PAGE));
  const exportCsv = () => {
    const cols = ['detectedAt', 'preset', 'timeframe', 'direction', 'symbol', 'tokenAddress', 'pairAddress', 'dexId', 'marketCapUsd', 'volumeUsd', 'volRisePct', 'mcapRisePct', 'priceChangePct', 'buys', 'sells', 'liquidityUsd', 'summary'] as const;
    const rows = list.map((a) => cols.map((c) => (c === 'detectedAt' ? new Date(a.detectedAt).toISOString() : JSON.stringify(a[c] ?? ''))).join(','));
    const blob = new Blob([[cols.join(','), ...rows].join('\n')], { type: 'text/csv' });
    const el = document.createElement('a');
    el.href = URL.createObjectURL(blob);
    el.download = `bearhunter-alertas-${new Date().toISOString().slice(0, 10)}.csv`;
    el.click();
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-[1100px] space-y-4 p-4">
        <div>
          <h1 className="text-[20px] font-bold">History</h1>
          <p className="text-[12px] text-muted">Todos os alertas salvos neste navegador.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-dim" />
            <input className="input pl-8" placeholder="Buscar por ticker, nome ou CA…" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} />
          </div>
          <div className="flex flex-wrap gap-1">
            {FILTERS.map((x) => (
              <button key={x.k} className={cn('tab h-8 px-3', f === x.k && 'tab-active')} onClick={() => { setF(x.k); setPage(0); }}>
                {x.l}
              </button>
            ))}
          </div>
          <select className="input h-8 w-36" value={sort} onChange={(e) => setSort(e.target.value as 'time')}>
            <option value="time">Mais recentes</option>
            <option value="mcap">Maior MCAP</option>
            <option value="vol">Maior volume</option>
          </select>
          <button className="btn h-8" onClick={exportCsv} disabled={!list.length}>
            <Download size={13} /> CSV
          </button>
        </div>
        {all === null && <div className="text-[12px] text-dim">Carregando…</div>}
        {all && !list.length && <div className="py-10 text-center text-[12px] text-dim">Nenhum alerta salvo{q || f !== 'all' ? ' com esses filtros' : ''}.</div>}
        <div className="grid gap-2.5 md:grid-cols-2">
          {list.slice(page * PAGE, (page + 1) * PAGE).map((a) => (
            <AlertCard key={a.id} a={a} now={now} isNew={false} favorite={favorites.includes(a.tokenAddress)} scam={!!scams[a.tokenAddress]} />
          ))}
        </div>
        {pages > 1 && (
          <div className="flex items-center justify-center gap-3 pb-6">
            <button className="btn" disabled={page === 0} onClick={() => setPage(page - 1)}>
              Anterior
            </button>
            <span className="num text-[11px] text-muted">
              {page + 1} / {pages} · {list.length} alertas
            </span>
            <button className="btn" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>
              Próxima
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
