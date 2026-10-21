import { memo, useMemo, useState } from 'react';
import { Bell, Copy, ExternalLink, LineChart, Search, Star, TrendingUp, TrendingDown, Zap, Flame, Crosshair, Eye, BellRing, Skull } from 'lucide-react';
import { useStore, type AlertFilter } from '@/state/store';
import type { Alert } from '@/domain/types';
import { fmtAge, fmtDateTime, fmtUsd } from '@/domain/num';
import { PRESET_META } from '@/domain/presets';
import { cn } from '@/lib/cn';
import { axiomUrl, copyText, dexUrl, gmgnUrl, xSearchUrl } from '@/lib/links';
import { ScamBadge, toggleScamWithToast } from '../ScamMark';
import { TokenLogo } from '../TokenLogo';
import { toast, useNow } from '../primitives';
import { alertColor, INDICATOR_ICON, presetBg, presetBorder, presetText } from '../PresetBar';
import { openToken } from '../ControlBar';
import { useUi } from '@/state/ui';

const FILTERS: { k: AlertFilter; l: string; icon: typeof Bell }[] = [
  { k: 'all', l: 'All', icon: Bell },
  { k: 'initial', l: 'Inicial', icon: Eye },
  { k: 'strong', l: 'Forte', icon: Crosshair },
  { k: 'explosive', l: 'Explosivo', icon: Flame },
  { k: 'revival', l: 'Revival', icon: Zap },
  { k: 'custom', l: 'Custom', icon: BellRing },
];

const glow: Record<string, string> = {
  initial: 'glow-initial',
  strong: 'glow-strong',
  explosive: 'glow-explosive',
  revival: 'glow-revival',
  custom: 'glow-custom',
  cyan: 'glow-cyan',
  pink: 'glow-pink',
  lime: 'glow-lime',
  test: '',
};

const WARN_TEXT: Record<string, string> = {
  bonding_curve_sem_liquidez: 'bonding curve: sem liquidez',
  liquidez_desconhecida: 'liquidez desconhecida',
  mcap_via_fdv: 'MCAP via FDV',
  idade_desconhecida: 'idade desconhecida',
};

export function presetLabel(a: Alert) {
  if (a.preset === 'custom') return 'CUSTOM';
  if (a.preset === 'test') return 'TEST';
  if (a.preset.startsWith('ind:')) {
    const lvl = a.level && a.level !== 'normal' ? ` ${a.level.toUpperCase()}` : '';
    return `${(a.presetName ?? 'Indicador').toUpperCase()}${lvl}`;
  }
  return PRESET_META[a.preset as keyof typeof PRESET_META].short.toUpperCase();
}

