// Motor de alertas: funções puras. Recebe observações normalizadas e a config dos presets
// e devolve candidatos a alerta com o motivo (reasons) e avisos (warnings).
// Não sabe de onde vieram os dados.

import { median, pctChange } from './num';
import type {
  Direction,
  MarketObservation,
  PresetKey,
  RevivalConfig,
  Timeframe,
  TimeframeConfig,
} from './types';

export interface Candidate {
  preset: PresetKey;
  timeframe: Timeframe;
  direction: Direction;
  volumeUsd: number | null;
  prevVolumeUsd: number | null;
  volRisePct: number | null;
  mcapRisePct: number | null;
  priceChangePct: number | null;
  buys: number | null;
  sells: number | null;
  reasons: string[];
  warnings: string[];
  summaryCore: string;
}

export interface EvalResult {
  candidates: Candidate[];
  rejects: string[];
}

const TF_LABEL: Record<Timeframe, string> = { '5m': '5M', '1h': '1H', '6h': '6H', '24h': '24H' };

/**
 * Observação usada como "anterior" para medir subida: a mais recente que tenha pelo menos
 * ~1 intervalo de distância, sem ser velha demais (evita comparar com um snapshot de horas atrás
 * quando a aba ficou parada).
 */
export function findPrevious(
  history: MarketObservation[],
  current: MarketObservation,
  intervalS: number,
): MarketObservation | null {
  const minGap = intervalS * 1000 * 0.8;
  const maxGap = Math.max(intervalS * 4, 300) * 1000;
  for (let i = history.length - 1; i >= 0; i--) {
    const h = history[i];
    const gap = current.observedAt - h.observedAt;
    if (gap < minGap) continue;
    if (gap > maxGap) return null;
    return h;
  }
  return null;
}

function inRange(v: number | null, min: number | null, max: number | null, name: string, rejects: string[]): boolean {
  if (min == null && max == null) return true;
  if (v == null) {
    rejects.push(`${name}_unknown`);
    return false;
  }
  if (min != null && v < min) {
    rejects.push(`${name}_below_min`);
    return false;
  }
  if (max != null && v > max) {
    rejects.push(`${name}_above_max`);
    return false;
  }
  return true;
}

