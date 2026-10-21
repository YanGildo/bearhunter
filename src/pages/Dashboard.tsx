import { useEffect, useRef, useState } from 'react';
import { Panel, PanelGroup, PanelResizeHandle, type ImperativePanelGroupHandle } from 'react-resizable-panels';
import { useStore } from '@/state/store';
import { LeftPanel } from '@/ui/watchlist/WatchlistPanel';
import { AlertsPanel } from '@/ui/alerts/AlertsPanel';
import { ContextPanel } from '@/ui/context/ContextPanel';
import { cn } from '@/lib/cn';

const DEFAULT_LAYOUT = [34, 33, 33];

function useIsDesktop() {
  const q = '(min-width: 1024px)';
  const [d, setD] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const h = () => setD(m.matches);
    m.addEventListener('change', h);
    return () => m.removeEventListener('change', h);
  }, []);
  return d;
}

function Handle() {
  return <PanelResizeHandle className="w-[3px] bg-line transition-colors hover:bg-primary/60 data-[resize-handle-active]:bg-primary" />;
}

export default function Dashboard() {
  const desktop = useIsDesktop();
  const mobileTab = useStore((s) => s.prefs.mobileTab);
  const setPrefs = useStore((s) => s.setPrefs);
  const nAlerts = useStore((s) => s.alerts.length);
  const group = useRef<ImperativePanelGroupHandle>(null);

  useEffect(() => {
    const h = () => group.current?.setLayout(DEFAULT_LAYOUT);
    window.addEventListener('bh:reset-layout', h);
    return () => window.removeEventListener('bh:reset-layout', h);
  }, []);

  if (desktop) {
    return (
      <PanelGroup ref={group} direction="horizontal" autoSaveId="bh-layout" className="min-h-0 flex-1">
        <Panel id="left" order={1} defaultSize={DEFAULT_LAYOUT[0]} minSize={22}>
          <LeftPanel />
        </Panel>
        <Handle />
        <Panel id="alerts" order={2} defaultSize={DEFAULT_LAYOUT[1]} minSize={22}>
          <AlertsPanel />
        </Panel>
        <Handle />
        <Panel id="context" order={3} defaultSize={DEFAULT_LAYOUT[2]} minSize={22}>
          <ContextPanel />
        </Panel>
      </PanelGroup>
    );
  }

  const tabs = [
    { k: 'watchlist' as const, l: 'Watchlist' },
    { k: 'alerts' as const, l: `Alerts${nAlerts ? ` (${nAlerts})` : ''}` },
    { k: 'contexto' as const, l: 'Contexto' },
  ];
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid grid-cols-3 border-b border-line bg-panel">
        {tabs.map((t) => (
          <button
            key={t.k}
            onClick={() => setPrefs({ mobileTab: t.k })}
            className={cn('h-10 text-[11px] font-bold uppercase tracking-wider text-muted', mobileTab === t.k && 'border-b-2 border-primary text-primary')}
          >
            {t.l}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1">
        {mobileTab === 'watchlist' && <LeftPanel />}
        {mobileTab === 'alerts' && <AlertsPanel />}
        {mobileTab === 'contexto' && <ContextPanel />}
      </div>
    </div>
  );
}
