import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, Copy, ExternalLink, LineChart, Maximize2, Search, Sparkles, X, Bell, Skull } from 'lucide-react';
import { useStore } from '@/state/store';
import { useUi } from '@/state/ui';
import { collector } from '@/collector/collector';
import { fmtAge, fmtDateTime, fmtPct, fmtTime, fmtUsd, shortAddr } from '@/domain/num';
import { cn } from '@/lib/cn';
import { axiomUrl, chartEmbedUrl, copyText, dexUrl, gmgnUrl, xSearchUrl } from '@/lib/links';
import { ScamBadge, toggleScamWithToast } from '../ScamMark';
import { Modal, Switch, toast, useNow } from '../primitives';
import { TokenLogo } from '../TokenLogo';
import { alertColor, presetBg, presetText } from '../PresetBar';
import { presetLabel } from '../alerts/AlertsPanel';

const REJECT_TEXT: Record<string, string> = {
  ok: 'passou — alerta gerado (ou em cooldown)',
  volume_unknown: 'volume desconhecido',
  volume_below_min: 'volume abaixo do mínimo',
  volume_above_max: 'volume acima do máximo',
  mcap_unknown: 'MCAP desconhecido',
  mcap_below_min: 'MCAP abaixo do mínimo',
  mcap_above_max: 'MCAP acima do máximo',
  mcap_invalid: 'MCAP inválido',
  liquidity_unknown: 'liquidez desconhecida (filtro de liquidez ativo)',
  liquidity_below_min: 'liquidez abaixo do mínimo',
  liquidity_above_max: 'liquidez acima do máximo',
  price_change_below_min: 'variação abaixo do mínimo',
  price_change_above_max: 'variação acima do máximo',
  txns_unknown: 'txns desconhecidas',
  txns_below_min: 'txns abaixo do mínimo',
  txns_above_max: 'txns acima do máximo',
  pair_age_unknown: 'idade do par desconhecida',
  pair_age_below_min: 'par mais novo que o mínimo',
  pair_age_above_max: 'par mais velho que o máximo',
  previous_missing: 'sem snapshot anterior para comparar (aguarde 1 ciclo)',
  previous_volume_invalid: 'volume anterior zero/inválido',
  previous_mcap_invalid: 'MCAP anterior inválido',
  vol_rise_below: 'subida de volume abaixo do preset',
  mcap_rise_below: 'subida de MCAP abaixo do preset',
  buy_price_not_up: 'preço não está subindo (Buy)',
  sell_price_not_down: 'preço não está caindo (Sell)',
  buy_pressure_missing: 'compras não superam vendas',
  sell_pressure_missing: 'vendas não superam compras',
  below_real_volume_floor: 'volume abaixo do piso real',
  pair_too_young: 'par jovem demais para Revival',
  liquidity_above_ceiling: 'liquidez acima do teto',
  not_dead_before_spike: 'não estava morto antes do pico',
  baseline_unavailable: 'baseline indisponível',
  baseline_above_ceiling: 'baseline acima do teto de morto',
  spike_below_multiplier: 'pico abaixo do multiplicador',
};

export function ChartFrame({ token, pair }: { token: string; pair: string | null }) {
  return <iframe key={pair ?? token} title="DexScreener chart" src={chartEmbedUrl(token, pair)} className="h-full w-full border-0 bg-bg" allow="clipboard-write" />;
}

function TokenHeader({ token }: { token: string }) {
  const t = useStore((s) => s.tokens[token]);
  const scam = useStore((s) => !!s.scams[token]);
  const pair = t?.lastObservation?.pairAddress ?? null;
  return (
    <div className="flex items-center gap-2 border-b border-line px-3 py-1.5">
      <TokenLogo src={t?.meta.imageUrl} symbol={t?.meta.symbol} size={20} />
      <span className="font-bold">${t?.meta.symbol ?? '—'}</span>
      <span className="min-w-0 truncate text-[11px] text-muted">{t?.meta.name}</span>
      <span className="num rounded bg-raised px-1.5 text-[10px] text-muted">{shortAddr(token)}</span>
      {scam && <ScamBadge />}
      <div className="ml-auto flex items-center">
        <button className="btn-ghost" title="Copiar CA" onClick={() => void copyText(token).then(() => toast('CA copiado'))}>
          <Copy size={13} />
        </button>
        <a className="btn-ghost" title="DexScreener" href={dexUrl(token, pair)} target="_blank" rel="noreferrer">
          <ExternalLink size={13} />
        </a>
        <a className="btn-ghost text-[10px] font-bold" title="GMGN" href={gmgnUrl(token)} target="_blank" rel="noreferrer">
          GMGN
        </a>
        <a className="btn-ghost text-[10px] font-bold" title="Axiom" href={axiomUrl(token, pair)} target="_blank" rel="noreferrer">
          AXIOM
        </a>
        <button className={cn('btn-ghost', scam && 'text-down')} title={scam ? 'Remover marca de scam' : 'Marcar como scam'} onClick={() => toggleScamWithToast(token, t?.meta.symbol)}>
          <Skull size={13} />
        </button>
        <a className="btn-ghost" title="Buscar no X" href={xSearchUrl(token)} target="_blank" rel="noreferrer">
          <Search size={13} />
        </a>
        <button
          className="btn-ghost"
          title="Tela cheia"
          onClick={() => useUi.getState().set({ chartModal: { token, pair, symbol: t?.meta.symbol ?? null, name: t?.meta.name ?? null, imageUrl: t?.meta.imageUrl ?? null } })}
        >
          <Maximize2 size={13} />
        </button>
        <button className="btn-ghost" title="Fechar" onClick={() => useStore.getState().select(null)}>
          <X size={13} />
        </button>
      </div>
    </div>
  );
}

