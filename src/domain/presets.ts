import type { IndicatorColor, IndicatorConfig, IndicatorKey, PresetConfig, PresetKey, RevivalConfig, Timeframe, TimeframeConfig } from './types';
import { TIMEFRAMES } from './types';

export const PRESET_META: Record<PresetKey, { label: string; short: string; color: string }> = {
  initial: { label: 'Initial', short: 'Inicial', color: 'initial' },
  strong: { label: 'Strong', short: 'Forte', color: 'strong' },
  explosive: { label: 'Explosive', short: 'Explosivo', color: 'explosive' },
  revival: { label: 'Revival', short: 'Revival', color: 'revival' },
};

const base: TimeframeConfig = {
  volRisePct: null,
  mcapRisePct: null,
  minVol: null,
  maxVol: null,
  minMcap: null,
  maxMcap: null,
  minChangePct: null,
  maxChangePct: null,
  minTxns: null,
  maxTxns: null,
  minLiq: null,
  maxLiq: null,
  minAgeH: null,
  maxAgeH: null,
  checkIntervalS: 30,
  cooldownS: 300,
  maxTokens: 3000,
  noVolRemoveCycles: 10,
  hiVolThreshold: 50000,
  buySide: true,
  sellSide: false,
};

// Volume mínimo escala com o tamanho da janela.
const volScale: Record<Timeframe, number> = { '5m': 1, '1h': 6, '6h': 24, '24h': 60 };

function tfSet(over: Partial<TimeframeConfig>): Record<Timeframe, TimeframeConfig> {
  const out = {} as Record<Timeframe, TimeframeConfig>;
  for (const tf of TIMEFRAMES) {
    const o = { ...base, ...over };
    if (o.minVol != null) o.minVol = o.minVol * volScale[tf];
    if (o.minTxns != null) o.minTxns = Math.round(o.minTxns * volScale[tf]);
    out[tf] = o;
  }
  return out;
}

export const DEFAULT_REVIVAL: RevivalConfig = {
  deadBaselineCeiling: 500,
  spikeMultiplier: 10,
  realVolumeFloor: 1500,
  liquidityCeiling: 50000,
  minPairAgeH: 24,
  deadWindowMin: 60,
  analysisWindowH: 24,
  checkIntervalS: 30,
  cooldownS: 300,
};

export function defaultPresets(): Record<PresetKey, PresetConfig> {
  return {
    initial: {
      key: 'initial',
      active: true,
      timeframes: ['5m'],
      // Initial = números do indicador DRK (o mais sensível)
      tf: tfSet({ volRisePct: 50, mcapRisePct: 50, minVol: 500, minMcap: 10000, maxMcap: null }),
      soundId: 'builtin:initial',
      volume: 0.7,
    },
    strong: {
      key: 'strong',
      active: true,
      timeframes: ['5m'],
      // Strong: mesma subida %, mas dinheiro e participação maiores
      tf: tfSet({ volRisePct: 50, mcapRisePct: 40, minVol: 5000, minMcap: 25000, maxMcap: null, minTxns: 80 }),
      soundId: 'builtin:strong',
      volume: 0.7,
    },
    explosive: {
      key: 'explosive',
      active: true,
      timeframes: ['5m'],
      // Explosive: subida forte + dinheiro grande ao mesmo tempo; cooldown menor para repetir se a força continuar
      tf: tfSet({ volRisePct: 100, mcapRisePct: 75, minVol: 20000, minMcap: 40000, maxMcap: null, minTxns: 200, minChangePct: 10, cooldownS: 180 }),
      soundId: 'builtin:explosive',
      volume: 0.8,
    },
    revival: {
      key: 'revival',
      active: true,
      timeframes: ['5m'],
      tf: tfSet({}),
      revival: { ...DEFAULT_REVIVAL },
      soundId: 'builtin:revival',
      volume: 0.7,
    },
  };
}

export const PRESETS_VERSION = 2;
export const MAX_INDICATORS = 3;
export const INDICATOR_COLORS: IndicatorColor[] = ['cyan', 'pink', 'lime'];

/**
 * Indicador personalizado com os parâmetros do painel de referência (DRK):
 * vol 5m +50%, MCAP +50%, vol mínimo $500, MCAP mínimo $10K, sem MCAP máximo, 30s,
 * remove após 10 ciclos sem volume, sons normal/critical(+100%)/mega(+200%),
 * high vol new coin $300K, PumpFun live entrada $20K → alerta $100K.
 */
export function defaultIndicator(name = 'Indicadores DRK', color: IndicatorColor = 'cyan'): IndicatorConfig {
  const id = `ind:${Math.random().toString(36).slice(2, 8)}` as IndicatorKey;
  return {
    id,
    name,
    color,
    active: true,
    timeframes: ['5m'],
    tf: tfSet({ volRisePct: 50, mcapRisePct: 50, minVol: 500, minMcap: 10000, maxMcap: null, checkIntervalS: 30, noVolRemoveCycles: 10, hiVolThreshold: null }),
    soundId: 'builtin:drk',
    volume: 0.8,
    tiers: { criticalPct: 100, megaPct: 200, criticalSoundId: 'builtin:drk-critical', megaSoundId: 'builtin:drk-mega' },
    minMcapToStay: null,
    highVolNewCoin: { minTotalVol: 300000, maxAgeH: 24 },
    pumpLive: { entryMcap: 20000, alertMcap: 100000 },
  };
}
