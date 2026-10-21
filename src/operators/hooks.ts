// Ponte entre o coletor e o módulo Operadores, sem import circular.
import type { SourceHealth } from '@/adapters/types';
import type { MarketObservation, TrackedToken } from '@/domain/types';

export const operatorHooks: {
  onCreated: ((mint: string, at: number) => void) | null;
  onMigration: ((mint: string, at: number, symbol: string | null) => void) | null;
  onObservation: ((t: TrackedToken, o: MarketObservation, hist: MarketObservation[]) => void) | null;
  isOperatorToken: ((mint: string) => boolean) | null;
  health: (() => SourceHealth | null) | null;
} = { onCreated: null, onMigration: null, onObservation: null, isOperatorToken: null, health: null };
