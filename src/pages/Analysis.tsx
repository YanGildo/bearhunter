import { useMemo, useState } from 'react';
import { ClipboardCopy, Copy, Download, ExternalLink, FileSearch, LineChart, Plus, ShieldAlert, Trash2 } from 'lucide-react';
import { useStore, type AnalysisEntry } from '@/state/store';
import { useUi } from '@/state/ui';
import { parseAnalyses, type GmgnAnalysis } from '@/analysis/parse';
import { lightFor, riskScore, TIER_META, type Light } from '@/analysis/score';
import { collector } from '@/collector/collector';
import { fmtUsd, shortAddr } from '@/domain/num';
import { copyText, gmgnUrl } from '@/lib/links';
import { cn } from '@/lib/cn';
import { toast } from '@/ui/primitives';
import { TokenLogo } from '@/ui/TokenLogo';
import prompt from '../../docs/PROMPT_IA_ANALISE.txt?raw';

/** As perguntas para a IA do GMGN (na página do token). As duas primeiras são atalhos do próprio GMGN. */
const QUESTIONS = [
  { n: 1, title: 'Análise do token', hint: 'segurança, liquidez, dev, fluxo', text: 'Analyze this token in depth' },
  { n: 2, title: 'Holders (quem pode despejar)', hint: 'bundlers, fresh, hold médio, dev', text: 'Analyze the holder chip distribution of this token, based on the Top 100 holders data' },
  {
    n: 3,
    title: 'Fluxo agora (opcional)',
    hint: 'se a 1 não trouxer compras/vendas recentes',
    text: 'For this token, answer in a short list: net buy USD in the last 5 minutes and in the last 1 hour, how far the price is below its ATH in %, and whether Smart Money is buying or selling right now.',
  },
];

const dot: Record<Light, string> = { green: 'bg-up', yellow: 'bg-warn', red: 'bg-down', unknown: 'bg-dim/50' };
const toneText: Record<string, string> = { up: 'text-up', warn: 'text-warn', down: 'text-down' };
const toneChip: Record<string, string> = { up: 'border-up/60 bg-up/15 text-up', warn: 'border-warn/60 bg-warn/15 text-warn', down: 'border-down/60 bg-down/15 text-down' };

const pct = (v: number | null, d = 1) => (v == null ? '—' : `${v.toFixed(d)}%`);
const yn = (v: boolean | null, yes = 'sim', no = 'não') => (v == null ? '—' : v ? yes : no);
const num = (v: number | null) => (v == null ? '—' : v.toLocaleString('pt-BR'));
const mins = (v: number | null) => (v == null ? '—' : v < 60 ? `${v.toFixed(v < 10 ? 1 : 0)} min` : v < 1440 ? `${(v / 60).toFixed(1)} h` : `${(v / 1440).toFixed(1)} d`);
const signed = (v: number | null) => (v == null ? '—' : `${v < 0 ? '−' : '+'}${fmtUsd(Math.abs(v))}`);

function openChart(a: GmgnAnalysis) {
  if (!a.ca) return;
  const t = useStore.getState().tokens[a.ca];
  useUi.getState().set({ chartModal: { token: a.ca, pair: t?.lastObservation?.pairAddress ?? null, symbol: a.token, name: t?.meta.name ?? null, imageUrl: t?.meta.imageUrl ?? null } });
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col rounded-lg border border-line bg-card p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/20 text-[12px] font-bold text-primary">{n}</span>
        <span className="text-[12.5px] font-bold">{title}</span>
      </div>
      <div className="flex-1 space-y-1.5 text-[11.5px] text-muted">{children}</div>
    </div>
  );
}