export function evaluateTimeframe(
  preset: PresetKey,
  tf: Timeframe,
  cfg: TimeframeConfig,
  current: MarketObservation,
  history: MarketObservation[],
  now = Date.now(),
): EvalResult {
  const rejects: string[] = [];
  const w = current.windows[tf];
  const vol = w.volumeUsd;
  const mcap = current.marketCapUsd;

  if (vol == null) return { candidates: [], rejects: ['volume_unknown'] };
  if (!inRange(vol, cfg.minVol, cfg.maxVol, 'volume', rejects)) return { candidates: [], rejects };
  if (cfg.minMcap != null || cfg.maxMcap != null) {
    if (mcap != null && mcap <= 0) return { candidates: [], rejects: ['mcap_invalid'] };
  }
  if (!inRange(mcap, cfg.minMcap, cfg.maxMcap, 'mcap', rejects)) return { candidates: [], rejects };
  if (!inRange(current.liquidityUsd, cfg.minLiq, cfg.maxLiq, 'liquidity', rejects)) return { candidates: [], rejects };
  if (!inRange(w.priceChangePct, cfg.minChangePct, cfg.maxChangePct, 'price_change', rejects))
    return { candidates: [], rejects };
  const txns = w.buys != null && w.sells != null ? w.buys + w.sells : null;
  if (!inRange(txns, cfg.minTxns, cfg.maxTxns, 'txns', rejects)) return { candidates: [], rejects };
  const ageH = current.pairCreatedAt != null ? (now - current.pairCreatedAt) / 3_600_000 : null;
  if (!inRange(ageH, cfg.minAgeH, cfg.maxAgeH, 'pair_age', rejects)) return { candidates: [], rejects };

  const prev = cfg.volRisePct != null || cfg.mcapRisePct != null ? findPrevious(history, current, cfg.checkIntervalS) : null;
  const prevVol = prev?.windows[tf].volumeUsd ?? null;
  const volRise = pctChange(vol, prevVol);
  const mcapRise = pctChange(mcap, prev?.marketCapUsd ?? null);

  if (cfg.volRisePct != null) {
    if (volRise == null) return { candidates: [], rejects: [prev ? 'previous_volume_invalid' : 'previous_missing'] };
    if (volRise < cfg.volRisePct) return { candidates: [], rejects: ['vol_rise_below'] };
  }
  if (cfg.mcapRisePct != null) {
    if (mcapRise == null) return { candidates: [], rejects: [prev ? 'previous_mcap_invalid' : 'previous_missing'] };
    if (mcapRise < cfg.mcapRisePct) return { candidates: [], rejects: ['mcap_rise_below'] };
  }

  const warnings: string[] = [];
  if (current.liquidityUsd == null) warnings.push(current.dexId === 'pumpfun' ? 'bonding_curve_sem_liquidez' : 'liquidez_desconhecida');
  if (current.mcapBasis === 'fdv_fallback') warnings.push('mcap_via_fdv');
  if (ageH == null) warnings.push('idade_desconhecida');

  const candidates: Candidate[] = [];
  const dirs: Direction[] = [];
  if (cfg.buySide) dirs.push('buy');
  if (cfg.sellSide) dirs.push('sell');
  for (const dir of dirs) {
    const pc = w.priceChangePct;
    if (pc == null) {
      rejects.push(`${dir}_price_change_unknown`);
      continue;
    }
    if (dir === 'buy' && pc <= 0) {
      rejects.push('buy_price_not_up'); // volume alto com preço caindo nunca vira Buy
      continue;
    }
    if (dir === 'sell' && pc >= 0) {
      rejects.push('sell_price_not_down');
      continue;
    }
    if (w.buys != null && w.sells != null) {
      if (dir === 'buy' && w.buys <= w.sells) {
        rejects.push('buy_pressure_missing');
        continue;
      }
      if (dir === 'sell' && w.sells <= w.buys) {
        rejects.push('sell_pressure_missing');
        continue;
      }
    }
    const reasons: string[] = [];
    if (volRise != null) reasons.push(`vol ${TF_LABEL[tf]} ${volRise >= 0 ? '+' : ''}${volRise.toFixed(0)}%`);
    if (mcapRise != null) reasons.push(`mcap ${mcapRise >= 0 ? '+' : ''}${mcapRise.toFixed(0)}%`);
    reasons.push(`preço ${pc > 0 ? '+' : ''}${pc.toFixed(1)}%`);
    if (w.buys != null && w.sells != null) reasons.push(`B/S ${w.buys}/${w.sells}`);
    const parts = [`${TF_LABEL[tf]} vol ${volRise != null ? `${volRise >= 0 ? '+' : ''}${volRise.toFixed(0)}%` : ''}`.trim()];
    if (mcapRise != null) parts.push(`MCap ${mcapRise >= 0 ? '+' : ''}${mcapRise.toFixed(0)}%`);
    candidates.push({
      preset,
      timeframe: tf,
      direction: dir,
      volumeUsd: vol,
      prevVolumeUsd: prevVol,
      volRisePct: volRise,
      mcapRisePct: mcapRise,
      priceChangePct: pc,
      buys: w.buys,
      sells: w.sells,
      reasons,
      warnings,
      summaryCore: parts.join(' | '),
    });
  }
  return { candidates, rejects };
}

export interface RevivalResult {
  candidate: Candidate | null;
  rejects: string[];
  baseline: number | null;
  multiple: number | null;
  src: 'snapshots' | 'windows_estimate' | null;
  conf: 'high' | 'med' | 'low' | null;
}

/**
 * Revival: token "morto" (volume de 5m muito baixo por um tempo) que volta com um pico real.
 * Baseline = mediana do volume 5m nos snapshots que o bot viu; se não houver histórico
 * suficiente, estima pela janela 1h/6h/24h da fonte (confiança baixa).
 */
