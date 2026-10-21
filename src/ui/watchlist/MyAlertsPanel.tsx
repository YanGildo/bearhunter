import { useEffect, useState } from 'react';
import { BellPlus, RotateCcw, Trash2, Power } from 'lucide-react';
import { useStore } from '@/state/store';
import { useUi } from '@/state/ui';
import type { MyAlert, MyAlertMetric } from '@/domain/types';
import { fmtDateTime, fmtPct, fmtUsd } from '@/domain/num';
import { cn } from '@/lib/cn';
import { TokenLogo } from '../TokenLogo';
import { builtinSounds } from '@/services/sound';

const METRICS: { k: MyAlertMetric; l: string; pct?: boolean }[] = [
  { k: 'mcap', l: 'MCAP' },
  { k: 'volume5m', l: 'Volume 5M' },
  { k: 'priceChange5m', l: 'Variação 5M (%)', pct: true },
  { k: 'liquidity', l: 'Liquidez' },
];

function currentValue(m: MyAlertMetric, o: ReturnType<typeof useStore.getState>['tokens'][string]['lastObservation']) {
  if (!o) return null;
  if (m === 'mcap') return o.marketCapUsd;
  if (m === 'volume5m') return o.windows['5m'].volumeUsd;
  if (m === 'priceChange5m') return o.windows['5m'].priceChangePct;
  return o.liquidityUsd;
}

export function MyAlertsPanel() {
  const myAlerts = useStore((s) => s.myAlerts);
  const tokens = useStore((s) => s.tokens);
  const selected = useStore((s) => s.selected);
  const pre = useUi((s) => s.myAlertFor);
  const [token, setToken] = useState<string>(pre ?? selected ?? '');
  const [metric, setMetric] = useState<MyAlertMetric>('mcap');
  const [op, setOp] = useState<'>' | '<'>('>');
  const [target, setTarget] = useState('');
  const [sound, setSound] = useState('builtin:custom');

  useEffect(() => {
    if (pre) {
      setToken(pre);
      useUi.getState().set({ myAlertFor: null });
    }
  }, [pre]);

  const list = Object.values(tokens).sort((a, b) => (a.meta.symbol ?? '').localeCompare(b.meta.symbol ?? ''));
  const create = () => {
    const v = Number(target);
    if (!token || !Number.isFinite(v) || target.trim() === '') return;
    const m: MyAlert = {
      id: Math.random().toString(36).slice(2),
      tokenAddress: token,
      symbol: tokens[token]?.meta.symbol ?? null,
      metric,
      op,
      target: v,
      status: 'waiting',
      createdAt: Date.now(),
      triggeredAt: null,
      soundId: sound,
    };
    useStore.setState({ myAlerts: [m, ...myAlerts] });
    setTarget('');
  };
  const update = (id: string, p: Partial<MyAlert>) => useStore.setState({ myAlerts: myAlerts.map((m) => (m.id === id ? { ...m, ...p } : m)) });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-2 border-b border-line p-3">
        <div className="label text-custom">Novo alerta manual</div>
        <select className="input h-7 text-[11px]" value={token} onChange={(e) => setToken(e.target.value)}>
          <option value="">Escolha um token da Watchlist…</option>
          {list.map((t) => (
            <option key={t.address} value={t.address}>
              {t.meta.symbol ?? t.address.slice(0, 8)} — {t.meta.name ?? t.address.slice(0, 12)}
            </option>
          ))}
        </select>
        <div className="flex gap-1.5">
          <select className="input h-7 flex-1 text-[11px]" value={metric} onChange={(e) => setMetric(e.target.value as MyAlertMetric)}>
            {METRICS.map((m) => (
              <option key={m.k} value={m.k}>
                {m.l}
              </option>
            ))}
          </select>
          <select className="input h-7 w-14 text-[11px]" value={op} onChange={(e) => setOp(e.target.value as '>' | '<')}>
            <option value=">">&gt;</option>
            <option value="<">&lt;</option>
          </select>
          <input className="input num h-7 w-28 text-[11px]" inputMode="decimal" placeholder={metric === 'priceChange5m' ? '%' : '$'} value={target} onChange={(e) => setTarget(e.target.value)} />
        </div>
        <div className="flex gap-1.5">
          <select className="input h-7 flex-1 text-[11px]" value={sound} onChange={(e) => setSound(e.target.value)}>
            {builtinSounds().map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button className="btn border-custom/50 bg-custom/15 text-custom" onClick={create} disabled={!token || target.trim() === ''}>
            <BellPlus size={13} /> Criar
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {!myAlerts.length && <div className="pt-4 text-center text-[12px] text-dim">Nenhum My Alert. Crie um acima ou pelo ícone de sino no card do token.</div>}
        {myAlerts.map((m) => {
          const t = tokens[m.tokenAddress];
          const pct = m.metric === 'priceChange5m';
          const cur = currentValue(m.metric, t?.lastObservation ?? null);
          return (
            <div key={m.id} className={cn('rounded-lg border bg-card p-2.5', m.status === 'triggered' ? 'glow-custom border-custom/60' : 'border-custom/30')}>
              <div className="flex items-center gap-2">
                <TokenLogo src={t?.meta.imageUrl} symbol={m.symbol} size={20} />
                <span className="font-bold">{m.symbol ?? m.tokenAddress.slice(0, 6)}</span>
                <span className="chip border-custom/50 bg-custom/15 text-custom">custom</span>
                <span className={cn('chip', m.status === 'waiting' ? 'border-warn/40 text-warn' : m.status === 'triggered' ? 'border-up/40 text-up' : 'border-line text-dim')}>{m.status}</span>
                <div className="ml-auto flex">
                  {m.status !== 'waiting' && (
                    <button className="btn-ghost" title="Rearmar" onClick={() => update(m.id, { status: 'waiting', triggeredAt: null })}>
                      <RotateCcw size={12} />
                    </button>
                  )}
                  {m.status === 'waiting' && (
                    <button className="btn-ghost" title="Desativar" onClick={() => update(m.id, { status: 'disabled' })}>
                      <Power size={12} />
                    </button>
                  )}
                  <button className="btn-ghost hover:text-down" title="Excluir" onClick={() => useStore.setState({ myAlerts: myAlerts.filter((x) => x.id !== m.id) })}>
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
              <div className="num mt-1.5 text-[11px] text-muted">
                {METRICS.find((x) => x.k === m.metric)?.l} {m.op} <span className="text-fg">{pct ? `${m.target}%` : fmtUsd(m.target)}</span> · agora {pct ? fmtPct(cur) : fmtUsd(cur)}
                {!t && <span className="text-warn"> · token fora da Watchlist</span>}
              </div>
              {m.triggeredAt && <div className="num mt-0.5 text-[10px] text-custom">Disparou em {fmtDateTime(m.triggeredAt)}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
