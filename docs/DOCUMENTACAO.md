# BearHunter Bot — Documentação (v1 pessoal)

## O que é
Terminal de monitoramento de memecoins na Solana, focado em **volume**. Descobre tokens da Pump.fun (novos e migrados) e destaques do DexScreener, tira snapshots periódicos, compara com os snapshots anteriores e **apita** quando um token bate os parâmetros de um preset (Initial, Strong, Explosive, Revival) ou de um My Alert.

Não executa compras ou vendas. Os sinais são métricas de mercado e não garantem segurança ou retorno.

## Como roda (v1)
- Tudo roda **no seu navegador**, enquanto a aba está aberta. Não há servidor, banco pago nem login.
- A coleta começa quando você abre o painel. **STOP** pausa, **START** retoma.
- Dados ficam salvos neste navegador: presets, Watchlist, pastas, favoritos, My Alerts, alertas (IndexedDB) e snapshots dos últimos 2 dias.
- Para levar para outro computador: Configurações → Dados → Exportar.
- Dica: deixe a aba numa janela própria. Navegadores desaceleram abas escondidas por muito tempo.

## Fontes de dados
| Fonte | Para quê | Custo |
|---|---|---|
| PumpPortal (`subscribeNewToken`, `subscribeMigration`) | descobrir tokens novos e migrações | grátis, sem API key |
| DexScreener (`/tokens/v1`, boosts, perfis, busca) | MCAP, volume, compras/vendas, variação 5m/1h/6h/24h, liquidez, idade do par | grátis, até 300 req/min |

- Uma única conexão WebSocket com o PumpPortal, com reconexão automática (2s → 60s).
- DexScreener em lotes de 30 tokens, limitado a 240 req/min (abaixo do limite oficial).
- Tokens ainda na **bonding curve** aparecem como `curve` (dexId `pumpfun`). O DexScreener **não informa liquidez** nesses pares — o painel mostra "curve"/"—", nunca zero.
- Se o navegador bloquear o DexScreener (CORS), publique `proxy/worker.js` no Cloudflare Workers (grátis) e cole a URL em Configurações → Fontes.

## Regra de ouro dos dados
`null` = desconhecido. Zero só quando a fonte reporta zero. Um filtro que depende de um dado ausente **rejeita com motivo** (ex.: `liquidity_unknown`) em vez de inventar.

## Universo de tokens
- **Manuais** (Add Token / busca) e **favoritos/pastas** nunca saem sozinhos.
- **Novos da Pump.fun**: saem após o tempo configurado (padrão 10 min) se o volume de 5m ficar abaixo de $1K, ou se o DexScreener não encontrar o par.
- **No Vol Remove**: tokens automáticos saem após N ciclos sem volume.
- Stablecoins/blue chips e tokens acima de $250M de MCAP saem da lista automática.
- **Max Tokens** limita o tamanho da lista; ao encher, sai o token automático com menos volume.
- **Hi Vol Threshold**: badge HOT e prioridade de coleta (não alerta sozinho).

## Presets
Cada preset tem configuração independente por timeframe (5M, 1H, 6H, 24H). Marque quais timeframes monitorar e clique no rótulo para editar.

- **Vol Rise**: (volume atual − volume do snapshot anterior) / anterior × 100. O "anterior" é o snapshot de ~1 Check Interval atrás (nem perto nem velho demais).
- **MCap Rise**: mesma conta para o market cap.
- **Min/Max Vol, Min/Max MCap, Min/Max Change, Min/Max Txns, Min/Max Liquidity, Pair Age**: faixas. Vazio = sem filtro.
- **Direção**: Buy exige preço subindo e (quando há dado) mais compras que vendas. Sell o contrário. Volume alto com preço caindo **nunca** vira Buy.
- **Check Interval**: de quanto em quanto tempo o preset avalia cada token. O menor intervalo entre os presets ativos define o ritmo da coleta (mínimo 10s).
- **Alert Cooldown**: um mesmo token + par + preset + timeframe + direção não alerta de novo antes desse tempo.

### Revival
Token "morto" que acorda. Usa só os parâmetros próprios:
- **Dead Baseline Ceiling**: volume de 5m máximo para considerar morto.
- **Spike Multiplier**: quantas vezes o volume atual precisa estar acima do baseline.
- **Real Volume Floor**: volume mínimo do pico.
- **Liquidity Ceiling**, **Min Pair Age**, **Janela mínima morta**, **Janela de análise**.
- Baseline = mediana do volume 5m que o bot observou (`src:snapshots`). Sem histórico suficiente, é estimado pelas janelas 1H/6H/24H do DexScreener (`src:windows_estimate`, `conf:low`).

## Indicadores personalizados
Além dos 4 presets, você pode criar até **3 indicadores** com nome e cor próprios (botão **+ Indicador** na barra de presets). O primeiro, **Indicadores DRK**, já vem com os parâmetros do painel de referência:

| Campo | Padrão DRK |
|---|---|
| Vol Rise 5M / MCap Rise 5M | 50% / 50% |
| Min Vol 5M / Min MCap / Max MCap | $500 / $10K / sem limite |
| Check Interval / No Vol Remove | 30s / 10 ciclos |
| Som Normal / Critical / Mega | acima do Vol Rise / +100% / +200% |
| High vol new coin | alerta único quando token novo (até 24h) passa de $300K de volume |
| PumpFun live | token da Pump.fun visto até $20K que passa de $100K |
| MCAP mínimo para continuar monitorado | vazio (sem limite) |

