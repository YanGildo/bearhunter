// Modelo interno padronizado. A UI e o motor de alertas só conhecem estes tipos;
// nenhum componente depende do formato de uma API externa.
// Regra: null = desconhecido. Zero só quando a fonte reporta zero de fato.

export type Timeframe = '5m' | '1h' | '6h' | '24h';
export const TIMEFRAMES: Timeframe[] = ['5m', '1h', '6h', '24h'];

export type PresetKey = 'initial' | 'strong' | 'explosive' | 'revival';
export const PRESET_KEYS: PresetKey[] = ['initial', 'strong', 'explosive', 'revival'];

export type Direction = 'buy' | 'sell';

export interface WindowMetrics {
  volumeUsd: number | null;
  buys: number | null;
  sells: number | null;
  priceChangePct: number | null;
}

/** Uma leitura de mercado de um token num instante, vinda de qualquer adapter. */
export interface MarketObservation {
  tokenAddress: string;
  pairAddress: string | null;
  dexId: string | null; // 'pumpfun' (bonding curve), 'pumpswap', 'raydium'...
  quoteSymbol: string | null;
  source: string; // id do adapter
  observedAt: number; // epoch ms
  priceUsd: number | null;
  priceNative: number | null;
  marketCapUsd: number | null;
  mcapBasis: 'reported' | 'fdv_fallback' | null;
  fdvUsd: number | null;
  liquidityUsd: number | null;
  pairCreatedAt: number | null;
  windows: Record<Timeframe, WindowMetrics>;
  boostsActive: number | null;
}

export interface TokenMeta {
  address: string;
  name: string | null;
  symbol: string | null;
  imageUrl: string | null;
  websites: string[];
  socials: { type: string; url: string }[];
}

export type DiscoverySource =
  | 'manual'
  | 'pumpportal_new'
  | 'pumpportal_migrated'
  | 'boosted'
  | 'profile'
  | 'search';

export type TrackStatus = 'waiting' | 'active' | 'stale';

export interface TrackedToken {
  address: string;
  meta: TokenMeta;
  discovery: DiscoverySource;
  addedAt: number;
  manual: boolean;
  status: TrackStatus;
  lastFetchAt: number | null;
  lastObservation: MarketObservation | null;
  observedPeakMcap: number | null;
  observedPeakAt: number | null;
  zeroVolCycles: number;
  fetchAttempts: number;
  boostAmount: number | null;
  hot: boolean;
}

export interface TimeframeConfig {
  volRisePct: number | null;
  mcapRisePct: number | null;
  minVol: number | null;
  maxVol: number | null;
  minMcap: number | null;
  maxMcap: number | null;
  minChangePct: number | null;
  maxChangePct: number | null;
  minTxns: number | null;
  maxTxns: number | null;
  minLiq: number | null;
  maxLiq: number | null;
  minAgeH: number | null;
  maxAgeH: number | null;
  checkIntervalS: number;
  cooldownS: number;
  maxTokens: number;
  noVolRemoveCycles: number | null;
  hiVolThreshold: number | null;
  buySide: boolean;
  sellSide: boolean;
}

export interface RevivalConfig {
  deadBaselineCeiling: number;
  spikeMultiplier: number;
  realVolumeFloor: number;
  liquidityCeiling: number | null;
  minPairAgeH: number;
  deadWindowMin: number;
  analysisWindowH: number;
  checkIntervalS: number;
  cooldownS: number;
}

export interface PresetConfig {
  key: PresetKey;
  active: boolean;
  timeframes: Timeframe[]; // timeframes monitorados
  tf: Record<Timeframe, TimeframeConfig>;
  revival?: RevivalConfig;
  soundId: string | null;
  volume: number; // 0..1
}

export interface Alert {
  id: string;
  dedupeKey: string;
  tokenAddress: string;
  pairAddress: string | null;
  symbol: string | null;
  name: string | null;
  imageUrl: string | null;
  preset: PresetKey | 'custom' | 'test';
  timeframe: Timeframe;
  direction: Direction;
  dexId: string | null;
  detectedAt: number;
  marketCapUsd: number | null;
  volumeUsd: number | null;
  prevVolumeUsd: number | null;
  volRisePct: number | null;
  mcapRisePct: number | null;
  priceChangePct: number | null;
  buys: number | null;
  sells: number | null;
  liquidityUsd: number | null;
  pairCreatedAt: number | null;
  summary: string;
  reasons: string[];
  warnings: string[];
  isTest: boolean;
}

export type MyAlertMetric = 'mcap' | 'volume5m' | 'priceChange5m' | 'liquidity';
export interface MyAlert {
  id: string;
  tokenAddress: string;
  symbol: string | null;
  metric: MyAlertMetric;
  op: '>' | '<';
  target: number;
  status: 'waiting' | 'triggered' | 'disabled';
  createdAt: number;
  triggeredAt: number | null;
  soundId: string | null;
}
