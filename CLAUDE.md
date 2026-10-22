# BearHunter Bot — contexto do projeto

Terminal de monitoramento de memecoins na Solana focado em **volume**: descobre tokens (Pump.fun novos/migrados + destaques do DexScreener), tira snapshots, compara e **apita** quando um token bate os presets do usuário. Não executa trades. Dono do projeto: Yan (fala português; respostas e textos de UI em PT-BR).

## Estado atual: v1 (custo zero)
- Coleta 100% no navegador. Login opcional via Supabase (`VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`): sem essas variáveis roda em modo local sem login. Com elas: cadastro → `pending` → admin aprova em `/admin`; Operadores só para quem o admin liberar (`operators_enabled`). Configurações do usuário sincronizam na tabela `user_state` (`src/services/cloudSync.ts`); a API key do PumpPortal nunca vai para a nuvem. SQL em `supabase/migrations/001_init.sql`. A trava de sessão do Supabase usa `safeLock` (`src/services/supabase.ts`): espera no máx. 5s e rouba a trava de abas antigas congeladas; `init()` e o sync da nuvem têm tempo máximo — a tela nunca pode ficar presa em "Carregando…". Admin = yangildomourafranca@gmail.com. A coleta roda enquanto a aba está aberta (START/STOP).
- Persistência local: zustand `persist` (localStorage) para presets/prefs/pastas/favoritos/My Alerts/tokens manuais; IndexedDB (`src/storage/db.ts`) para alertas, snapshots (48h) e sons enviados.
- Deploy previsto: Cloudflare Pages (estático, grátis). `public/_redirects` faz o fallback de SPA.
- Se o DexScreener bloquear CORS no navegador: `proxy/worker.js` (Cloudflare Workers grátis) e URL em Configurações → Fontes.

## Fontes autorizadas pelo usuário
- **DexScreener** (API pública): `/tokens/v1/solana/{até 30}`, `/token-boosts/{top,latest}/v1`, `/token-profiles/latest/v1`, `/latest/dex/search`. Limite oficial 300/min (usamos 240) e 60/min nas listas (usamos 40).
- **PumpPortal**: SOMENTE os canais grátis `subscribeNewToken` e `subscribeMigration`, uma única conexão WS. `subscribeAccountTrade` (pago, 0,01 SOL/10k msgs) é usado SÓ quando o usuário cola a própria API key em Operadores → Ajustes (`prefs.pumpPortalKey`, local). `subscribeTokenTrade` não é usado.
- **RPC pública da Solana** (`api.mainnet-beta.solana.com`, HTTP + WS), autorizada para o módulo Operadores: `logsSubscribe` (mentions), `getSignaturesForAddress`, `getTransaction`, `getTokenSupply`, `getTokenLargestAccounts`, `getMultipleAccounts`. Limitador em 30 req/10s. URL configurável (o usuário pode colar Helius/QuickNode grátis).
- Não integrar outras APIs (Solscan API, Helius pago, Birdeye, GeckoTerminal, Meteora etc.) sem autorização explícita.

## Arquitetura (fonte desacoplada da UI)
```
Fonte externa → src/adapters/<fonte>/ (transporte + normalização + capabilities)
  → src/domain/types.ts (modelo interno: MarketObservation, TrackedToken, Alert…)
  → src/collector/collector.ts (universo de tokens, agendamento em lotes, snapshots, poda)
  → src/domain/engine.ts (motor de alertas PURO: evaluateTimeframe, evaluateRevival)
  → src/state/store.ts (zustand) → src/ui/** e src/pages/**
```
- Componentes de UI **nunca** importam de `src/adapters/`. Trocar/adicionar fonte = novo adapter que implementa `MarketAdapter`/`DiscoveryAdapter` (`src/adapters/types.ts`).
- O motor é puro e testado (`src/domain/engine.test.ts`). Mudanças nas regras de alerta começam por lá.

## Módulos
- **Presets nativos** (Initial/Strong/Explosive/Revival) + **Indicadores personalizados** (`IndicatorConfig`, até 3, nome/cor editáveis; o padrão "Indicadores DRK" replica o painel de referência do usuário: vol +50%, MCAP +50%, min vol $500, min MCAP $10K, sons normal/critical +100%/mega +200%, high vol new coin $300K, PumpFun live $20K→$100K, MCAP mínimo para ficar). Alertas de indicador usam `preset: 'ind:<id>'` e guardam `presetName/presetColor/level`.
- **Operadores** (`src/operators/`, página `/operadores`): rastreia carteiras do operador por papel (marcador, auxiliar, fazenda) via RPC pública; sinais ENTRADA, FAZENDA, DESPEJO (N carteiras vendendo em W s; caminho rápido pelos logs), TRANSFERÊNCIA (% do supply), e candidatos MIGRAÇÃO RÁPIDA (PumpPortal), BUNDLE (DexScreener) e BOTS ON/OFF. Descoberta de fazenda cruzando os maiores holders de vários tokens. Separado dos alertas de volume: tem som, aviso flutuante e contador próprios. O usuário opera manualmente — o bot só informa, nunca executa.
- Coletor e Operadores usam `src/services/clock.ts` (relógio em Web Worker) para não serem desacelerados com a aba em segundo plano.

## Regras que não podem quebrar
- `null` = desconhecido; zero só se a fonte reportar zero. Use `num()` de `src/domain/num.ts`. Nunca `|| 0` em dado de mercado.
- Filtro que depende de dado ausente rejeita com motivo (`liquidity_unknown` etc.).
- Bonding curve (`dexId: pumpfun`) não tem liquidez no DexScreener → fica null.
- Buy exige preço subindo (e buys > sells quando há dado). Volume alto com preço caindo nunca é Buy.
- Dedupe/cooldown por `token|pair|preset|timeframe|direction`.
- Som só depois do alerta final inserido; 2s de intervalo por preset. Test Alert tem badge TEST.
- Sem `window.location.reload()`; refresh é local (Refresh Watchlist / Auto reordena sem desmontar nada).
- Sem dados mock no app. Dados de exemplo só no teste de fumaça (`scripts/smoke.mjs`, intercepta a rede).
- Tokens manuais, favoritos, em pastas ou com My Alert armado nunca são podados automaticamente.
- Sem scroll horizontal no mobile (testar 320–430px).

## Comandos
- `npm run dev` — desenvolvimento
- `npm test` — testes do motor e dos adapters (vitest)
- `npm run typecheck` / `npm run build`
- `npm run build && node scripts/smoke.mjs <pasta>` — teste de ponta a ponta com Playwright (rede interceptada) + screenshots

## Interface (referência: prints do BearHunter antigo)
Header (nav + status + fontes + LIVE + sino + som + STATUS) · barra de presets (Initial azul, Strong verde, Explosive vermelho, Revival laranja; My Alerts roxo) · barra de controles · 3 painéis redimensionáveis (Watchlist/My Alerts | Alerts | Gráfico/Histórico) · mobile em abas. Modal de presets por preset × timeframe; Revival com parâmetros próprios.

## Fora da v1 (versão 2)
Ganhadores, Snipe Desk, Telegram (+ venda/assinatura via Telegram Stars), contas multiusuário com aprovação, coleta sempre ligada em servidor (worker + Supabase). A arquitetura de adapters/motor puro foi feita para o motor poder migrar para o servidor sem mudar a UI.

## Documentos de referência
- `docs/DOCUMENTACAO.md` — documentação do usuário (também exibida em Configurações → Documentação).
- As especificações antigas (BearHunter Clean / Wallet Radar) são contexto histórico; não copiar integrações nem migrations delas.
