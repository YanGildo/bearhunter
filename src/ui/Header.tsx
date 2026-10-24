import { NavLink } from 'react-router-dom';
import { Activity, Bell, CircleCheck, Clock, Crosshair, LayoutGrid, LogOut, Radar, Settings, Shield, Trophy, Volume2, VolumeX, Wifi, WifiOff, NotebookPen, FileSearch } from 'lucide-react';
import { operatorsAllowed, useAuth } from '@/state/auth';
import { AUTH_ENABLED } from '@/services/supabase';
import { useStore } from '@/state/store';
import { cn } from '@/lib/cn';
import { Popover, useNow } from './primitives';
import { fmtAge, fmtTime } from '@/domain/num';
import type { SourceHealth } from '@/adapters/types';
import { collector } from '@/collector/collector';

export function BrandLogo() {
  return (
    <div className="flex items-center gap-2">
      <img src="/favicon.svg" alt="" className="h-6 w-6" />
      <span className="text-[15px] font-extrabold tracking-tight">
        <span className="text-primary">Bear</span>Hunter <span className="text-[10px] font-medium text-muted">Bot</span>
      </span>
    </div>
  );
}

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutGrid },
  { to: '/history', label: 'History', icon: Clock },
  { to: '/analise', label: 'Análise', icon: FileSearch },
  { to: '/ganhos', label: 'Ganhos', icon: NotebookPen },
];
const V2 = [
  { label: 'Ganhadores', icon: Trophy },
  { label: 'Snipe Desk', icon: Crosshair },
];

function OperatorsLink() {
  const unread = useStore((s) => s.operator.unread);
  useAuth((s) => s.profile?.operators_enabled);
  if (!operatorsAllowed()) return null;
  return (
    <NavLink
      to="/operadores"
      className={({ isActive }) => cn('relative flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] font-semibold text-muted hover:text-fg', isActive && 'bg-primary/15 text-primary')}
    >
      <Radar size={14} />
      <span className="hidden lg:inline">Operadores</span>
      {unread > 0 && <span className="num absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-down px-1 text-[9px] font-bold text-white">{unread > 99 ? '99+' : unread}</span>}
    </NavLink>
  );
}

export function TopNav() {
  return (
    <div className="flex h-11 items-center gap-3 border-b border-line bg-panel px-3 sm:px-4">
      <BrandLogo />
      <nav className="mx-auto flex min-w-0 items-center gap-0.5 overflow-hidden">
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            title={n.label}
            className={({ isActive }) =>
              cn('flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-[12px] font-semibold text-muted hover:text-fg', isActive && 'bg-primary/15 text-primary')
            }
          >
            <n.icon size={14} />
            <span className="hidden lg:inline">{n.label}</span>
          </NavLink>
        ))}
        <OperatorsLink />
        {V2.map((n) => (
          <span key={n.label} title="Fica para a versão 2" className="hidden cursor-not-allowed items-center gap-1.5 whitespace-nowrap px-2 py-1 text-[12px] font-semibold text-dim xl:flex">
            <n.icon size={14} />
            {n.label}
            <span className="rounded bg-raised px-1 text-[9px] text-muted">v2</span>
          </span>
        ))}
        <NavLink
          to="/settings"
          title="Configurações"
          className={({ isActive }) => cn('flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-[12px] font-semibold text-muted hover:text-fg', isActive && 'bg-primary/15 text-primary')}
        >
          <Settings size={14} />
          <span className="hidden lg:inline">Configurações</span>
        </NavLink>
        <AdminLink />
      </nav>
      <UserBox />
    </div>
  );
}

function AdminLink() {
  const admin = useAuth((s) => s.profile?.is_admin);
  if (!admin) return null;
  return (
    <NavLink to="/admin" title="Admin" className={({ isActive }) => cn('flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-[12px] font-semibold text-muted hover:text-fg', isActive && 'bg-primary/15 text-primary')}>
      <Shield size={14} />
      <span className="hidden lg:inline">Admin</span>
    </NavLink>
  );
}

function UserBox() {
  const email = useAuth((s) => s.profile?.email ?? s.session?.user.email);
  if (!AUTH_ENABLED) return null;
  return (
    <div className="flex shrink-0 items-center gap-2">
      <span className="num hidden max-w-[180px] truncate text-[11px] text-dim 2xl:inline">{email}</span>
      <button
        className="btn-ghost h-7"
        title="Sair"
        onClick={async () => {
          await useAuth.getState().signOut();
          window.location.assign('/'); // limpa a memória da sessão anterior
        }}
      >
        <LogOut size={14} /> <span className="hidden lg:inline">Logout</span>
      </button>
    </div>
  );
}

const stateColor: Record<SourceHealth['state'], string> = {
  idle: 'bg-dim',
  connecting: 'bg-warn',
  ok: 'bg-up',
  degraded: 'bg-warn',
  error: 'bg-down',
  off: 'bg-dim',
};

export function SourceRow({ h }: { h: SourceHealth }) {
  const now = useNow(2000);
  return (
    <div className="rounded-md border border-line bg-card p-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-semibold">
          <span className={cn('h-2 w-2 rounded-full', stateColor[h.state])} />
          {h.label}
        </div>
        <span className="num text-[10px] uppercase text-muted">{h.state}</span>
      </div>
      <div className="num mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10.5px] text-muted">
        <span>Último sucesso</span>
        <span className="text-right text-fg/80">{h.lastSuccessAt ? `há ${fmtAge(h.lastSuccessAt, now)}` : '—'}</span>
        <span>Último erro</span>
        <span className="text-right text-fg/80">{h.lastErrorAt ? `${fmtTime(h.lastErrorAt)}` : '—'}</span>
        {h.requestsLastMinute != null && (
          <>
            <span>Req. último minuto</span>
            <span className="text-right text-fg/80">{h.requestsLastMinute}</span>
          </>
        )}
      </div>
      {h.detail && <div className="mt-1.5 text-[10.5px] text-warn/90">{h.detail}</div>}
      {h.lastError && h.state !== 'ok' && <div className="mt-0.5 text-[10.5px] text-down/90">Erro: {h.lastError}</div>}
    </div>
  );
}

