import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BellOff, Bell, Bug, Copy, ExternalLink, FlaskConical, LineChart, MoreHorizontal, Play, Plus, RefreshCw, Search, Square, Trash2, TrendingUp, Eye } from 'lucide-react';
import { useStore } from '@/state/store';
import { useUi } from '@/state/ui';
import { collector, isValidSolanaAddress } from '@/collector/collector';
import { Menu, Modal, toast, useNow } from './primitives';
import { fmtAge, fmtUsd } from '@/domain/num';
import { PRESET_KEYS, type MarketObservation, type TokenMeta } from '@/domain/types';
import { PRESET_META } from '@/domain/presets';
import { copyText, dexUrl } from '@/lib/links';
import { TokenLogo } from './TokenLogo';
import { cn } from '@/lib/cn';
import { unlockAudio } from '@/services/sound';
import { exportConfig, importConfig } from '@/services/backup';

const AUTO_OPTS = [0, 15, 30, 60, 120, 300];
const autoLabel = (s: number) => (s === 0 ? 'OFF' : s < 60 ? `${s}s` : `${s / 60}m`);

export function openToken(address: string) {
  const s = useStore.getState();
  s.select(address);
  const t = s.tokens[address];
  if (!s.prefs.dexLateral && t) {
    useUi.getState().set({
      chartModal: { token: address, pair: t.lastObservation?.pairAddress ?? null, symbol: t.meta.symbol, name: t.meta.name, imageUrl: t.meta.imageUrl },
    });
  } else {
    s.setPrefs({ rightTab: 'grafico', mobileTab: 'contexto' });
  }
}

