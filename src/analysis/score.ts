// Nota de risco do BearHunter (0 = tranquilo, 100 = evitar). Regras fixas e explicadas:
// a mesma análise sempre dá a mesma nota. Dado desconhecido não soma nem subtrai — só baixa a confiança.
import type { GmgnAnalysis } from './parse';

export type Light = 'green' | 'yellow' | 'red' | 'unknown';
export interface Factor {
  label: string;
  points: number;
  light: Light;
}
export interface RiskResult {
  score: number;
  tier: 'baixo' | 'medio' | 'alto' | 'evitar';
  confidence: number; // 0..1, fração dos campos-chave preenchidos
  factors: Factor[]; // o que somou pontos, do maior para o menor
}

export const TIER_META: Record<RiskResult['tier'], { label: string; tone: string }> = {
  baixo: { label: 'RISCO BAIXO', tone: 'up' },
  medio: { label: 'RISCO MÉDIO', tone: 'warn' },
  alto: { label: 'RISCO ALTO', tone: 'down' },
  evitar: { label: 'EVITAR', tone: 'down' },
};

/** Faixas usadas também nas cores dos cartões do painel. */
export function lightFor(metric: string, v: number | boolean | null): Light {
  if (v == null) return 'unknown';
  const n = typeof v === 'number' ? v : 0;
  switch (metric) {
    case 'carteirasRiscoPct':
    case 'bundlerPct':
      return n >= 40 ? 'red' : n >= 20 ? 'yellow' : 'green';
    case 'top10Pct':
      return n >= 40 ? 'red' : n >= 25 ? 'yellow' : 'green';
    case 'devPct':
      return n >= 10 ? 'red' : n >= 5 ? 'yellow' : 'green';
    case 'freshPct':
    case 'sniperPct':
      return n >= 20 ? 'red' : n >= 8 ? 'yellow' : 'green';
    case 'holdMedioMin':
      return n < 10 ? 'red' : n < 60 ? 'yellow' : 'green';
    case 'liqMcap':
      return n < 0.1 ? 'red' : n < 0.2 ? 'yellow' : 'green';
    case 'liquidezTravadaPct':
      return n < 50 ? 'red' : n < 90 ? 'yellow' : 'green';
    case 'taxaPct':
      return n > 5 ? 'red' : n > 0 ? 'yellow' : 'green';
    case 'rugRatio':
      return n >= 0.5 ? 'red' : n >= 0.2 ? 'yellow' : 'green';
    case 'devTokensCriados':
      return n >= 100 ? 'red' : n >= 10 ? 'yellow' : 'green';
    case 'netbuy5mUsd':
    case 'netbuy1hUsd':
      return n < 0 ? 'red' : n < 500 ? 'yellow' : 'green';
    case 'quedaAthPct':
      return n >= 50 ? 'red' : n >= 25 ? 'yellow' : 'green';
    case 'idadeMin':
      return n < 60 ? 'yellow' : 'green';
    case 'mintRenunciado':
    case 'freezeRenunciado':
      return v === true ? 'green' : 'red';
    case 'honeypot':
    case 'devVendendo':
      return v === true ? 'red' : 'green';
    default:
      return 'unknown';
  }
}

const KEY_FIELDS: (keyof GmgnAnalysis)[] = [
  'mcapUsd',
  'liquidezUsd',
  'holders',
  'top10Pct',
  'devPct',
  'carteirasRiscoPct',
  'holdMedioMin',
  'rugRatio',
  'mintRenunciado',
  'freezeRenunciado',
  'liquidezTravadaPct',
  'netbuy5mUsd',
  'devTokensCriados',
  'idadeMin',
];

