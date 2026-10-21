import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Alert, MyAlert, PresetConfig, PresetKey, Timeframe, TrackedToken } from '@/domain/types';
import { defaultPresets } from '@/domain/presets';
import type { SourceHealth } from '@/adapters/types';
import { DEXSCREENER_DEFAULT_BASE } from '@/adapters/dexscreener/client';

export type SortKey = 'vol' | 'mcap' | 'liq' | 'peak';
export type WatchTab = 'geral' | 'favoritos' | string; // string = id da pasta
export type AlertFilter = 'all' | PresetKey | 'custom';

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
        return { ...current, ...p, presets, prefs: { ...DEFAULT_PREFS, ...(p.prefs ?? {}) } };
      },
    },
  ),
);

export const getState = () => useStore.getState();