function HowTo() {
  const download = () => {
    const url = URL.createObjectURL(new Blob([prompt], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'prompt-bearhunter-analise.txt';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <div className="flex flex-col gap-2 lg:flex-row lg:items-stretch">
      <Step n={1} title="GMGN: pergunte à IA (na página do token)">
        {QUESTIONS.map((q) => (
          <button
            key={q.n}
            className="flex w-full items-start gap-2 rounded-md border border-line px-2 py-1.5 text-left hover:border-primary/50 hover:bg-primary/5"
            onClick={() => void copyText(q.text).then(() => toast(`Pergunta ${q.n} copiada`))}
            title={q.text}
          >
            <ClipboardCopy size={13} className="mt-0.5 shrink-0 text-primary" />
            <span>
              <span className="font-semibold text-fg">
                {q.n}. {q.title}
              </span>
              <span className="block text-[10.5px] text-dim">{q.hint}</span>
            </span>
          </button>
        ))}
      </Step>
      <div className="hidden items-center text-dim lg:flex">→</div>
      <Step n={2} title="Sua IA: converta">
        <p>Abra uma conversa na sua IA, cole o prompt (uma vez) e depois cole as respostas do GMGN — pode ser de vários tokens juntos.</p>
        <div className="flex flex-wrap gap-1.5 pt-1">
          <button className="btn h-8" onClick={() => void copyText(prompt).then(() => toast('Prompt copiado'))}>
            <Copy size={12} /> Copiar prompt
          </button>
          <button className="btn h-8" onClick={download}>
            <Download size={12} /> Baixar .txt
          </button>
        </div>
        <p className="text-[10.5px] text-dim">Ela devolve um resumo com 🟢🟡🔴 para você ler e um bloco que começa com "### BH-ANALISE v1".</p>
      </Step>
      <div className="hidden items-center text-dim lg:flex">→</div>
      <Step n={3} title="BearHunter: cole o bloco abaixo">
        <p>Copie a resposta da IA (pode colar tudo, o bot acha os blocos sozinho) e clique em <b className="text-fg">Ler análise</b>.</p>
        <p>O bot calcula a nota de risco com regras fixas — a mesma análise sempre dá a mesma nota — e guarda na sua conta.</p>
      </Step>
    </div>
  );
}

function Row({ label, value, light, hint }: { label: string; value: string; light: Light; hint?: string }) {
  return (
    <div className="flex items-center gap-2 py-1 text-[12px]" title={hint}>
      <span className={cn('h-2 w-2 shrink-0 rounded-full', dot[light])} />
      <span className="flex-1 text-muted">{label}</span>
      <span className="num font-semibold">{value}</span>
    </div>
  );
}

function Box({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-card px-3 py-2">
      <div className="label mb-1">{title}</div>
      {children}
    </div>
  );
}

function Panel({ e }: { e: AnalysisEntry }) {
  const a = e.data;
  const r = useMemo(() => riskScore(a), [a]);
  const live = useStore((s) => (a.ca ? s.tokens[a.ca] : undefined));
  const tier = TIER_META[r.tier];
  const liqMcap = a.liquidezUsd != null && a.mcapUsd ? a.liquidezUsd / a.mcapUsd : null;
  const migRate = a.devTokensCriados && a.devTokensMigrados != null ? (a.devTokensMigrados / a.devTokensCriados) * 100 : null;
  const nowMcap = live?.lastObservation?.marketCapUsd ?? null;
  const since = nowMcap != null && a.mcapUsd ? (nowMcap / a.mcapUsd - 1) * 100 : null;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <TokenLogo src={live?.meta.imageUrl} symbol={a.token} address={a.ca} size={34} />
        <div className="min-w-0">
          <div className="text-[18px] font-bold leading-tight">${a.token ?? '—'}</div>
          {a.ca && (
            <button className="num flex items-center gap-1 text-[10.5px] text-dim hover:text-fg" onClick={() => void copyText(a.ca!).then(() => toast('CA copiado'))}>
              {shortAddr(a.ca, 6)} <Copy size={10} />
            </button>
          )}
        </div>
        <div className="ml-auto flex flex-wrap gap-1.5">
          {a.ca && (
            <>
              <button className="btn h-8" onClick={() => openChart(a)}>
                <LineChart size={12} /> Gráfico
              </button>
              <a className="btn h-8" href={gmgnUrl(a.ca)} target="_blank" rel="noreferrer">
                <ExternalLink size={12} /> GMGN
              </a>
              {!live && (
                <button
                  className="btn h-8"
                  title="Acompanhar o volume deste token no Dashboard"
                  onClick={() => {
                    collector.addToken(a.ca!, 'manual', { symbol: a.token });
                    toast('Adicionado à Watchlist');
                  }}
                >
                  <Plus size={12} /> Watchlist
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-[minmax(220px,0.8fr)_1.2fr]">
        <div className={cn('rounded-lg border p-3', toneChip[tier.tone])}>
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] font-bold tracking-[0.14em]">{tier.label}</span>
            <span className="num text-[10.5px] opacity-80">confiança {Math.round(r.confidence * 100)}%</span>
          </div>
          <div className="num mt-1 text-[44px] font-extrabold leading-none">
            {r.score}
            <span className="text-[16px] font-semibold opacity-60">/100</span>
          </div>
          <div className="relative mt-3 h-2 rounded-full" style={{ background: 'linear-gradient(90deg, hsl(var(--up)) 0%, hsl(var(--warn)) 45%, hsl(var(--down)) 75%)' }}>
            <span className="absolute -top-1 h-4 w-1 -translate-x-1/2 rounded bg-fg shadow" style={{ left: `${r.score}%` }} />
          </div>
          <div className="relative mt-1 h-3 text-[9.5px] text-fg/60">
            <span className="absolute left-0">baixo</span>
            <span className="absolute left-[30%]">médio</span>
            <span className="absolute left-[55%]">alto</span>
            <span className="absolute right-0">evitar</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5 text-[10.5px]">
            {a.decisaoGmgn && (
              <span className={cn('chip', a.decisaoGmgn === 'evitar' ? toneChip.down : a.decisaoGmgn === 'leve' ? toneChip.warn : toneChip.up)}>
                GMGN: {a.decisaoGmgn === 'evitar' ? 'evitar' : a.decisaoGmgn === 'leve' ? 'posição leve' : 'pode participar'}
              </span>
            )}
            {r.confidence < 0.5 && <span className="chip border-line text-muted">poucos dados — faça a pergunta 2 também</span>}
          </div>
        </div>
        <div className="space-y-2">
          {a.resumo && <p className="rounded-lg border border-line bg-card p-3 text-[12.5px] leading-relaxed">{a.resumo}</p>}
          <div className="rounded-lg border border-line bg-card p-3">
            <div className="label mb-1">Por que essa nota</div>
            {!r.factors.length && <div className="text-[11.5px] text-dim">Nenhum fator de risco com os dados informados.</div>}
            {r.factors.map((f) => (
              <div key={f.label} className="flex items-center gap-2 py-0.5 text-[11.5px]">
                <span className={cn('h-2 w-2 shrink-0 rounded-full', dot[f.light])} />
                <span className="flex-1">{f.label}</span>
                <span className={cn('num font-bold', f.points > 0 ? 'text-down' : 'text-up')}>
                  {f.points > 0 ? '+' : ''}
                  {f.points}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {(a.alertas.length > 0 || a.observar.length > 0) && (
        <div className="grid gap-3 md:grid-cols-2">
          {a.alertas.length > 0 && (
            <div className="rounded-lg border border-down/40 bg-down/5 p-3">
              <div className="label mb-1 flex items-center gap-1 text-down">
                <ShieldAlert size={12} /> Alertas
              </div>
              <ul className="space-y-0.5 text-[12px]">
                {a.alertas.map((x) => (
                  <li key={x}>🔴 {x}</li>
                ))}
              </ul>
            </div>
          )}
          {a.observar.length > 0 && (
            <div className="rounded-lg border border-warn/40 bg-warn/5 p-3">
              <div className="label mb-1 text-warn">O que vigiar</div>
              <ul className="space-y-0.5 text-[12px]">
                {a.observar.map((x) => (
                  <li key={x}>👀 {x}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Box title="Quem pode despejar">
          <Row label="Carteiras de risco" value={pct(a.carteirasRiscoPct)} light={lightFor('carteirasRiscoPct', a.carteirasRiscoPct)} hint="% do float em carteiras marcadas (bundler, fresh, sniper…), sem contar repetidas" />
          <Row label="Bundlers" value={pct(a.bundlerPct)} light={lightFor('bundlerPct', a.bundlerPct)} />
          <Row label="Fresh wallets" value={pct(a.freshPct)} light={lightFor('freshPct', a.freshPct)} />
          <Row label="Snipers" value={pct(a.sniperPct)} light={lightFor('sniperPct', a.sniperPct)} />
          <Row label="Top 10 (sem o pool)" value={pct(a.top10Pct)} light={lightFor('top10Pct', a.top10Pct)} />
          <Row label="Hold médio" value={mins(a.holdMedioMin)} light={lightFor('holdMedioMin', a.holdMedioMin)} />
        </Box>
        <Box title="Dev">
          <Row label="Dev segura" value={pct(a.devPct, 2)} light={lightFor('devPct', a.devPct)} />
          <Row label="Dev vendendo" value={yn(a.devVendendo)} light={lightFor('devVendendo', a.devVendendo)} />
          <Row label="Tokens criados" value={num(a.devTokensCriados)} light={lightFor('devTokensCriados', a.devTokensCriados)} />
          <Row label="Migraram" value={a.devTokensMigrados == null ? '—' : `${num(a.devTokensMigrados)}${migRate != null ? ` (${migRate.toFixed(0)}%)` : ''}`} light="unknown" />
          <Row label="Rug ratio" value={a.rugRatio == null ? '—' : a.rugRatio.toFixed(2)} light={lightFor('rugRatio', a.rugRatio)} hint="Histórico de rug do dev: 0 = nenhum, 1 = todos" />
        </Box>
        <Box title="Segurança do contrato">
          <Row label="Mint renunciado" value={yn(a.mintRenunciado)} light={lightFor('mintRenunciado', a.mintRenunciado)} />
          <Row label="Freeze renunciado" value={yn(a.freezeRenunciado)} light={lightFor('freezeRenunciado', a.freezeRenunciado)} />
          <Row label="Honeypot" value={yn(a.honeypot)} light={lightFor('honeypot', a.honeypot)} />
          <Row label="Taxa" value={pct(a.taxaPct, 0)} light={lightFor('taxaPct', a.taxaPct)} />
          <Row label="Liquidez travada" value={pct(a.liquidezTravadaPct, 0)} light={lightFor('liquidezTravadaPct', a.liquidezTravadaPct)} />
        </Box>
        <Box title="Mercado (na análise)">
          <Row label="Idade" value={mins(a.idadeMin)} light={lightFor('idadeMin', a.idadeMin)} />
          <Row label="MCAP" value={fmtUsd(a.mcapUsd)} light="unknown" />
          <Row label="Liquidez" value={`${fmtUsd(a.liquidezUsd)}${liqMcap != null ? ` · ${(liqMcap * 100).toFixed(0)}% do MCAP` : ''}`} light={lightFor('liqMcap', liqMcap)} />
          <Row label="Volume 24h" value={fmtUsd(a.volume24hUsd)} light="unknown" />
          <Row label="Holders" value={num(a.holders)} light="unknown" />
        </Box>
        <Box title="Fluxo">
          <Row label="Compras líquidas 5 min" value={signed(a.netbuy5mUsd)} light={lightFor('netbuy5mUsd', a.netbuy5mUsd)} />
          <Row label="Compras líquidas 1 h" value={signed(a.netbuy1hUsd)} light={lightFor('netbuy1hUsd', a.netbuy1hUsd)} />
          <Row label="Abaixo do topo" value={pct(a.quedaAthPct, 0)} light={lightFor('quedaAthPct', a.quedaAthPct)} />
          <Row
            label="Smart money"
            value={`${num(a.smartMoney)}${a.smartMoneyAcao ? ` · ${a.smartMoneyAcao}` : ''}`}
            light={a.smartMoneyAcao === 'comprando' ? 'green' : a.smartMoneyAcao === 'vendendo' ? 'red' : a.smartMoneyAcao === 'misto' ? 'yellow' : 'unknown'}
          />
          <Row label="KOLs" value={num(a.kol)} light="unknown" />
        </Box>
        <Box title="Agora (ao vivo no BearHunter)">
          {live?.lastObservation ? (
            <>
              <Row label="MCAP agora" value={fmtUsd(nowMcap)} light={since == null ? 'unknown' : since >= 0 ? 'green' : 'red'} />
              <Row label="Desde a análise" value={since == null ? '—' : `${since >= 0 ? '+' : ''}${since.toFixed(1)}%`} light={since == null ? 'unknown' : since >= 0 ? 'green' : 'red'} />
              <Row label="Volume 5m" value={fmtUsd(live.lastObservation.windows['5m'].volumeUsd)} light="unknown" />
            </>
          ) : (
            <p className="py-1 text-[11.5px] text-dim">Este token não está na sua Watchlist. Clique em "+ Watchlist" para comparar o MCAP de agora com o da análise.</p>
          )}
        </Box>
      </div>
      <p className="text-[10.5px] text-dim">
        Colado em {new Date(e.at).toLocaleString('pt-BR')}
        {a.analisadoEm ? ` · análise do GMGN: ${a.analisadoEm}` : ''}
        {a.rede ? ` · rede ${a.rede}` : ''}. Leitura de dados públicos, não é recomendação de investimento.
      </p>
    </div>
  );
}

export default function Analysis() {
  const list = useStore((s) => s.analyses);
  const [text, setText] = useState('');
  const [sel, setSel] = useState<string | null>(list[0]?.id ?? null);
  const current = list.find((x) => x.id === sel) ?? list[0] ?? null;

  const read = () => {
    const found = parseAnalyses(text);
    if (!found.length) return toast('Não achei nenhum bloco "### BH-ANALISE v1" com token ou CA. Confira se copiou a resposta inteira da IA.');
    const now = Date.now();
    const fresh: AnalysisEntry[] = found.map((data, i) => ({ id: `a_${now.toString(36)}_${i}`, at: now, data }));
    useStore.setState({ analyses: [...fresh, ...useStore.getState().analyses].slice(0, 200) });
    setSel(fresh[0].id);
    setText('');
    toast(found.length === 1 ? `Análise de $${found[0].token ?? '?'} lida` : `${found.length} análises lidas`);
  };
  const remove = (id: string) => useStore.setState({ analyses: useStore.getState().analyses.filter((x) => x.id !== id) });

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-4 p-3 sm:p-4">
        <div>
          <h1 className="flex items-center gap-2 text-[18px] font-bold">
            <FileSearch size={18} className="text-primary" /> Análise de risco
          </h1>
          <p className="text-[11.5px] text-muted">Transforme as respostas da IA do GMGN num painel de risco: 3 perguntas lá, 1 conversão na sua IA, 1 colagem aqui.</p>
        </div>

        <HowTo />

        <div className="space-y-2 rounded-lg border border-line bg-panel p-3">
          <textarea
            className="input num h-auto min-h-[110px] py-2 text-[11px]"
            rows={5}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={'Cole aqui a resposta da sua IA (com um ou mais blocos):\n### BH-ANALISE v1\ntoken: …\nca: …\n…\n### FIM'}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn h-9 border-primary/60 bg-primary/20 px-4 text-[12px] text-primary" disabled={!text.trim()} onClick={read}>
              <FileSearch size={13} /> Ler análise
            </button>
            <span className="text-[10.5px] text-dim">Campos que a IA deixou vazios aparecem como "—" e não contam na nota (só baixam a confiança).</span>
          </div>
        </div>

        {list.length > 0 && (
          <div className="grid gap-3 lg:grid-cols-[260px_1fr]">
            <section className="h-fit rounded-lg border border-line bg-panel lg:sticky lg:top-0">
              <div className="label border-b border-line px-3 py-2">Análises salvas ({list.length})</div>
              <div className="max-h-[50vh] divide-y divide-line overflow-y-auto lg:max-h-[70vh]">
                {list.map((x) => {
                  const r = riskScore(x.data);
                  const t = TIER_META[r.tier];
                  return (
                    <div key={x.id} className={cn('flex cursor-pointer items-center gap-2 px-3 py-2 hover:bg-card', current?.id === x.id && 'bg-primary/10')} onClick={() => setSel(x.id)}>
                      <TokenLogo src={null} symbol={x.data.token} address={x.data.ca} size={22} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[12.5px] font-semibold">${x.data.token ?? '—'}</div>
                        <div className="num text-[10px] text-dim">{new Date(x.at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>
                      </div>
                      <span className={cn('num text-[15px] font-extrabold', toneText[t.tone])}>{r.score}</span>
                      <button
                        className="btn-ghost hover:text-down"
                        title="Apagar"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          remove(x.id);
                        }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
            <section className="min-w-0 rounded-lg border border-line bg-panel p-3">{current && <Panel e={current} />}</section>
          </div>
        )}
      </div>
    </div>
  );
}
