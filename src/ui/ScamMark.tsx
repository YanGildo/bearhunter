import { Skull } from 'lucide-react';
import { useStore } from '@/state/store';
import { cn } from '@/lib/cn';
import { toast } from './primitives';

export function ScamBadge({ className }: { className?: string }) {
  return (
    <span className={cn('chip border-down/70 bg-down/20 text-down', className)} title="Você marcou este token como scam">
      <Skull size={10} /> SCAM
    </span>
  );
}

/** Marca/desmarca um token como scam. A marca fica salva pelo endereço do token. */
export function toggleScamWithToast(address: string, symbol?: string | null) {
  const was = !!useStore.getState().scams[address];
  useStore.getState().toggleScam(address);
  toast(was ? `${symbol ?? 'Token'}: marca de scam removida` : `${symbol ?? 'Token'} marcado como SCAM`);
}