function StatusContent() {
  const health = useStore((s) => s.health);
  const running = useStore((s) => s.running);
  const tokens = useStore((s) => Object.keys(s.tokens).length);
  const last = useStore((s) => s.lastCycleAt);
  const now = useNow(2000);
  return (
    <div className="space-y-2">
      <div className="label">Status das fontes</div>
      {health.map((h) => (
        <SourceRow key={h.id} h={h} />
      ))}
      <div className="rounded-md border border-line bg-card p-2.5">
        <div className="mb-1 font-semibold">Coleta (neste navegador)</div>
        <div className="num grid grid-cols-2 gap-y-0.5 text-[10.5px] text-muted">
          <span>Estado</span>
          <span className={cn('text-right', running ? 'text-up' : 'text-down')}>{running ? 'RUNNING' : 'STOPPED'}</span>
          <span>Tokens</span>
          <span className="text-right text-fg/80">{tokens}</span>
          <span>Intervalo</span>
          <span className="text-right text-fg/80">{collector.baseIntervalS()}s</span>
          <span>Última atualização</span>
          <span className="text-right text-fg/80">{last ? `há ${fmtAge(last, now)}` : '—'}</span>
        </div>
      </div>
      <p className="text-[10.5px] text-dim">A coleta só roda com esta aba aberta. Os sinais são métricas de mercado e não garantem segurança ou retorno.</p>
    </div>
  );
}

export function StatusButton({ compact }: { compact?: boolean }) {
  const health = useStore((s) => s.health);
  const bad = health.some((h) => h.state === 'error' || h.state === 'degraded');
  return (
    <Popover
      trigger={
        <button className={cn('btn h-8 border-up/40 bg-up/10 text-up', bad && 'border-warn/50 bg-warn/10 text-warn')}>
          <CircleCheck size={14} />
          {!compact && 'STATUS'}
        </button>
      }
    >
      <StatusContent />
    </Popover>
  );
}

function FeedButton() {
  const feed = useStore((s) => s.feed);
  const now = useNow(5000);
  return (
    <Popover
      className="w-96"
      trigger={
        <button className="btn-ghost h-7">
          <Activity size={14} className="text-primary" /> Feed
          <span className="num rounded bg-raised px-1 text-[10px]">{feed.length}</span>
        </button>
      }
    >
      <div className="label mb-2">Feed de monitoramento</div>
      <div className="max-h-80 space-y-1 overflow-y-auto">
        {!feed.length && <div className="text-[11px] text-dim">Nada ainda. Clique em START.</div>}
        {feed.map((f, i) => (
          <div key={i} className="flex gap-2 text-[11px]">
            <span className="num shrink-0 text-dim">{fmtAge(f.t, now)}</span>
            <span className={cn(f.kind === 'error' ? 'text-down' : f.kind === 'alert' ? 'text-warn' : f.kind === 'discovery' ? 'text-initial' : 'text-muted')}>{f.text}</span>
          </div>
        ))}
      </div>
    </Popover>
  );
}

export function StatusRow() {
  const running = useStore((s) => s.running);
  const count = useStore((s) => Object.keys(s.tokens).length);
  const health = useStore((s) => s.health);
  const muted = useStore((s) => s.prefs.soundMuted);
  const setPrefs = useStore((s) => s.setPrefs);
  const alertsToday = useStore((s) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return s.alerts.filter((a) => a.detectedAt >= d.getTime() && !a.isTest).length;
  });
  const live = health.some((h) => h.state === 'ok');
  return (
    <div className="flex min-h-10 flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-3 py-1.5 sm:px-4">
      <span className={cn('num flex items-center gap-1.5 text-[11px] font-bold', running ? 'text-up' : 'text-down')}>
        <span className={cn('h-2 w-2 rounded-full', running ? 'animate-pulse bg-up' : 'bg-down')} />
        {running ? 'RUNNING' : 'STOPPED'}
      </span>
      <span className="num text-[11px] text-muted">{count} tokens</span>
      <span className="chip border-primary/40 bg-primary/15 text-primary">SOLANA</span>
      <div className="ml-auto flex flex-wrap items-center gap-1.5">
        <FeedButton />
        {health.map((h) => (
          <span key={h.id} className="hidden items-center gap-1.5 rounded border border-line bg-card px-2 py-[3px] text-[10.5px] text-muted md:flex">
            <span className={cn('h-1.5 w-1.5 rounded-full', stateColor[h.state])} />
            {h.label}
          </span>
        ))}
        <span className={cn('chip h-6 px-2', live ? 'border-up/40 bg-up/15 text-up' : 'border-line bg-card text-dim')}>
          {live ? <Wifi size={12} /> : <WifiOff size={12} />} LIVE
        </span>
        <span className="chip h-6 border-warn/40 bg-warn/10 px-2 text-warn" title="Alertas hoje">
          <Bell size={12} /> {alertsToday}
        </span>
        <button className="btn-ghost h-7" onClick={() => setPrefs({ soundMuted: !muted })} title={muted ? 'Som desligado' : 'Som ligado'}>
          {muted ? <VolumeX size={15} className="text-down" /> : <Volume2 size={15} />}
        </button>
        <StatusButton />
      </div>
    </div>
  );
}
