import { useMemo, useState } from 'react';
import { Plus, Search, Star, Zap, X, Folder as FolderIcon } from 'lucide-react';
import { useStore, type SortKey } from '@/state/store';
import { useUi } from '@/state/ui';
import { collector } from '@/collector/collector';
import { TIMEFRAMES, type TrackedToken } from '@/domain/types';
import { cn } from '@/lib/cn';
import { Modal, toast, useNow } from '../primitives';
import { TokenCard } from './TokenCard';
import { openToken } from '../ControlBar';
import { MyAlertsPanel } from './MyAlertsPanel';
import { toggleScamWithToast } from '../ScamMark';

const SORTS: { k: SortKey; l: string }[] = [
  { k: 'vol', l: 'VOL' },
  { k: 'mcap', l: 'MCAP' },
  { k: 'liq', l: 'LIQ' },
  { k: 'peak', l: 'PEAK' },
];
const PAGE = 120;

function FolderPicker({ token, onClose }: { token: string | null; onClose: () => void }) {
  const folders = useStore((s) => s.folders);
  const [name, setName] = useState('');
  const toggle = (id: string) => {
    if (!token) return;
    useStore.setState({
      folders: useStore.getState().folders.map((f) => (f.id === id ? { ...f, tokens: f.tokens.includes(token) ? f.tokens.filter((x) => x !== token) : [...f.tokens, token] } : f)),
    });
  };
  const create = () => {
    const n = name.trim();
    if (!n) return;
    const f = { id: Math.random().toString(36).slice(2), name: n, tokens: token ? [token] : [] };
    useStore.setState({ folders: [...useStore.getState().folders, f] });
    setName('');
  };
  return (
    <Modal open={token !== null || false} onOpenChange={(o) => !o && onClose()} title="Pastas" className="max-w-[420px]">
      <div className="space-y-2 p-5">
        {folders.map((f) => (
          <label key={f.id} className="flex cursor-pointer items-center gap-2 rounded border border-line bg-card px-2.5 py-2 text-[12px]">
            <input type="checkbox" checked={!!token && f.tokens.includes(token)} onChange={() => toggle(f.id)} />
            <FolderIcon size={13} className="text-primary" /> {f.name}
            <span className="num ml-auto text-[10px] text-dim">{f.tokens.length}</span>
          </label>
        ))}
        <div className="flex gap-2">
          <input className="input" placeholder="Nova pasta" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()} />
          <button className="btn h-8" onClick={create}>
            <Plus size={13} /> Criar
          </button>
        </div>
      </div>
    </Modal>
  );
}

function sortValue(t: TrackedToken, k: SortKey, tf: string): number {
  const o = t.lastObservation;
  if (!o) return -Infinity;
  if (k === 'vol') return o.windows[tf as '5m'].volumeUsd ?? -Infinity;
  if (k === 'mcap') return o.marketCapUsd ?? -Infinity;
  if (k === 'liq') return o.liquidityUsd ?? -Infinity;
  return t.observedPeakMcap ?? -Infinity;
}

