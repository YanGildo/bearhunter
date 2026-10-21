import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Radar, X } from 'lucide-react';
import { CANDIDATE_KINDS, SIGNAL_META, type OperatorSignal } from '@/operators/types';
import { shortAddr } from '@/domain/num';
import { cn } from '@/lib/cn';
import { useStore } from '@/state/store';

/** Aviso flutuante de sinal do operador, com atalho para a aba Operadores. */
export function OperatorToaster() {
  const [items, setItems] = useState<OperatorSignal[]>([]);
  const navigate = useNavigate();
  const loc = useLocation();
  useEffect(() => {
    const h = (e: Event) => {
      const sig = (e as CustomEvent<OperatorSignal>).detail;
      const candidate = CANDIDATE_KINDS.includes(sig.kind);
      if (candidate && !useStore.getState().operator.settings.soundOnCandidates) return;
      if (location.pathname.startsWith('/operadores')) return;
      setItems((x) => [sig, ...x].slice(0, 3));
      setTimeout(() => setItems((x) => x.filter((i) => i.id !== sig.id)), 10_000);
    };
    window.addEventListener('bh:operator-signal', h);
    return () => window.removeEventListener('bh:operator-signal', h);
  }, []);
  if (!items.length || loc.pathname.startsWith('/operadores')) return null;
  return (
    <div className="fixed bottom-4 right-4 z-[55] flex w-[340px] max-w-[calc(100vw-32px)] flex-col gap-2">
      {items.map((s) => (
        <div key={s.id} className={cn('rounded-lg border bg-panel p-3 shadow-2xl', s.kind === 'despejo' ? 'border-down/60' : 'border-primary/50')}>
          <div className="flex items-center gap-2">
            <Radar size={14} className="text-primary" />
            <span className={cn('chip', s.kind === 'despejo' ? 'border-down/60 text-down' : 'border-primary/50 text-primary')}>{SIGNAL_META[s.kind].label}</span>
            <span className="font-bold">{s.symbol ?? (s.mint ? shortAddr(s.mint) : '')}</span>
            <button className="btn-ghost ml-auto" onClick={() => setItems((x) => x.filter((i) => i.id !== s.id))}>
              <X size={13} />
            </button>
          </div>
          <div className="mt-1 text-[11.5px] text-fg/85">{s.text}</div>
          <button className="btn mt-2 h-7 w-full justify-center border-primary/50 bg-primary/15 text-primary" onClick={() => navigate('/operadores')}>
            Ver em Operadores
          </button>
        </div>
      ))}
    </div>
  );
}
