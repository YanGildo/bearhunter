import { create } from 'zustand';
import type { IndicatorKey, PresetKey } from '@/domain/types';

interface ChartTarget {
  token: string;
  pair: string | null;
  symbol: string | null;
  name: string | null;
  imageUrl: string | null;
}

interface UiState {
  presetModal: PresetKey | IndicatorKey | null;
  addTokenOpen: boolean;
  chartModal: ChartTarget | null;
  myAlertFor: string | null; // token para criar My Alert
  set: (p: Partial<UiState>) => void;
}

export const useUi = create<UiState>()((set) => ({
  presetModal: null,
  addTokenOpen: false,
  chartModal: null,
  myAlertFor: null,
  set: (p) => set(p),
}));