function Watchlist() {
  const tokens = useStore((s) => s.tokens);
  const prefs = useStore((s) => s.prefs);
  const setPrefs = useStore((s) => s.setPrefs);
  const favorites = useStore((s) => s.favorites);
  const scams = useStore((s) => s.scams);
  const folders = useStore((s) => s.folders);
  const tab = useStore((s) => s.watchTab);
  const selected = useStore((s) => s.selected);
  const lastResortAt = useStore((s) => s.lastResortAt);
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [folderFor, setFolderFor] = useState<string | null>(null);
  const now = useNow(5000);
  const count = Object.keys(tokens).length;

  // A ordem só é recalculada no ciclo de "Auto" (ou ao mudar filtro/ordenação),
  // para os cards não pularem enquanto você lê. Os números atualizam ao vivo.
  const order = useMemo(() => {
    const all = Object.values(useStore.getState().tokens);
    const folder = folders.find((f) => f.id === tab);
    let list = all;
    if (tab === 'favoritos') list = all.filter((t) => favorites.includes(t.address));
    else if (folder) list = all.filter((t) => folder.tokens.includes(t.address));
    if (prefs.boostedOnly) list = list.filter((t) => (t.boostAmount ?? 0) > 0 || (t.lastObservation?.boostsActive ?? 0) > 0);
    const qq = q.trim().toLowerCase();
    if (qq) list = list.filter((t) => t.address.toLowerCase().includes(qq) || (t.meta.symbol ?? '').toLowerCase().includes(qq) || (t.meta.name ?? '').toLowerCase().includes(qq));
    const dir = prefs.sortDesc ? -1 : 1;
    return list
      .sort((a, b) => {
        const pa = a.manual ? 1 : 0;
        const pb = b.manual ? 1 : 0;
        if (pa !== pb && prefs.sort === 'vol' && tab === 'geral') return pb - pa;
        const va = sortValue(a, prefs.sort, prefs.watchTf);
        const vb = sortValue(b, prefs.sort, prefs.watchTf);
        if (va === vb) return a.addedAt - b.addedAt;
        if (va === -Infinity) return 1;
        if (vb === -Infinity) return -1;
        return (va - vb) * dir;
      })
      .map((t) => t.address);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastResortAt, prefs.sort, prefs.sortDesc, prefs.watchTf, prefs.boostedOnly, tab, q, favorites, folders, prefs.autoResortS === 0 ? count : 0]);

  // tokens novos que ainda não entraram na ordenação aparecem no fim até o próximo ciclo
  const visible = useMemo(() => {
    const set = new Set(order);
    const extra = tab === 'geral' && !q && !prefs.boostedOnly ? Object.keys(tokens).filter((a) => !set.has(a)) : [];
    return [...order, ...extra].filter((a) => tokens[a]);
  }, [order, tokens, tab, q, prefs.boostedOnly]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-2 border-b border-line px-3 py-2">
        <div className="label text-[11px] text-muted">Watchlist ({count})</div>
        <div className="flex flex-wrap items-center gap-1">
          {[
            { id: 'geral', l: 'Geral' },
            { id: 'favoritos', l: 'Favoritos' },
          ].map((x) => (
            <button key={x.id} className={cn('tab flex items-center gap-1', tab === x.id && 'tab-active')} onClick={() => useStore.setState({ watchTab: x.id })}>
              {x.id === 'favoritos' && <Star size={11} />} {x.l}
            </button>
          ))}
          {folders.map((f) => (
            <span key={f.id} className={cn('tab flex items-center gap-1', tab === f.id && 'tab-active')}>
              <button className="flex items-center gap-1" onClick={() => useStore.setState({ watchTab: f.id })}>
                <FolderIcon size={11} /> {f.name}
              </button>
              {tab === f.id && (
                <button
                  title="Excluir pasta"
                  onClick={() => {
                    useStore.setState({ folders: folders.filter((x) => x.id !== f.id), watchTab: 'geral' });
                  }}
                >
                  <X size={11} />
                </button>
              )}
            </span>
          ))}
          <button className="tab flex items-center gap-1 border border-dashed border-line" onClick={() => setFolderFor('')}>
            <Plus size={11} /> Folder
          </button>
        </div>
        <div className="relative">
          <Search size={12} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-dim" />
          <input className="input num h-7 pl-7 text-[11px]" placeholder="Buscar no watchlist…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] font-semibold uppercase text-dim">
          <span>Time:</span>
          {TIMEFRAMES.map((tf) => (
            <button key={tf} className={cn('tab h-5 px-1.5 text-[10px]', prefs.watchTf === tf && 'tab-active')} onClick={() => setPrefs({ watchTf: tf })}>
              {tf.toUpperCase()}
            </button>
          ))}
          <span className="ml-1">Sort:</span>
          {SORTS.map((s) => (
            <button
              key={s.k}
              className={cn('tab h-5 px-1.5 text-[10px]', prefs.sort === s.k && 'tab-active')}
              onClick={() => (prefs.sort === s.k ? setPrefs({ sortDesc: !prefs.sortDesc }) : setPrefs({ sort: s.k, sortDesc: true }))}
            >
              {s.l}
              {prefs.sort === s.k ? (prefs.sortDesc ? ' ↓' : ' ↑') : ''}
            </button>
          ))}
          <button className={cn('tab flex h-5 items-center gap-1 px-1.5 text-[10px]', prefs.boostedOnly && 'tab-active')} onClick={() => setPrefs({ boostedOnly: !prefs.boostedOnly })}>
            <Zap size={10} /> Boosted
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {!visible.length && (
          <div className="p-6 text-center text-[12px] text-dim">
            {count === 0 ? (
              <>
                Watchlist vazia. Clique em <b className="text-fg">START</b> para descobrir tokens novos da Pump.fun e os destaques do DexScreener, ou use <b className="text-fg">Add Token</b>.
              </>
            ) : (
              'Nenhum token neste filtro.'
            )}
          </div>
        )}
        {visible.slice(0, limit).map((a) => (
          <TokenCard
            key={a}
            t={tokens[a]}
            tf={prefs.watchTf}
            now={now}
            favorite={favorites.includes(a)}
            scam={!!scams[a]}
            selected={selected === a}
            onOpen={openToken}
            onFavorite={(x) => useStore.getState().toggleFavorite(x)}
            onRemove={(x) => {
              collector.removeToken(x);
              toast('Token removido');
            }}
            onMyAlert={(x) => {
              useUi.getState().set({ myAlertFor: x });
              setPrefs({ leftTab: 'myalerts' });
            }}
            onFolder={(x) => setFolderFor(x)}
            onScam={(x) => toggleScamWithToast(x, tokens[x]?.meta.symbol)}
          />
        ))}
        {visible.length > limit && (
          <button className="w-full py-3 text-[11px] text-primary hover:bg-card" onClick={() => setLimit(limit + PAGE)}>
            Mostrar mais ({visible.length - limit})
          </button>
        )}
      </div>
      <FolderPicker token={folderFor} onClose={() => setFolderFor(null)} />
    </div>
  );
}

export function LeftPanel() {
  const tab = useStore((s) => s.prefs.leftTab);
  const setPrefs = useStore((s) => s.setPrefs);
  const nMy = useStore((s) => s.myAlerts.filter((m) => m.status === 'waiting').length);
  return (
    <div className="flex h-full min-h-0 flex-col bg-panel">
      <div className="grid grid-cols-2 border-b border-line">
        {(['watchlist', 'myalerts'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setPrefs({ leftTab: t })}
            className={cn('h-9 text-[11px] font-bold uppercase tracking-[0.15em] text-muted', tab === t && (t === 'watchlist' ? 'border-b-2 border-primary text-primary' : 'border-b-2 border-custom text-custom'))}
          >
            {t === 'watchlist' ? 'Watchlist' : `My Alerts${nMy ? ` (${nMy})` : ''}`}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1">{tab === 'watchlist' ? <Watchlist /> : <MyAlertsPanel />}</div>
    </div>
  );
}
