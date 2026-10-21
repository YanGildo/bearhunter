import { memo } from 'react';
import { Star, LineChart, Copy, ExternalLink, Search, Trash2, BellPlus, FolderPlus, Flame, Zap, Skull } from 'lucide-react';
import type { Timeframe, TrackedToken } from '@/domain/types';
import { fmtAge, fmtInt, fmtPct, fmtUsd } from '@/domain/num';
import { TokenLogo } from '../TokenLogo';
import { cn } from '@/lib/cn';
import { axiomUrl, copyText, dexUrl, gmgnUrl, xSearchUrl } from '@/lib/links';
import { ScamBadge } from '../ScamMark';
import { toast } from '../primitives';

const TF_LABEL: Record<Timeframe, string> = { '5m': '5M', '1h': '1H', '6h': '6H', '24h': '24H' };

export const SOURCE_LABEL: Record<string, string> = {
  manual: 'manual',
  pumpportal_new: 'pumpportal_new',
  pumpportal_migrated: 'pumpportal_migrated',
  boosted: 'boosted',
  profile: 'dex_profile',
  search: 'search',
};

interface Props {
  t: TrackedToken;
  tf: Timeframe;
  now: number;
  favorite: boolean;
  scam: boolean;
  selected: boolean;
  onOpen: (a: string) => void;
  onFavorite: (a: string) => void;
  onRemove: (a: string) => void;
  onMyAlert: (a: string) => void;
  onFolder: (a: string) => void;
  onScam: (a: string) => void;
}

function CardImpl({ t, tf, now, favorite, scam, selected, onOpen, onFavorite, onRemove, onMyAlert, onFolder, onScam }: Props) {
  const o = t.lastObservation;
  const w = o?.windows[tf];
  const change = w?.priceChangePct ?? null;
  const txns = w?.buys != null && w?.sells != null ? w.buys + w.sells : null;
  const dot = t.status === 'active' ? 'bg-up' : t.status === 'waiting' ? 'bg-warn animate-pulse' : 'bg-dim';
  const isCurve = o?.dexId === 'pumpfun';
  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  };
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(t.address)}
      onKeyDown={(e) => e.key === 'Enter' && onOpen(t.address)}
      className={cn(
        'group cursor-pointer border-b border-line px-3 py-2.5 transition-colors hover:bg-card',
        scam && 'bg-down/[0.06] shadow-[inset_3px_0_0_hsl(var(--down))]',
        selected && 'bg-primary/[0.07] shadow-[inset_2px_0_0_hsl(var(--primary))]',
      )}
    >
      <div className="flex items-center gap-2">
        <TokenLogo src={t.meta.imageUrl} symbol={t.meta.symbol} size={24} />
        <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', dot)} title={t.status} />
        <span className="truncate text-[13px] font-bold">{t.meta.symbol ?? t.address.slice(0, 6)}</span>
        <span className="min-w-0 truncate text-[11px] text-muted">{t.meta.name ?? (t.status === 'waiting' ? 'aguardando dados…' : '')}</span>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {scam && <ScamBadge />}
          {t.manual && <span className="chip border-primary/40 text-primary">manual</span>}
          {isCurve && <span className="chip border-initial/40 text-initial" title="Ainda na bonding curve da Pump.fun">curve</span>}
          {t.hot && (
            <span className="chip border-explosive/40 bg-explosive/10 text-explosive">
              <Flame size={10} /> hot
            </span>
          )}
          {t.boostAmount != null && t.boostAmount > 0 && (
            <span className="chip border-warn/40 bg-warn/15 text-warn">
              <Zap size={10} /> {t.boostAmount}
            </span>
          )}
          <div className="hidden items-center group-hover:flex">
            <button className="btn-ghost px-1" title="Favorito" onClick={stop(() => onFavorite(t.address))}>
              <Star size={13} className={favorite ? 'fill-warn text-warn' : ''} />
            </button>
            <button className={cn('btn-ghost px-1', scam && 'text-down')} title={scam ? 'Remover marca de scam' : 'Marcar como scam'} onClick={stop(() => onScam(t.address))}>
              <Skull size={13} />
            </button>
            <button className="btn-ghost px-1" title="Adicionar a pasta" onClick={stop(() => onFolder(t.address))}>
              <FolderPlus size={13} />
            </button>
            <button className="btn-ghost px-1" title="Criar My Alert" onClick={stop(() => onMyAlert(t.address))}>
              <BellPlus size={13} />
            </button>
            <button className="btn-ghost px-1" title="Gráfico" onClick={stop(() => onOpen(t.address))}>
              <LineChart size={13} />
            </button>
            <button className="btn-ghost px-1" title="Copiar CA" onClick={stop(() => void copyText(t.address).then(() => toast('CA copiado')))}>
              <Copy size={13} />
            </button>
            <a className="btn-ghost px-1" title="DexScreener" href={dexUrl(t.address, o?.pairAddress)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
              <ExternalLink size={13} />
            </a>
            <a className="btn-ghost px-1 text-[11px] font-bold" title="GMGN" href={gmgnUrl(t.address)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
              G
            </a>
            <a className="btn-ghost px-1 text-[11px] font-bold" title="Axiom" href={axiomUrl(t.address, o?.pairAddress)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
              AX
            </a>
            <a className="btn-ghost px-1" title="Buscar no X" href={xSearchUrl(t.address)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
              <Search size={13} />
            </a>
            <button className="btn-ghost px-1 hover:text-down" title="Remover" onClick={stop(() => onRemove(t.address))}>
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-4 gap-2">
        <div>
          <div className="label">MCAP</div>
          <div className="num text-[12px] font-semibold">{fmtUsd(o?.marketCapUsd)}</div>
        </div>
        <div>
          <div className="label">{TF_LABEL[tf]} VOL</div>
          <div className="num text-[12px] font-semibold text-warn">{fmtUsd(w?.volumeUsd)}</div>
        </div>
        <div>
          <div className="label">{TF_LABEL[tf]} Δ</div>
          <div className={cn('num text-[12px] font-semibold', change == null ? 'text-dim' : change > 0 ? 'text-up' : change < 0 ? 'text-down' : 'text-muted')}>{fmtPct(change)}</div>
        </div>
        <div>
          <div className="label" title="Maior MCAP que o bot observou (não é o ATH absoluto)">PEAK</div>
          <div className="num text-[12px] text-muted">{fmtUsd(t.observedPeakMcap)}</div>
        </div>
      </div>
      <div className="num mt-1.5 truncate text-[10.5px] text-dim">
        Age {fmtAge(o?.pairCreatedAt, now)} · Liq {o?.liquidityUsd != null ? fmtUsd(o.liquidityUsd) : isCurve ? 'curve' : '—'} · B/S {w?.buys != null ? `${w.buys}/${w.sells ?? '—'}` : '—'} · Txns {fmtInt(txns)} · {SOURCE_LABEL[t.discovery] ?? t.discovery}
        {o?.dexId && !isCurve ? ` · ${o.dexId}` : ''}
      </div>
    </div>
  );
}

export const TokenCard = memo(CardImpl);