export function riskScore(a: GmgnAnalysis): RiskResult {
  const f: Factor[] = [];
  const add = (label: string, points: number, light: Light = points > 0 ? 'red' : 'green') => f.push({ label, points, light });
  const risk = a.carteirasRiscoPct ?? a.bundlerPct;
  if (risk != null) {
    if (risk >= 40) add(`Carteiras de risco com ${risk.toFixed(0)}% do float`, 25);
    else if (risk >= 25) add(`Carteiras de risco com ${risk.toFixed(0)}% do float`, 15, 'yellow');
    else if (risk >= 10) add(`Carteiras de risco com ${risk.toFixed(0)}% do float`, 5, 'yellow');
  }
  if (a.top10Pct != null) {
    if (a.top10Pct >= 40) add(`Top 10 segura ${a.top10Pct.toFixed(0)}%`, 15);
    else if (a.top10Pct >= 25) add(`Top 10 segura ${a.top10Pct.toFixed(0)}%`, 8, 'yellow');
  }
  if (a.devPct != null) {
    if (a.devPct >= 10) add(`Dev segura ${a.devPct.toFixed(1)}%`, 15);
    else if (a.devPct >= 5) add(`Dev segura ${a.devPct.toFixed(1)}%`, 8, 'yellow');
  }
  if (a.devVendendo) add('Dev (ou carteira ligada) vendendo', 10);
  if (a.holdMedioMin != null && a.holdMedioMin < 10) add(`Hold médio de ${a.holdMedioMin.toFixed(0)} min (giro rápido)`, 10);
  if (a.liquidezUsd != null && a.mcapUsd != null && a.mcapUsd > 0) {
    const r = a.liquidezUsd / a.mcapUsd;
    if (r < 0.1) add(`Liquidez só ${(r * 100).toFixed(0)}% do MCAP`, 10);
    else if (r < 0.2) add(`Liquidez ${(r * 100).toFixed(0)}% do MCAP`, 5, 'yellow');
  }
  if (a.liquidezTravadaPct != null && a.liquidezTravadaPct < 50) add(`Só ${a.liquidezTravadaPct.toFixed(0)}% da liquidez travada`, 10);
  if (a.mintRenunciado === false) add('Mint NÃO renunciado', 20);
  if (a.freezeRenunciado === false) add('Freeze NÃO renunciado', 20);
  if (a.honeypot) add('Honeypot / não deixa vender', 40);
  if (a.taxaPct != null && a.taxaPct > 5) add(`Taxa de ${a.taxaPct}%`, 10);
  if (a.rugRatio != null) {
    if (a.rugRatio >= 0.5) add(`Rug ratio do dev ${a.rugRatio.toFixed(2)}`, 15);
    else if (a.rugRatio >= 0.2) add(`Rug ratio do dev ${a.rugRatio.toFixed(2)}`, 5, 'yellow');
  }
  if (a.devTokensCriados != null && a.devTokensCriados >= 100) add(`Dev em série: ${a.devTokensCriados.toLocaleString('pt-BR')} tokens criados`, 8);
  if (a.netbuy5mUsd != null && a.netbuy5mUsd < 0) add('Saldo de compras negativo nos últimos 5 min', 8);
  if (a.quedaAthPct != null && a.quedaAthPct >= 50) add(`Já caiu ${a.quedaAthPct.toFixed(0)}% do topo`, 8);
  if (a.idadeMin != null && a.idadeMin < 60) add(`Token com ${a.idadeMin.toFixed(0)} min de vida`, 5, 'yellow');
  if (a.smartMoneyAcao === 'vendendo') add('Smart money vendendo', 5);
  if (a.smartMoneyAcao === 'comprando') add('Smart money comprando', -5, 'green');
  if (a.decisaoGmgn === 'evitar') add('IA do GMGN diz evitar', 10);

  const score = Math.max(0, Math.min(100, Math.round(f.reduce((s, x) => s + x.points, 0))));
  const tier: RiskResult['tier'] = score >= 75 ? 'evitar' : score >= 55 ? 'alto' : score >= 30 ? 'medio' : 'baixo';
  const filled = KEY_FIELDS.filter((k) => a[k] != null).length;
  return { score, tier, confidence: filled / KEY_FIELDS.length, factors: f.sort((x, y) => y.points - x.points) };
}
