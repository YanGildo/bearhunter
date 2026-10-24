import { describe, expect, it } from 'vitest';
import prompt from '../../docs/PROMPT_IA_ANALISE.txt?raw';
import { parseAnalyses, parseNum } from './parse';
import { riskScore } from './score';

describe('parseNum', () => {
  it('entende formatos comuns e não inventa zero', () => {
    expect(parseNum('$37.2K')).toBeCloseTo(37200);
    expect(parseNum('36,3%')).toBeCloseTo(36.3);
    expect(parseNum('1,234,567')).toBe(1234567);
    expect(parseNum('1.5M')).toBe(1_500_000);
    expect(parseNum('')).toBeNull();
    expect(parseNum('n/d')).toBeNull();
    expect(parseNum('-298')).toBe(-298);
    expect(parseNum('0.274')).toBe(0.274);
    expect(parseNum('0,274')).toBe(0.274);
    expect(parseNum('1.234.567,5')).toBe(1234567.5);
  });
});

describe('parseAnalyses', () => {
  it('lê o exemplo do prompt', () => {
    const [a] = parseAnalyses(prompt);
    expect(a.token).toBe('BIBI');
    expect(a.ca).toBe('AcsdEAts1wWTW3wXCs96L33PPovrDiymT1hf8sY5pump');
    expect(a.carteirasRiscoPct).toBe(40);
    expect(a.sniperPct).toBeNull();
    expect(a.mintRenunciado).toBe(true);
    expect(a.honeypot).toBe(false);
    expect(a.smartMoneyAcao).toBe('misto');
    expect(a.decisaoGmgn).toBe('leve');
    expect(a.alertas).toHaveLength(4);
  });
  it('lê vários blocos de uma vez', () => {
    const t = '### BH-ANALISE v1\ntoken: A\nca: x\nmcap_usd: 1000\n### FIM\nlixo\n### BH-ANALISE v1\ntoken: B\nca: y\ntop10_pct: 50\n### FIM';
    expect(parseAnalyses(t).map((x) => x.token)).toEqual(['A', 'B']);
  });
});

describe('riskScore', () => {
  it('BIBI do exemplo fica em risco alto (55)', () => {
    const r = riskScore(parseAnalyses(prompt)[0]);
    expect(r.score).toBe(55);
    expect(r.tier).toBe('alto');
    expect(r.factors[0].points).toBe(25);
  });
  it('contrato perigoso vai direto para evitar', () => {
    const [a] = parseAnalyses('### BH-ANALISE v1\ntoken: X\nca: z\nmint_renunciado: nao\nfreeze_renunciado: nao\nhoneypot: sim\n### FIM');
    expect(riskScore(a).tier).toBe('evitar');
  });
  it('sem dados: nota baixa mas confiança baixa', () => {
    const [a] = parseAnalyses('### BH-ANALISE v1\ntoken: X\nca: z\nrede: sol\n### FIM');
    const r = riskScore(a);
    expect(r.score).toBe(0);
    expect(r.confidence).toBe(0);
  });
});
