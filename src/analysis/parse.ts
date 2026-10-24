// Formato "BH-ANALISE v1": blocos de texto chave: valor que a IA externa devolve a partir
// das respostas da IA do GMGN. Vários blocos (vários tokens) podem vir num único texto.
// Valor vazio, "?", "-" ou "n/d" = desconhecido (null). Nunca vira zero.

export interface GmgnAnalysis {
  token: string | null;
  ca: string | null;
  rede: string | null;
  analisadoEm: string | null;
  idadeMin: number | null;
  mcapUsd: number | null;
  liquidezUsd: number | null;
  volume24hUsd: number | null;
  holders: number | null;
  top10Pct: number | null;
  devPct: number | null;
  devVendendo: boolean | null;
  devTokensCriados: number | null;
  devTokensMigrados: number | null;
  rugRatio: number | null;
  carteirasRiscoPct: number | null;
  bundlerPct: number | null;
  freshPct: number | null;
  sniperPct: number | null;
  holdMedioMin: number | null;
  smartMoney: number | null;
  smartMoneyAcao: 'comprando' | 'vendendo' | 'misto' | null;
  kol: number | null;
  liquidezTravadaPct: number | null;
  mintRenunciado: boolean | null;
  freezeRenunciado: boolean | null;
  taxaPct: number | null;
  honeypot: boolean | null;
  netbuy5mUsd: number | null;
  netbuy1hUsd: number | null;
  quedaAthPct: number | null;
  decisaoGmgn: 'evitar' | 'leve' | 'ok' | null;
  resumo: string | null;
  alertas: string[];
  observar: string[];
}

const KEYS: Record<string, keyof GmgnAnalysis> = {
  token: 'token',
  ca: 'ca',
  rede: 'rede',
  analisado_em: 'analisadoEm',
  idade_min: 'idadeMin',
  mcap_usd: 'mcapUsd',
  liquidez_usd: 'liquidezUsd',
  volume_24h_usd: 'volume24hUsd',
  holders: 'holders',
  top10_pct: 'top10Pct',
  dev_pct: 'devPct',
  dev_vendendo: 'devVendendo',
  dev_tokens_criados: 'devTokensCriados',
  dev_tokens_migrados: 'devTokensMigrados',
  rug_ratio: 'rugRatio',
  carteiras_risco_pct: 'carteirasRiscoPct',
  bundler_pct: 'bundlerPct',
  fresh_pct: 'freshPct',
  sniper_pct: 'sniperPct',
  hold_medio_min: 'holdMedioMin',
  smart_money: 'smartMoney',
  smart_money_acao: 'smartMoneyAcao',
  kol: 'kol',
  liquidez_travada_pct: 'liquidezTravadaPct',
  mint_renunciado: 'mintRenunciado',
  freeze_renunciado: 'freezeRenunciado',
  taxa_pct: 'taxaPct',
  honeypot: 'honeypot',
  netbuy_5m_usd: 'netbuy5mUsd',
  netbuy_1h_usd: 'netbuy1hUsd',
  queda_ath_pct: 'quedaAthPct',
  decisao_gmgn: 'decisaoGmgn',
  resumo: 'resumo',
  alertas: 'alertas',
  observar: 'observar',
};

const BOOL_KEYS = new Set<keyof GmgnAnalysis>(['devVendendo', 'mintRenunciado', 'freezeRenunciado', 'honeypot']);
const TEXT_KEYS = new Set<keyof GmgnAnalysis>(['token', 'ca', 'rede', 'analisadoEm', 'resumo']);
const LIST_KEYS = new Set<keyof GmgnAnalysis>(['alertas', 'observar']);

export function emptyAnalysis(): GmgnAnalysis {
  const a = {} as Record<string, unknown>;
  for (const k of Object.values(KEYS)) a[k] = LIST_KEYS.has(k) ? [] : null;
  return a as unknown as GmgnAnalysis;
}

const UNKNOWN = /^(|\?|-|—|n\/?d|na|n\/a|null|none|desconhecido|sem dado|sem dados)$/i;