function Panorama() {
  const tokens = useStore((s) => s.tokens);
  const alerts = useStore((s) => s.alerts);
  const last = useStore((s) => s.lastCycleAt);
  const now = useNow(5000);
  const navigate = useNavigate();
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const today = alerts.filter((a) => a.detectedAt >= start.getTime() && !a.isTest);
  const novos = Object.values(tokens).filter((t) => now - t.addedAt < 5 * 60_000).length;
  const revival = today.filter((a) => a.preset === 'revival').length;
  const stats = [
    { l: 'Monitorados', v: Object.keys(tokens).length, c: 'text-fg' },
    { l: 'Alertas hoje', v: today.length, c: 'text-warn' },
    { l: 'Novos (5m)', v: novos, c: 'text-up' },
    { l: 'Revival', v: revival, c: 'text-revival' },
  ];
  return (
    <div className="space-y-4 p-4">
      <div>
        <div className="flex items-center gap-2 text-[13px] font-extrabold uppercase tracking-[0.12em]">
          <Sparkles size={15} className="text-primary" /> Panorama da sessão
        </div>
        <p className="mt-1 text-[12px] text-muted">Selecione um token ou alerta para abrir o gráfico aqui.</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {stats.map((s) => (
          <div key={s.l} className="rounded-lg border border-line bg-card p-3">
            <div className="label">{s.l}</div>
            <div className={cn('num mt-1 text-[18px] font-bold', s.c)}>{s.v}</div>
          </div>
        ))}
      </div>
      <div className="num flex items-center gap-1.5 text-[11px] text-dim">
        <Clock size={12} /> Último refresh: {last ? `há ${fmtAge(last, now)}` : '—'}
      </div>
      <div>
        <div className="label mb-2 flex items-center gap-1.5 text-[11px]">
          <Bell size={12} className="text-warn" /> Últimos alertas
        </div>
        <div className="space-y-1.5">
          {!alerts.length && <div className="text-[11px] text-dim">Nenhum alerta nesta sessão.</div>}
          {alerts.slice(0, 5).map((a) => (
            <button
              key={a.id}
              className="flex w-full items-center gap-2 rounded-md border border-line bg-card px-2.5 py-2 text-left hover:bg-raised"
              onClick={() => a.tokenAddress !== 'TEST' && useStore.getState().select(a.tokenAddress)}
            >
              <TokenLogo src={a.imageUrl} symbol={a.symbol} size={22} />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 font-bold">
                  {a.symbol} <span className={cn('chip border-transparent', presetBg[alertColor(a)], presetText[alertColor(a)])}>{presetLabel(a)}</span>
                </div>
                <div className="num text-[10px] text-dim">{fmtDateTime(a.detectedAt)}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
      <button className="btn h-9 w-full justify-start" onClick={() => navigate('/history')}>
        <Clock size={14} /> Ver histórico
      </button>
    </div>
  );
}

function TokenHistory({ token }: { token: string }) {
  const t = useStore((s) => s.tokens[token]);
  const alerts = useStore((s) => s.alerts.filter((a) => a.tokenAddress === token));
  const lastCycle = useStore((s) => s.lastCycleAt);
  const hist = useMemo(() => [...collector.getHistory(token)].reverse().slice(0, 120), [token, lastCycle]);
  const debug = useMemo(() => collector.getDebug(token), [token, lastCycle]);
  return (
    <div className="space-y-4 p-3">
      <div>
        <div className="label mb-1.5">Por que alertou / não alertou (último ciclo)</div>
        {!debug && <div className="text-[11px] text-dim">Aguardando a primeira avaliação deste token.</div>}
        {debug && (
          <div className="space-y-1">
            {Object.entries(debug).map(([k, v]) => (
              <div key={k} className="num flex gap-2 text-[11px]">
                <span className="w-24 shrink-0 uppercase text-muted">{k.replace(':', ' ')}</span>
                <span className={v[0] === 'ok' ? 'text-up' : 'text-fg/80'}>{v.map((r) => REJECT_TEXT[r] ?? r).join(' · ')}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div>
        <div className="label mb-1.5">Alertas deste token ({alerts.length})</div>
        {alerts.slice(0, 20).map((a) => (
          <div key={a.id} className="num border-b border-line py-1 text-[11px]">
            <span className={cn('mr-2 font-bold', presetText[alertColor(a)])}>{presetLabel(a)}</span>
            <span className="text-dim">{fmtDateTime(a.detectedAt)}</span>
            <div className="text-fg/80">{a.summary}</div>
          </div>
        ))}
      </div>
      <div>
        <div className="label mb-1.5">Snapshots observados ({hist.length}){t?.lastObservation?.dexId ? ` · ${t.lastObservation.dexId}` : ''}</div>
        <div className="overflow-x-hidden">
          <table className="num w-full table-fixed text-[10.5px]">
            <thead className="text-left text-dim">
              <tr>
                <th className="w-[19%] font-medium">Hora</th>
                <th className="font-medium">MCAP</th>
                <th className="font-medium">Vol 5M</th>
                <th className="font-medium">Δ 5M</th>
                <th className="font-medium">B/S 5M</th>
              </tr>
            </thead>
            <tbody>
              {hist.map((h) => {
                const w = h.windows['5m'];
                return (
                  <tr key={h.observedAt} className="border-t border-line/60">
                    <td className="py-0.5 text-muted">{fmtTime(h.observedAt)}</td>
                    <td>{fmtUsd(h.marketCapUsd)}</td>
                    <td className="text-warn">{fmtUsd(w.volumeUsd)}</td>
                    <td className={w.priceChangePct == null ? '' : w.priceChangePct > 0 ? 'text-up' : 'text-down'}>{fmtPct(w.priceChangePct)}</td>
                    <td className="truncate">{w.buys != null ? `${w.buys}/${w.sells ?? '—'}` : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!hist.length && <div className="text-[11px] text-dim">Nenhum snapshot ainda.</div>}
        </div>
      </div>
    </div>
  );
}

export function ContextPanel() {
  const tab = useStore((s) => s.prefs.rightTab);
  const lateral = useStore((s) => s.prefs.dexLateral);
  const setPrefs = useStore((s) => s.setPrefs);
  const selected = useStore((s) => s.selected);
  const token = useStore((s) => (s.selected ? s.tokens[s.selected] : null));
  return (
    <div className="flex h-full min-h-0 flex-col bg-panel">
      <div className="flex h-9 items-center border-b border-line px-2">
        {(['grafico', 'historico'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setPrefs({ rightTab: t })}
            className={cn('flex h-9 items-center gap-1.5 px-3 text-[11px] font-bold uppercase tracking-[0.12em] text-muted', tab === t && 'border-b-2 border-primary text-primary')}
          >
            {t === 'grafico' ? <LineChart size={13} /> : <Clock size={13} />} {t === 'grafico' ? 'Gráfico' : 'Histórico'}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-2 text-[10px] font-bold uppercase text-muted" title="Ligado: o gráfico abre aqui ao clicar num card. Desligado: abre em janela.">
          Dex lateral <Switch checked={lateral} onChange={(v) => setPrefs({ dexLateral: v })} />
        </label>
      </div>
      {selected && token && <TokenHeader token={selected} />}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {!selected || !token ? (
          <Panorama />
        ) : tab === 'grafico' ? (
          token.lastObservation?.pairAddress || token.status === 'active' ? (
            <ChartFrame token={selected} pair={token.lastObservation?.pairAddress ?? null} />
          ) : (
            <div className="p-6 text-center text-[12px] text-dim">Aguardando o DexScreener encontrar o par deste token…</div>
          )
        ) : (
          <TokenHistory token={selected} />
        )}
      </div>
    </div>
  );
}

export function ChartModal() {
  const c = useUi((s) => s.chartModal);
  const [, force] = useState(0);
  if (!c) return null;
  return (
    <Modal
      open={!!c}
      onOpenChange={(o) => {
        if (!o) useUi.getState().set({ chartModal: null });
        force((x) => x + 1);
      }}
      title={
        <span className="flex items-center gap-2 normal-case tracking-normal">
          <TokenLogo src={c.imageUrl} symbol={c.symbol} size={20} /> ${c.symbol ?? '—'} <span className="text-[11px] font-normal text-muted">{c.name}</span>
        </span>
      }
      className="h-[86vh] max-w-[1200px]"
    >
      <div className="h-full min-h-[60vh]">
        <ChartFrame token={c.token} pair={c.pair} />
      </div>
    </Modal>
  );
}