Os alertas do indicador aparecem no painel Alerts com o nome e a cor dele, e têm filtro próprio.

## Operadores
Aba separada para acompanhar um operador específico (quem lança tokens com o mesmo padrão). Nada aqui entra nos alertas de volume.

**Carteiras** — cole endereços ou links do GMGN/Solscan e escolha o papel:
- **Marcador**: compra logo no lançamento (ex.: 8c3ss compra ~0,05 SOL a ~$33K). Uma compra dela gera **ENTRADA**.
- **Auxiliar**: opera junto em fases. Compra também gera **ENTRADA**.
- **Fazenda**: acumula e despeja junto. Compras viram **FAZENDA** (1, 3, 5, 10 carteiras dentro); vendas de várias ao mesmo tempo viram **DESPEJO**.

**Sinais**
- **ENTRADA**, **FAZENDA**, **DESPEJO** (padrão: 3 carteiras da lista vendendo em até 10s), **TRANSFERÊNCIA** (carteira da lista enviando/recebendo ≥ 1% do supply — com botão para rastrear quem recebeu).
- **Candidatos** (sem carteira envolvida, aparecem sem som por padrão): **MIGRAÇÃO RÁPIDA** (criado e migrado em até 6 min), **BUNDLE** (poucas compras grandes nos primeiros 3 min), **BOTS OFF/ON** (transações em 5m caem para 30% do pico ou voltam).

**Descobrir fazenda** — cole links de vários tokens do operador e clique em Analisar. O bot busca os ~20 maiores holders de cada um pela RPC, ignora pools e bonding curve e mostra as carteiras que aparecem em mais de um token, para adicionar como Fazenda de uma vez.

**Como funciona por dentro** — RPC pública da Solana (grátis): uma conexão WebSocket com uma assinatura por carteira (tempo real) e uma varredura de segurança a cada 90s. Até 150 carteiras. Se a RPC pública ficar lenta, cole em Ajustes a URL de um plano grátis da Helius ou QuickNode.

## Aba em segundo plano
O relógio do bot roda num Web Worker, então a coleta, os alertas e os sons continuam com a aba escondida. Se o som não tocar, clique uma vez na página depois de abrir (o navegador exige um clique para liberar áudio).

## Confirmar ou descartar tokens do operador
Em cada sinal e token da aba Operadores há **É ele** (vai para "Confirmados do operador") e **Não é ele** (oculta tudo daquele token e ignora sinais futuros; dá para desfazer em "Descartados"). Em **Confirmados** você também cola CAs manualmente, escreve notas e clica em **Gerar relatório**, um texto pronto para colar no chat com criação, tempo até migrar, MCAP, volume, perfil pago, pico observado, sinais e carteiras da lista.

## PumpPortal pago (opcional)
Cole sua API key em Operadores → Ajustes. Com ela, as compras e vendas das carteiras chegam direto do PumpPortal em tempo real (0,01 SOL a cada 10 mil eventos). A key fica só no seu navegador.

## Login e Admin
Com o Supabase configurado, quem se cadastra fica **pendente** até o admin aprovar em **Admin**. O admin também libera a aba **Operadores** por usuário. Presets, Watchlist, pastas, My Alerts e carteiras de operador ficam salvos na conta.

## Presets padrão (v2)
Initial = números do DRK (vol +50%, MCAP +50%, vol ≥ $500, MCAP ≥ $10K). Strong: vol +50%, MCAP +40%, vol ≥ $5K, MCAP ≥ $25K, ≥ 80 txns em 5m. Explosive: vol +100%, MCAP +75%, vol ≥ $20K, MCAP ≥ $40K, ≥ 200 txns, preço +10%, cooldown 180s. Revival: multiplicador 10x, piso $1,5K e **cemitério** (tokens que saíram por falta de volume são reconferidos devagar).

## My Alerts
Alertas manuais por token (MCAP, Volume 5M, Variação 5M, Liquidez; maior/menor que). Roxo, badge CUSTOM, som próprio. Disparam uma vez; use "rearmar" para armar de novo.

## Sons
Sons embutidos para cada preset e upload dos seus (mp3/wav/ogg/m4a) em Configurações → Sons. O som só toca depois que o alerta final é criado, com 2s de intervalo mínimo por preset. O navegador só libera áudio depois do primeiro clique na página.

## Painéis
1. **Watchlist / My Alerts** — busca, timeframe, ordenação (VOL/MCAP/LIQ/PEAK), Boosted, pastas, favoritos. A ordem reordena no ritmo do "Auto"; os números atualizam ao vivo.
2. **Alerts** — filtros por preset, busca, ações (gráfico, DexScreener, GMGN, X, copiar CA).
3. **Gráfico / Histórico** — gráfico do DexScreener; o Histórico mostra os snapshots observados, os alertas do token e **por que ele alertou ou não** no último ciclo (útil para calibrar presets).

"PEAK" é o maior MCAP que o bot viu, não o ATH absoluto.

## Versão 2 (planejado)
Ganhadores, Snipe Desk, Telegram, contas de usuário, coleta sempre ligada num servidor (inclusive o rastreio de operadores).
