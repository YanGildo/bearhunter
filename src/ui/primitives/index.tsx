import * as Dialog from '@radix-ui/react-dialog';
import * as Pop from '@radix-ui/react-popover';
import * as DM from '@radix-ui/react-dropdown-menu';
import { X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function Modal({
  open,
  onOpenChange,
  title,
  children,
  footer,
  className,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-[2px]" />
        <Dialog.Content
          aria-describedby={undefined}
          className={cn(
            'fixed left-1/2 top-1/2 z-50 flex max-h-[92vh] w-[calc(100vw-24px)] max-w-[880px] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-line bg-panel shadow-2xl outline-none',
            className,
          )}
        >
          <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
            <Dialog.Title className="text-[13px] font-extrabold uppercase tracking-[0.18em]">{title}</Dialog.Title>
            <Dialog.Close className="btn-ghost" aria-label="Fechar">
              <X size={16} />
            </Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
          {footer && <div className="border-t border-line px-5 py-3">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function Popover({ trigger, children, align = 'end', className }: { trigger: ReactNode; children: ReactNode; align?: 'start' | 'end' | 'center'; className?: string }) {
  return (
    <Pop.Root>
      <Pop.Trigger asChild>{trigger}</Pop.Trigger>
      <Pop.Portal>
        <Pop.Content align={align} sideOffset={6} className={cn('z-50 w-80 max-w-[calc(100vw-16px)] rounded-lg border border-line bg-panel p-3 shadow-2xl outline-none', className)}>
          {children}
        </Pop.Content>
      </Pop.Portal>
    </Pop.Root>
  );
}

export const Menu = {
  Root: DM.Root,
  Trigger: DM.Trigger,
  Content: ({ children, align = 'end' }: { children: ReactNode; align?: 'start' | 'end' }) => (
    <DM.Portal>
      <DM.Content align={align} sideOffset={6} className="z-50 min-w-[190px] rounded-lg border border-line bg-panel p-1 shadow-2xl">
        {children}
      </DM.Content>
    </DM.Portal>
  ),
  Item: ({ children, onSelect, danger }: { children: ReactNode; onSelect?: () => void; danger?: boolean }) => (
    <DM.Item
      onSelect={onSelect}
      className={cn('flex cursor-pointer items-center gap-2 rounded px-2.5 py-1.5 text-[12px] outline-none data-[highlighted]:bg-raised', danger ? 'text-down' : 'text-fg/90')}
    >
      {children}
    </DM.Item>
  ),
  Sep: () => <DM.Separator className="my-1 h-px bg-line" />,
};

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn('relative h-[16px] w-[30px] shrink-0 rounded-full border transition-colors', checked ? 'border-primary/60 bg-primary/40' : 'border-line bg-raised')}
    >
      <span className={cn('absolute top-[1px] h-[12px] w-[12px] rounded-full transition-all', checked ? 'left-[15px] bg-primary' : 'left-[1px] bg-dim')} />
    </button>
  );
}

/** Re-renderiza a cada `ms` (para textos "há X"). */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

let toastSet: ((t: string | null) => void) | null = null;
export function toast(msg: string) {
  toastSet?.(msg);
}
export function Toaster() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    toastSet = setMsg;
    return () => {
      toastSet = null;
    };
  }, []);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 2200);
    return () => clearTimeout(t);
  }, [msg]);
  if (!msg) return null;
  return (
    <div className="pointer-events-none fixed bottom-5 left-1/2 z-[60] -translate-x-1/2 rounded-md border border-line bg-raised px-3 py-2 text-[12px] shadow-xl">{msg}</div>
  );
}