function AlertCardImpl({ a, now, isNew, favorite, scam }: { a: Alert; now: number; isNew: boolean; favorite: boolean; scam: boolean }) {
  const p = alertColor(a);
  const tokenKnown = a.tokenAddress !== 'TEST';
  const isNovo = a.pairCreatedAt != null ? now - a.pairCreatedAt < 24 * 3600_000 : null;
  const Dir = a.direction === 'buy' ? TrendingUp : TrendingDown;
  const open = () => {
    if (!tokenKnown) return;
    if (useStore.getState().tokens[a.tokenAddress]) openToken(a.tokenAddress);
    else useUi.getState().set({ chartModal: { token: a.tokenAddress, pair: a.pairAddress, symbol: a.symbol, name: a.name, imageUrl: a.imageUrl } });
  };
  return (
    <div
      onClick={(e) => {
        // clique em qualquer parte do card abre o gráfico; botões e links mantêm a própria ação
        if ((e.target as HTMLElement).closest('a,button')) return;
        open();
      }}
      className={cn('rounded-lg border bg-card p-3', tokenKnown && 'cursor-pointer transition-colors hover:bg-raised/60',
        scam && 'bg-down/[0.06]', presetBorder[p], glow[p], isNew && 'flash-in')}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <TokenLogo src={a.imageUrl} symbol={a.symbol} size={22} />
        <Dir size={14} className={a.direction === 'buy' ? 'text-up' : 'text-down'} />
        <span className="text-[13px] font-bold">{a.symbol ?? '—'}</span>
        <span className={cn('chip', presetBorder[p], presetBg[p], presetText[p])}>{presetLabel(a)}</span>
        {a.preset !== 'custom' && <span className="chip border-line bg-raised text-fg">{a.timeframe.toUpperCase()}</span>}
        {a.preset !== 'custom' && (
          <span className={cn('chip', a.direction === 'buy' ? 'border-up/40 bg-up/15 text-up' : 'border-down/40 bg-down/15 text-down')}>
            <Dir size={10} /> {a.direction === 'buy' ? 'BUY' : 'SELL'}
          </span>
        )}
        {isNovo != null && <span className={cn('chip border-line', isNovo ? 'text-initial' : 'text-muted')}>{isNovo ? 'NOVO' : 'ANTIGO'}</span>}
        {a.dexId === 'pumpfun' && <span className="chip border-initial/30 text-initial">curve</span>}
        {scam && <ScamBadge />}
        {a.isTest && <span className="chip border-warn/50 bg-warn/15 text-warn">TEST</span>}
        <div className="ml-auto flex items-center gap-1.5">
          {tokenKnown && (
            <button className="btn-ghost px-1" title="Favoritar token" onClick={() => useStore.getState().toggleFavorite(a.tokenAddress)}>
              <Star size={13} className={favorite ? 'fill-warn text-warn' : ''} />
            </button>
          )}
          <span className="num rounded border border-line bg-raised px-2 py-0.5 text-[10.5px] font-semibold">{fmtDateTime(a.detectedAt)}</span>
        </div>
      </div>
      <div className={cn('mt-2 text-[12px] font-medium', presetText[p])}>
        <span className="text-fg/90">{a.summary}</span>
      </div>
      <div className="mt-2.5 grid grid-cols-4 gap-2">
        <div>
          <div className="label">MCAP</div>
          <div className="num text-[12px] font-semibold">{fmtUsd(a.marketCapUsd)}</div>
        </div>
        <div>
          <div className="label">{a.timeframe.toUpperCase()} VOL</div>
          <div className="num text-[12px] font-semibold text-warn">{fmtUsd(a.volumeUsd)}</div>
        </div>
        <div>
          <div className="label">AGE</div>
          <div className="num text-[12px]">{fmtAge(a.pairCreatedAt, a.detectedAt)}</div>
        </div>
        <div>
          <div className="label">MODE</div>
          <div className={cn('num text-[12px] font-bold', presetText[p])}>{presetLabel(a)}</div>
        </div>
      </div>
      {!!a.warnings.length && <div className="num mt-1.5 text-[10px] text-dim">⚠ {a.warnings.map((w) => WARN_TEXT[w] ?? w).join(' · ')}</div>}
      {tokenKnown && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold">
          <button className="flex items-center gap-1 text-warn hover:underline" onClick={open}>
            <LineChart size={12} /> Ver gráfico
          </button>
          <a className="flex items-center gap-1 text-warn hover:underline" href={dexUrl(a.tokenAddress, a.pairAddress)} target="_blank" rel="noreferrer">
            <ExternalLink size={12} /> DexScreener
          </a>
          <a className="flex items-center gap-1 text-up hover:underline" href={gmgnUrl(a.tokenAddress)} target="_blank" rel="noreferrer">
            <ExternalLink size={12} /> GMGN
          </a>
          <a className="flex items-center gap-1 text-initial hover:underline" href={axiomUrl(a.tokenAddress, a.pairAddress)} target="_blank" rel="noreferrer">
            <ExternalLink size={12} /> Axiom
          </a>
          <a className="flex items-center gap-1 text-warn hover:underline" href={xSearchUrl(a.tokenAddress)} target="_blank" rel="noreferrer">
            <Search size={12} /> Search on X
          </a>
          <button className="flex items-center gap-1 text-muted hover:text-fg" onClick={() => void copyText(a.tokenAddress).then(() => toast('CA copiado'))}>
            <Copy size={12} /> Copy CA
          </button>
          <button className={cn('flex items-center gap-1 hover:underline', scam ? 'text-down' : 'text-muted hover:text-down')} onClick={() => toggleScamWithToast(a.tokenAddress, a.symbol)}>
            <Skull size={12} /> {scam ? 'Desmarcar scam' : 'Scam'}
          </button>
        </div>
      )}
    </div>
  );
}
export const AlertCard = memo(AlertCardImpl);

export function AlertsPanel() {
  const alerts = useStore((s) => s.alerts);
  const filter = useStore((s) => s.alertFilter);
  const favorites = useStore((s) => s.favorites);
  const newIds = useStore((s) => s.newAlertIds);
  const scams = useStore((s) => s.scams);
  const indicators = useStore((s) => s.indicators);
  const [q, setQ] = useState('');
  const now = useNow(10_000);
  const list = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return alerts.filter((a) => {
      if (filter !== 'all' && a.preset !== filter) return false;
      if (!qq) return true;
      return a.tokenAddress.toLowerCase().includes(qq) || (a.pairAddress ?? '').toLowerCase().includes(qq) || (a.symbol ?? '').toLowerCase().includes(qq) || (a.name ?? '').toLowerCase().includes(qq);
    });
  }, [alerts, filter, q]);
  return (
    <div className="flex h-full min-h-0 flex-col bg-panel">
      <div className="flex min-h-9 flex-wrap items-center gap-x-2 gap-y-1 border-b border-line px-3 py-1">
        <span className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.12em]">
          <Bell size={13} className="text-warn" /> Alerts ({alerts.length})
        </span>
        <div className="ml-auto flex flex-wrap gap-0.5">
          {[...FILTERS.slice(0, 5), ...indicators.map((i) => ({ k: i.id as AlertFilter, l: i.name, icon: INDICATOR_ICON })), FILTERS[5]].map((f) => (
            <button
              key={f.k}
              onClick={() => useStore.setState({ alertFilter: f.k })}
              className={cn('tab flex h-6 items-center gap-1 text-[10px] font-semibold uppercase', filter === f.k && 'tab-active')}
            >
              <f.icon size={11} /> {f.l}
            </button>
          ))}
        </div>
      </div>
      <div className="border-b border-line p-2.5">
        <div className="relative">
          <Search size={12} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-dim" />
          <input className="input num h-8 pl-7 text-[11px]" placeholder="Buscar por nome, ticker, CA ou pair…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-2.5">
        {!list.length && (
          <div className="pt-8 text-center text-[12px] text-dim">
            {alerts.length ? 'Nenhum alerta neste filtro.' : 'Nenhum alerta ainda. Quando um token bater os parâmetros de um preset ativo, ele aparece aqui e o som toca.'}
          </div>
        )}
        {list.slice(0, 200).map((a) => (
          <AlertCard key={a.id} a={a} now={now} isNew={newIds.has(a.id)} favorite={favorites.includes(a.tokenAddress)} scam={!!scams[a.tokenAddress]} />
        ))}
      </div>
    </div>
  );
}
