import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Alert, IndicatorConfig, IndicatorKey, MyAlert, PresetConfig, PresetKey, Timeframe, TrackedToken } from '@/domain/types';
import type { OperatorState } from '@/operators/types';
import { EMPTY_OPERATOR_STATE } from '@/operators/types';
import { defaultIndicator, defaultPresets, PRESETS_VERSION } from '@/domain/presets';
import type { SourceHealth } from '@/adapters/types';
import { DEXSCREENER_DEFAULT_BASE } from '@/adapters/dexscreener/client';

export type SortKey = 'vol' | 'mcap' | 'liq' | 'peak';
export type WatchTab = 'geral' | 'favoritos' | string; // string = id da pasta
export type AlertFilter = 'all' | PresetKey | IndicatorKey | 'custom';

export interface Folder {
  id: string;
  name: string;
  tokens: string[];
}

export interface FeedEntry {
  t: number;
  kind: 'info' | 'discovery' | 'alert' | 'error';
  text: string;
}

export interface Prefs {
  dexLateral: boolean;
  notifEnabled: boolean;
  soundMuted: boolean;
  muteScamSound: boolean;
  autoResortS: number; // 0 = off
  watchTf: Timeframe;
  sort: SortKey;
  sortDesc: boolean;
  boostedOnly: boolean;
  leftTab: 'watchlist' | 'myalerts';
  rightTab: 'grafico' | 'historico';
  mobileTab: 'watchlist' | 'alerts' | 'contexto';
  dsBaseUrl: string;
  discoverNew: boolean;
  discoverMigrations: boolean;
  discoverTrending: boolean;
  newTokenMinutes: number; // quanto tempo um token novo sem volume fica na lista
  debug: boolean;
  rpcUrl: string;
  revivalGraveyard: boolean;
  pumpPortalKey: string;
}

export const DEFAULT_PREFS: Prefs = {
  dexLateral: true,
  notifEnabled: false,
  soundMuted: false,
  muteScamSound: true,
  autoResortS: 30,
  watchTf: '5m',
  sort: 'vol',
  sortDesc: true,
  boostedOnly: false,
  leftTab: 'watchlist',
  rightTab: 'grafico',
  mobileTab: 'watchlist',
  dsBaseUrl: DEXSCREENER_DEFAULT_BASE,
  discoverNew: true,
  discoverMigrations: true,
  discoverTrending: true,
  newTokenMinutes: 10,
  debug: false,
  rpcUrl: 'https://api.mainnet-beta.solana.com',
  revivalGraveyard: true,
  pumpPortalKey: '',
};

interface State {
  // sessão (não persistido)
  running: boolean;
  tokens: Record<string, TrackedToken>;
  alerts: Alert[];
  health: SourceHealth[];
  feed: FeedEntry[];
  lastCycleAt: number | null;
  lastResortAt: number;
  selected: string | null;
  newAlertIds: Set<string>;

  // persistido
  presets: Record<PresetKey, PresetConfig>;
  indicators: IndicatorConfig[];
  presetsVersion: number;
  graveyard: Record<string, number>; // tokens que saíram por falta de volume (para o Revival)
  operator: OperatorState;
  prefs: Prefs;
  favorites: string[];
  scams: Record<string, number>; // token → quando foi marcado como scam
  folders: Folder[];
  watchTab: WatchTab;
  alertFilter: AlertFilter;
  myAlerts: MyAlert[];
  savedTokens: TrackedToken[]; // tokens manuais/favoritos/pastas, sem observações

  set: (p: Partial<State>) => void;
  setPrefs: (p: Partial<Prefs>) => void;
  setPreset: (k: PresetKey, p: PresetConfig) => void;
  toggleFavorite: (a: string) => void;
  toggleScam: (a: string) => void;
  select: (a: string | null) => void;
  pushFeed: (e: Omit<FeedEntry, 't'>) => void;
}

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      running: false,
      tokens: {},
      alerts: [],
      health: [],
      feed: [],
      lastCycleAt: null,
      lastResortAt: 0,
      selected: null,
      newAlertIds: new Set(),

      presets: defaultPresets(),
      indicators: [{ ...defaultIndicator(), active: false }],
      presetsVersion: PRESETS_VERSION,
      graveyard: {},
      operator: EMPTY_OPERATOR_STATE,
      prefs: DEFAULT_PREFS,
      favorites: [],
      scams: {},
      folders: [],
      watchTab: 'geral',
      alertFilter: 'all',
      myAlerts: [],
      savedTokens: [],

      set: (p) => set(p),
      setPrefs: (p) => set({ prefs: { ...get().prefs, ...p } }),
      setPreset: (k, p) => set({ presets: { ...get().presets, [k]: p } }),
      toggleFavorite: (a) => {
        const f = get().favorites;
        set({ favorites: f.includes(a) ? f.filter((x) => x !== a) : [...f, a] });
      },
      toggleScam: (a) => {
        const sc = { ...get().scams };
        if (sc[a]) delete sc[a];
        else sc[a] = Date.now();
        set({ scams: sc });
      },
      select: (a) => set({ selected: a }),
      pushFeed: (e) => set({ feed: [{ ...e, t: Date.now() }, ...get().feed].slice(0, 200) }),
    }),
    {
      name: 'bearhunter:v1',
      storage: createJSONStorage(() => {
        try {
          return localStorage;
        } catch {
          return undefined as unknown as Storage;
        }
      }),
      partialize: (s) => ({
        presets: s.presets,
        indicators: s.indicators,
        presetsVersion: s.presetsVersion,
        graveyard: s.graveyard,
        operator: { ...s.operator, signals: s.operator.signals.slice(0, 300), unread: s.operator.unread },
        prefs: s.prefs,
        favorites: s.favorites,
        scams: s.scams,
        folders: s.folders,
        watchTab: s.watchTab,
        alertFilter: s.alertFilter,
        myAlerts: s.myAlerts,
        savedTokens: s.savedTokens,
        selected: s.selected,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<State>;
        const defaults = defaultPresets();
        const presets = { ...defaults } as Record<PresetKey, PresetConfig>;
        for (const k of Object.keys(defaults) as PresetKey[]) {
          const saved = p.presets?.[k];
          if (saved) presets[k] = { ...defaults[k], ...saved, tf: { ...defaults[k].tf, ...saved.tf } };
        }
        let indicators = Array.isArray(p.indicators) ? p.indicators : current.indicators;
        if ((p.presetsVersion ?? 1) < PRESETS_VERSION) {
          // v2: Initial passa a usar os números do DRK; Strong/Explosive/Revival recalibrados; DRK desligado
          for (const k of Object.keys(defaults) as PresetKey[]) {
            const saved = p.presets?.[k];
            presets[k] = { ...defaults[k], active: saved?.active ?? defaults[k].active, soundId: saved?.soundId ?? defaults[k].soundId, volume: saved?.volume ?? defaults[k].volume };
          }
          indicators = indicators.map((i) => (i.name === 'Indicadores DRK' ? { ...i, active: false } : i));
        }
        return {
          ...current,
          ...p,
          presets,
          presetsVersion: PRESETS_VERSION,
          indicators,
          operator: { ...EMPTY_OPERATOR_STATE, ...(p.operator ?? {}), settings: { ...EMPTY_OPERATOR_STATE.settings, ...(p.operator?.settings ?? {}) } },
          prefs: { ...DEFAULT_PREFS, ...(p.prefs ?? {}) },
        };
      },
    },
  ),
);

export const getState = () => useStore.getState();