export function evaluateRevival(
  cfg: RevivalConfig,
  current: MarketObservation,
  history: MarketObservation[],
  now = Date.now(),
): RevivalResult {
  const none = (r: string): RevivalResult => ({ candidate: null, rejects: [r], baseline: null, multiple: null, src: null, conf: null });
  const w5 = current.windows['5m'];
  const vol = w5.volumeUsd;
  if (vol == null) return none('volume_unknown');
  if (vol < cfg.realVolumeFloor) return none('below_real_volume_floor');
  if (current.pairCreatedAt == null) return none('pair_age_unknown');
  const ageH = (now - current.pairCreatedAt) / 3_600_000;
  if (ageH < cfg.minPairAgeH) return none('pair_too_young');
  const warnings: string[] = [];
  if (cfg.liquidityCeiling != null) {
    if (current.liquidityUsd == null) warnings.push('liquidez_desconhecida');
    else if (current.liquidityUsd > cfg.liquidityCeiling) return none('liquidity_above_ceiling');
  }
  const pc = w5.priceChangePct;
  if (pc == null || pc <= 0) return none('buy_price_not_up');
  if (w5.buys != null && w5.sells != null && w5.buys <= w5.sells) return none('buy_pressure_missing');

  // 1) baseline pelos snapshots próprios (exclui os últimos 5 min, que são o pico)
  const spikeStart = current.observedAt - 5 * 60_000;
  const windowStart = current.observedAt - cfg.analysisWindowH * 3_600_000;
  const past = history.filter((h) => h.observedAt >= windowStart && h.observedAt < spikeStart);
  const pastVols = past.map((h) => h.windows['5m'].volumeUsd).filter((v): v is number => v != null);
  const coverageMin = past.length >= 2 ? (past[past.length - 1].observedAt - past[0].observedAt) / 60_000 : 0;

  let baseline: number | null = null;
  let src: RevivalResult['src'] = null;
  let conf: RevivalResult['conf'] = null;

  if (pastVols.length >= 6 && coverageMin >= cfg.deadWindowMin) {
    const deadFrom = spikeStart - cfg.deadWindowMin * 60_000;
    const deadVols = past
      .filter((h) => h.observedAt >= deadFrom)
      .map((h) => h.windows['5m'].volumeUsd)
      .filter((v): v is number => v != null);
    if (deadVols.some((v) => v > cfg.deadBaselineCeiling)) return none('not_dead_before_spike');
    baseline = median(pastVols);
    src = 'snapshots';
    conf = coverageMin >= cfg.analysisWindowH * 30 ? 'high' : 'med';
  } else {
    // 2) estimativa pelas janelas da fonte
    const h1 = current.windows['1h'].volumeUsd;
    const h6 = current.windows['6h'].volumeUsd;
    const h24 = current.windows['24h'].volumeUsd;
    if (h1 == null || h24 == null) return none('baseline_unavailable');
    const hourBefore = Math.max(0, h1 - vol) / 11; // média por 5m nos 55 min anteriores ao pico
    if (hourBefore > cfg.deadBaselineCeiling) return none('not_dead_before_spike');
    if (cfg.deadWindowMin > 60 && h6 != null) {
      const before = Math.max(0, h6 - h1) / 60;
      if (before > cfg.deadBaselineCeiling) return none('not_dead_before_spike');
    }
    baseline = Math.max(0, h24 - h1) / 276; // 23h × 12 janelas de 5m
    src = 'windows_estimate';
    conf = 'low';
  }
  if (baseline == null) return none('baseline_unavailable');
  if (baseline > cfg.deadBaselineCeiling) return none('baseline_above_ceiling');
  const multiple = vol / Math.max(baseline, 1);
  if (multiple < cfg.spikeMultiplier) return { ...none('spike_below_multiplier'), baseline, multiple, src, conf };

  const b = baseline < 10 ? baseline.toFixed(1) : baseline.toFixed(0);
  return {
    candidate: {
      preset: 'revival',
      timeframe: '5m',
      direction: 'buy',
      volumeUsd: vol,
      prevVolumeUsd: baseline,
      volRisePct: null,
      mcapRisePct: null,
      priceChangePct: pc,
      buys: w5.buys,
      sells: w5.sells,
      reasons: [`${multiple.toFixed(1)}x acima do baseline`, `baseline $${b}/5m`, `src:${src}`, `conf:${conf}`],
      warnings,
      summaryCore: `${multiple.toFixed(1)}x acima do morto ($${b}/5m) | conf:${conf} | src:${src}`,
    },
    rejects: [],
    baseline,
    multiple,
    src,
    conf,
  };
}

export function dedupeKey(token: string, pair: string | null, preset: string, tf: Timeframe, dir: Direction): string {
  return `${token}|${pair ?? '-'}|${preset}|${tf}|${dir}`;
}