function GlobalSearch() {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ observation: MarketObservation; meta: TokenMeta }[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const v = q.trim();
    if (v.length < 2) {
      setRes([]);
      return;
    }
    const t = setTimeout(async () => {
      setBusy(true);
      setErr(null);
      try {
        setRes(await collector.search(v));
      } catch (e) {
        setErr((e as Error).message);
      } finally {
        setBusy(false);
      }
    }, 450);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  return (
    <div ref={box} className="relative min-w-[180px] flex-1 lg:max-w-[360px]">
      <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-dim" />
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Buscar qualquer token na Solana…"
        className="input num h-7 pl-7 text-[11px]"
      />
      {open && q.trim().length >= 2 && (
        <div className="absolute right-0 top-8 z-40 max-h-[60vh] w-full min-w-[300px] overflow-y-auto rounded-lg border border-line bg-panel p-1 shadow-2xl">
          {busy && <div className="p-2 text-[11px] text-dim">Buscando no DexScreener…</div>}
          {err && <div className="p-2 text-[11px] text-down">{err}</div>}
          {!busy && !err && !res.length && <div className="p-2 text-[11px] text-dim">Nenhum resultado na Solana.</div>}
          {res.map(({ observation: o, meta: m }) => (
            <div key={m.address} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-raised">
              <TokenLogo src={m.imageUrl} symbol={m.symbol} size={22} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12px] font-semibold">
                  {m.symbol} <span className="font-normal text-muted">{m.name}</span>
                </div>
                <div className="num text-[10px] text-dim">
                  MCAP {fmtUsd(o.marketCapUsd)} · Vol5m {fmtUsd(o.windows['5m'].volumeUsd)} · {o.dexId}
                </div>
              </div>
              <button
                className="btn-ghost"
                title="Ver gráfico"
                onClick={() => useUi.getState().set({ chartModal: { token: m.address, pair: o.pairAddress, symbol: m.symbol, name: m.name, imageUrl: m.imageUrl } })}
              >
                <Eye size={13} />
              </button>
              <button
                className="btn-ghost text-primary"
                title="Adicionar à Watchlist"
                onClick={() => {
                  collector.addToken(m.address, 'manual', { symbol: m.symbol, name: m.name, imageUrl: m.imageUrl });
                  toast(`${m.symbol ?? 'Token'} adicionado à Watchlist`);
                }}
              >
                <Plus size={13} />
              </button>
              <button className="btn-ghost" title="Copiar CA" onClick={() => copyText(m.address).then(() => toast('CA copiado'))}>
                <Copy size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AddTokenModal() {
  const open = useUi((s) => s.addTokenOpen);
  const [text, setText] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const close = () => {
    useUi.getState().set({ addTokenOpen: false });
    setText('');
    setResult(null);
  };
  const submit = () => {
    const parts = [...new Set(text.split(/[\s,;]+/).map((p) => p.trim()).filter(Boolean))];
    const valid = parts.filter(isValidSolanaAddress);
    const invalid = parts.filter((p) => !isValidSolanaAddress(p));
    let added = 0;
    for (const a of valid) if (collector.addToken(a, 'manual')) added++;
    const dup = valid.length - added;
    setResult(`${added} adicionado(s)${dup ? `, ${dup} já estava(m) na lista (marcado(s) como manual)` : ''}${invalid.length ? `, ${invalid.length} inválido(s): ${invalid.slice(0, 3).join(', ')}` : ''}`);
    if (valid[0]) openToken(valid[0]);
    if (!invalid.length) setTimeout(close, 900);
  };
  return (
    <Modal
      open={open}
      onOpenChange={(o) => !o && close()}
      title="Add Token"
      className="max-w-[520px]"
      footer={
        <div className="flex justify-end gap-2">
          <button className="btn" onClick={close}>
            Cancelar
          </button>
          <button className="btn border-primary/50 bg-primary/20 text-primary" onClick={submit}>
            <Plus size={13} /> Adicionar
          </button>
        </div>
      }
    >
      <div className="space-y-2 p-5">
        <p className="text-[12px] text-muted">Cole um ou vários contract addresses (CA) da Solana — um por linha, vírgula ou espaço. Tokens manuais têm prioridade e nunca saem da lista sozinhos.</p>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} className="input num h-auto py-2 text-[11px]" placeholder="Ex.: CZiwA6eLUthZFLvTVEWG9v1K9Pc7p3eiBKRba2G7pump" />
        {result && <div className="text-[11px] text-warn">{result}</div>}
      </div>
    </Modal>
  );
}

export function ControlBar() {
  const running = useStore((s) => s.running);
  const prefs = useStore((s) => s.prefs);
  const setPrefs = useStore((s) => s.setPrefs);
  const last = useStore((s) => s.lastCycleAt);
  const selected = useStore((s) => s.selected);
  const indicators = useStore((s) => s.indicators);
  const now = useNow(1000);
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const toggleNotif = async () => {
    if (!prefs.notifEnabled && typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
      const p = await Notification.requestPermission();
      if (p !== 'granted') {
        toast('O navegador bloqueou as notificações');
        return;
      }
    }
    setPrefs({ notifEnabled: !prefs.notifEnabled });
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-3 py-1.5 sm:px-4">
      <button
        className={cn('btn', running ? 'border-down/50 bg-down/10 text-down' : 'border-up/50 bg-up/10 text-up')}
        onClick={() => {
          unlockAudio();
          if (running) collector.stop();
          else void collector.start();
        }}
      >
        {running ? <Square size={12} /> : <Play size={12} />} {running ? 'STOP' : 'START'}
      </button>
      <button className="btn border-warn/40 text-warn" onClick={() => useUi.getState().set({ addTokenOpen: true })}>
        <Plus size={13} /> Add<span className="hidden sm:inline"> Token</span>
      </button>
      <button
        className="btn border-warn/40 text-warn"
        disabled={loading}
        onClick={async () => {
          setLoading(true);
          const n = await collector.loadTop();
          setLoading(false);
          toast(`Load Top Solana: +${n} tokens`);
        }}
      >
        <TrendingUp size={13} /> <span className="hidden sm:inline">Load Top Solana</span><span className="sm:hidden">Top</span>
      </button>
      <Menu.Root>
        <Menu.Trigger asChild>
          <button className="btn">
            <Trash2 size={13} /> <span className="hidden sm:inline">Clear</span>
          </button>
        </Menu.Trigger>
        <Menu.Content align="start">
          <Menu.Item onSelect={() => void collector.clearAlerts().then(() => toast('Alertas limpos'))}>Limpar alertas</Menu.Item>
          <Menu.Item onSelect={() => collector.clearAuto()}>Limpar tokens automáticos (mantém manuais e favoritos)</Menu.Item>
        </Menu.Content>
      </Menu.Root>
      <Menu.Root>
        <Menu.Trigger asChild>
          <button className="btn border-warn/40 bg-warn/10 text-warn">
            <FlaskConical size={13} /> <span className="hidden sm:inline">Test Alert</span>
          </button>
        </Menu.Trigger>
        <Menu.Content align="start">
          {PRESET_KEYS.map((k) => (
            <Menu.Item
              key={k}
              onSelect={() => {
                unlockAudio();
                collector.testAlert(k);
              }}
            >
              Testar {PRESET_META[k].label}
            </Menu.Item>
          ))}
          {indicators.map((i) => (
            <Menu.Item
              key={i.id}
              onSelect={() => {
                unlockAudio();
                collector.testAlert(i.id);
              }}
            >
              Testar {i.name}
            </Menu.Item>
          ))}
        </Menu.Content>
      </Menu.Root>
      <button className={cn('btn', prefs.debug ? 'border-warn/60 bg-warn/15 text-warn' : 'border-warn/40 text-warn')} onClick={() => setPrefs({ debug: !prefs.debug, rightTab: !prefs.debug ? 'historico' : prefs.rightTab })}>
        <Bug size={13} /> <span className="hidden sm:inline">Debug</span>
      </button>
      <button className="btn border-warn/40 text-warn" disabled={!selected} onClick={() => selected && openToken(selected)}>
        <LineChart size={13} /> <span className="hidden sm:inline">Chart</span>
      </button>
      <button className="btn" onClick={toggleNotif}>
        {prefs.notifEnabled ? <Bell size={13} className="text-up" /> : <BellOff size={13} />} <span className="hidden sm:inline">Notif {prefs.notifEnabled ? 'ON' : 'OFF'}</span>
      </button>
      <button
        className="btn border-primary/50 bg-primary/15 text-primary"
        onClick={() => {
          collector.refreshAll();
          useStore.setState({ lastResortAt: Date.now() });
        }}
      >
        <RefreshCw size={13} /> <span className="hidden sm:inline">Refresh Watchlist</span><span className="sm:hidden">Refresh</span>
      </button>
      <label className="flex items-center gap-1 text-[10px] font-semibold uppercase text-muted" title="De quanto em quanto tempo a Watchlist reordena. Os números atualizam ao vivo.">
        Auto
        <select value={prefs.autoResortS} onChange={(e) => setPrefs({ autoResortS: Number(e.target.value) })} className="num h-7 rounded-md border border-line bg-card px-1.5 text-[11px] text-fg">
          {AUTO_OPTS.map((o) => (
            <option key={o} value={o}>
              {autoLabel(o)}
            </option>
          ))}
        </select>
      </label>
      <span className="num text-[10px] text-dim">Últ: {last ? `há ${fmtAge(last, now)}` : '—'}</span>
      <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-1.5">
        <GlobalSearch />
        <Menu.Root>
          <Menu.Trigger asChild>
            <button className="btn h-7 font-bold">
              <MoreHorizontal size={14} /> MAIS
            </button>
          </Menu.Trigger>
          <Menu.Content>
            <Menu.Item
              onSelect={() => {
                try {
                  localStorage.removeItem('react-resizable-panels:bh-layout');
                } catch {
                  /* ignore */
                }
                window.dispatchEvent(new Event('bh:reset-layout'));
                toast('Layout restaurado');
              }}
            >
              Reset Layout
            </Menu.Item>
            <Menu.Item onSelect={() => exportConfig()}>Exportar configurações (presets + watchlist)</Menu.Item>
            <Menu.Item onSelect={() => fileRef.current?.click()}>Importar configurações…</Menu.Item>
            <Menu.Sep />
            <Menu.Item onSelect={() => navigate('/settings')}>Configurações e sons</Menu.Item>
            <Menu.Item onSelect={() => navigate('/settings?tab=docs')}>Documentação</Menu.Item>
            <Menu.Item onSelect={() => window.open(dexUrl(''), '_blank')}>
              Abrir DexScreener <ExternalLink size={12} />
            </Menu.Item>
          </Menu.Content>
        </Menu.Root>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) toast((await importConfig(f)) ? 'Configurações importadas' : 'Arquivo inválido');
            e.target.value = '';
          }}
        />
      </div>
      <AddTokenModal />
    </div>
  );
}
