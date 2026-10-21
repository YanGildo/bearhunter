// Modelo interno padronizado. A UI e o motor de alertas só conhecem estes tipos;
// nenhum componente depende do formato de uma API externa.
// Regra: null = desconhecido. Zero só quando a fonte reporta zero de fato.

export type Timeframe = '5m' | '1h' | '6h' | '24h';
export const TIMEFRAMES: Timeframe[] = ['5m', '1h', '6h', '24h'];

export type PresetKey = 'initial' | 'strong' | 'explosive' | 'revival';
export const PRESET_KEYS: PresetKey[] = ['initial', 'strong', 'explosive', 'revival'];

export type Direction = 'buy' | 'sell';

/** Indicador personalizado criado pelo usuário (ex.: "Indicadores DRK"). */
export type IndicatorKey = `ind:${string}`;
/** Qualquer origem de alerta: preset nativo, indicador personalizado, My Alert ou teste. */
export type AlertSource = PresetKey | IndicatorKey | 'custom' | 'test';
export type IndicatorColor = 'cyan' | 'pink' | 'lime';

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
  | 'search'
  | 'operator';

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
  firstObservedMcap: number | null; // MCAP na primeira leitura (para o "PumpFun live")
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

export interface IndicatorConfig {
  id: IndicatorKey;
  name: string;
  color: IndicatorColor;
  active: boolean;
  timeframes: Timeframe[];
  tf: Record<Timeframe, TimeframeConfig>;
  soundId: string | null;
  volume: number;
  /** Som por nível de subida do volume (como no painel do colega: normal/critical/mega). */
  tiers: { criticalPct: number | null; megaPct: number | null; criticalSoundId: string | null; megaSoundId: string | null };
  /** Tokens automáticos abaixo deste MCAP saem da lista (vazio = sem limite). */
  minMcapToStay: number | null;
  /** Alerta único quando um token novo passa deste volume total (24h). */
  highVolNewCoin: { minTotalVol: number | null; maxAgeH: number };
  /** Token novo da Pump.fun que entrou abaixo de `entryMcap` e passou de `alertMcap`. */
  pumpLive: { entryMcap: number | null; alertMcap: number | null };
}

export interface Alert {
  id: string;
  dedupeKey: string;
  tokenAddress: string;
  pairAddress: string | null;
  symbol: string | null;
  name: string | null;
  imageUrl: string | null;
  preset: AlertSource;
  presetName?: string; // nome do indicador no momento do alerta
  presetColor?: IndicatorColor;
  level?: 'normal' | 'critical' | 'mega';
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