/** "1.2K", "$37,209", "36,3%", "1.5M", "0,12" → número. Desconhecido → null. */
export function parseNum(raw: string): number | null {
  let s = raw.trim().replace(/[≈~$\s]|usd|sol/gi, '');
  if (UNKNOWN.test(s)) return null;
  s = s.replace(/%$/, '');
  let mult = 1;
  const suf = /([kmb])$/i.exec(s);
  if (suf) {
    mult = { k: 1e3, m: 1e6, b: 1e9 }[suf[1].toLowerCase() as 'k' | 'm' | 'b'];
    s = s.slice(0, -1);
  }
  // "1,234,567" (milhar) vs "36,3" (decimal pt-BR)
  // ("0,274" e "0.274" são decimais; "1.234" sozinho também — o prompt pede ponto decimal)
  if (/^-?[1-9]\d{0,2}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
  else if (/^-?[1-9]\d{0,2}(\.\d{3}){2,}(,\d+)?$/.test(s) || /^-?[1-9]\d{0,2}(\.\d{3})+,\d+$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n * mult : null;
}

export function parseBool(raw: string): boolean | null {
  const s = raw.trim().toLowerCase();
  if (UNKNOWN.test(s)) return null;
  if (/^(sim|s|yes|y|true|1|✅)$/.test(s)) return true;
  if (/^(nao|não|n|no|false|0|❌)$/.test(s)) return false;
  return null;
}

function parseList(raw: string): string[] {
  return raw
    .split(/\s*;\s*|\s*\|\s*/)
    .map((x) => x.replace(/^[-•*]\s*/, '').trim())
    .filter((x) => x && !UNKNOWN.test(x));
}

function parseBlock(text: string): GmgnAnalysis | null {
  const a = emptyAnalysis() as unknown as Record<string, unknown>;
  let lastList: string | null = null;
  let found = 0;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/^\s*[-*]\s+(?=[a-z_0-9]+\s*:)/i, '').trimEnd();
    const m = /^\s*([a-z_0-9]+)\s*[:=]\s*(.*)$/i.exec(line);
    if (m && KEYS[m[1].toLowerCase()]) {
      const key = KEYS[m[1].toLowerCase()];
      const val = m[2].trim();
      found++;
      lastList = null;
      if (LIST_KEYS.has(key)) {
        a[key] = parseList(val);
        lastList = key;
      } else if (BOOL_KEYS.has(key)) a[key] = parseBool(val);
      else if (TEXT_KEYS.has(key)) a[key] = UNKNOWN.test(val) ? null : val;
      else if (key === 'smartMoneyAcao') {
        const v = val.toLowerCase();
        a[key] = /compr|acumul|buy/.test(v) ? 'comprando' : /vend|sell|sai/.test(v) ? 'vendendo' : /mist|mix|diverg/.test(v) ? 'misto' : null;
      } else if (key === 'decisaoGmgn') {
        const v = val.toLowerCase();
        a[key] = /evit|avoid|n[aã]o/.test(v) ? 'evitar' : /leve|limit|light|pequen/.test(v) ? 'leve' : /ok|pode|particip|sim/.test(v) ? 'ok' : null;
      } else a[key] = parseNum(val);
    } else if (lastList && /^\s*[-•*]\s+\S/.test(rawLine)) {
      // listas também podem vir em linhas "- item" logo abaixo da chave
      (a[lastList] as string[]).push(rawLine.replace(/^\s*[-•*]\s+/, '').trim());
    }
  }
  if (found < 3) return null;
  return a as unknown as GmgnAnalysis;
}

/** Lê um ou mais blocos BH-ANALISE de um texto colado. */
export function parseAnalyses(text: string): GmgnAnalysis[] {
  const parts = text.split(/^\s*#{2,}\s*BH-ANALISE[^\n]*$/im).slice(1);
  const blocks = (parts.length ? parts : [text]).map((p) => p.split(/^\s*#{2,}\s*FIM\b.*$/im)[0]);
  return blocks.map(parseBlock).filter((x): x is GmgnAnalysis => !!x && (!!x.token || !!x.ca));
}
