# Mesa de Simulação — especificação (v1)

Baseada no artigo "How to Build a 24/7 AI Trading Desk With Grok Bot + Jev" (@0xKiyoro), adaptada ao BearHunter.
**Dinheiro fictício. Nunca executa ordem real. Só para o admin.**

## 1. Regras de fundo
- **Independente:** aba própria (`/mesa`), motor próprio (`src/desk/`), configuração própria. Não mexe em presets, alertas, sons nem Operadores.
- **Única entrada:** os pares que o coletor já acompanha (PumpPortal novos/migrados + DexScreener). Nenhuma fonte nova.
- **Só o admin vê:** a aba e a rota só existem para `profile.is_admin`. Outros usuários não veem nem acessam.
- **Roda com a aba aberta**, como o coletor. Ao reabrir, a posição aberta é retomada pelo preço atual.
- **Código calcula, o Juiz julga, código "executa" no papel.** O Juiz v1 são regras fixas (sem IA paga); há um encaixe pronto para trocar pelo Jev depois, se você autorizar.

## 2. O ciclo (a cada nova observação de um par)
```
ESTADO (código) → FUNIL (5 etapas) → JUIZ (perguntas) → POLÍTICA (limiares) → RISCO (veto) → EXECUÇÃO NO PAPEL → SAÍDAS
```
- **Prazo:** se o dado do par tem mais de 45 s, nada entra ("nunca operar com dado velho").
- **Uma posição por vez:** com posição aberta, o funil não procura outro par (como no artigo).
- **Posição aberta tem prioridade:** o par em posição é consultado a cada ~5 s (o resto segue o ritmo normal de 10–30 s).

## 3. Estado (código, por par)
Preço, MC, liquidez, idade, volume/compras/vendas/variação em 5m e 1h, liquidez ÷ MC, aceleração do volume 5m vs leitura anterior, % de compras no 5m, tamanho médio por trade, curva (pumpfun) ou AMM, quais presets/indicadores bateram.
`null` continua `null` (desconhecido) e o Juiz vê isso — desconhecido nunca vira zero.

## 4. Funil — "fatos matam antes do julgamento"
| Etapa | Mata | Padrão (ajustável) |
|---|---|---|
| 1. Corte grátis | idade, MC, liquidez, volume fora da faixa | idade 2–360 min · MC $15K–$2M · vol 5m ≥ $5K · liquidez ≥ $10K (AMM) |
| 2. Corte de trades | poucos trades, só compras sem vendas | txns 5m ≥ 40 · vendas 5m > 0 · compras/vendas ≤ 6 |
| 3. Fatos | marcado SCAM, descartado no Operadores, liquidez < 5% do MC, mint/freeze não renunciados (se a RPC responder) | liga/desliga cada fato |
| 4. Juiz | multidão falsa, risco de saída | ver §5 |
| 5. Escolha | qual um entre os sobreviventes do ciclo — e se vale a pena | 1 ou nenhum |

**Castigo por motivo** (não reavalia à toa): honeypot/mint aberto 24 h · liquidez baixa 15 min · jovem demais 5 min · sem vendas 5 min · perdeu na escolha 2 min · saiu no stop 60 min.
**"Nenhum trade é um resultado":** toda rejeição é registrada com a etapa e o motivo.

## 5. Juiz (bateria de perguntas, respostas tipadas)
| Tipo | Pergunta | Resposta |
|---|---|---|
| Escolha | Regime? | tendência / lateral / caótico / outro |
| Sim/Não (0–1) | Pressão compradora crescendo? | probabilidade |
| Nota (0–3) | Bate com o meu setup (presets que dispararam)? | 0–3 |
| Sim/Não (0–1) | Parece multidão falsa / volume de robô? | probabilidade |
| Sim/Não (0–1) | Risco de ficar sem saída (liquidez)? | probabilidade |
| Sim/Não (0–1) | Vale a pena entrar? | probabilidade |
Cada pergunta é uma regra separada; a combinação é feita na Política com pesos editáveis. Versão das regras registrada em cada decisão.

## 6. Política (limiares — editáveis na tela)
Entra se: regime = tendência · setup ≥ 2 · pressão ≥ 0,60 · multidão falsa ≤ 0,40 · risco de saída ≤ 0,40 · vale a pena ≥ 0,60.
Campo desconhecido → tamanho reduzido (50%), não pula automaticamente.

## 7. Motor de risco (fixo, ninguém vota)
- Banca inicial **$50** · tamanho **8% da banca** por entrada · teto por entrada (ex.: $10).
- **1 posição por vez.**
- **Perda diária −15%** → mesa travada até 00:00.
- **4 stops seguidos** → pausa de 30 min.
- **Economia:** se o ganho mínimo esperado não paga 2× os custos da ida e volta, não entra.
- **Dado velho (> 45 s)** → segura.
Cada veto aparece no registro de risco.

## 8. Execução no papel (honesta)
- Entra no preço da **próxima** leitura depois do sinal (simula a demora real), não no preço do sinal.
- **Custos por lado:** taxa da plataforma 1% · taxa de prioridade ~$0,15 · slippage: curva 3%; AMM ≈ 2 × (tamanho ÷ liquidez), mínimo 0,5%.
- Tudo configurável. O placar mostra **quanto foi pago de taxa**.

## 9. Saídas (por número, sem esperar)
- **Stop −6%** · **trailing 12% do topo** (liga após +10%) · **volume morreu:** vol 5m < 25% do pico desde a entrada por 2 leituras · **tempo máximo** 45 min · **dados pararam** 90 s → sai no último preço com slippage extra.
- O stop executa no preço observado: se o preço pular de +3% para −15% entre leituras, o registro mostra −15% (é o que aconteceria de verdade).

## 10. Modos
- **Shadow (sempre ligado):** registra "eu entraria aqui" para todo par que passa no funil e mede o resultado em 5, 15 e 60 min, sem mexer na banca. Serve para a calibração.
- **Paper:** executa na banca fictícia com as regras acima.
- Botões: **Iniciar / Pausar / Zerar banca** (zerar pede confirmação).

## 11. Registros e armazenamento
- **Trades e resumo diário:** salvos na conta (nuvem), últimos 500.
- **Decisões e shadow:** IndexedDB do navegador, 7 dias (volume alto demais para a nuvem).
- **Exportar CSV** de trades e decisões.

## 12. Placar e indicadores
Patrimônio · P&L hoje / total (após taxas) · nº de operações · % de acerto · ganho médio × perda média · fator de lucro · maior queda (drawdown) · taxas pagas · melhor e pior trade · tempo médio em posição.
**Funil:** quantos pares entraram em cada etapa e quanto cada uma matou.
**Calibração:** respostas "vale a pena" agrupadas por faixa (0,5–0,6, 0,6–0,7…) × quanto realmente subiu em 15 min; Brier score.

## 13. Interface (aba "Mesa", só admin)
```
┌ STATUS: ● Rodando · Paper · regras v1 ───────── [Pausar] [Zerar banca] [⚙ Regras] ┐
├ Banca $53,40 │ P&L hoje +$3,40 (+6,8%) │ Ops 12 │ Acerto 58% │ Taxas −$1,92 │ Queda máx −9% ┤
├──────────────────────────────────────────┬────────────────────────────────────────┤
│ CURVA DO PATRIMÔNIO                      │ POSIÇÃO ABERTA  $PIG  há 3 min           │
│ (linha + bolinhas verde/vermelha por     │ gráfico do preço desde a entrada com     │
│  trade; 1H 4H 1D TUDO)                   │ linhas: entrada · stop · trailing · topo │
│                                          │ +14,2% · $4,57 · saída se cair a $…      │
├───────────────────┬──────────────────────┴─────────────┬──────────────────────────┤
│ FUNIL (agora)     │ DECISÕES AO VIVO                     │ RISCO                    │
│ 1 Grátis   412→58 │ 15:02 $MOON  ✗ etapa 2: sem vendas   │ perda do dia −4% / −15%  │
│ 2 Trades    58→21 │ 15:02 $DUCK  ✓ entrou (vale 0,71)    │ stops seguidos 1 / 4     │
│ 3 Fatos     21→9  │ 15:01 $CAT   ✗ juiz: multidão 0,62   │ vetos hoje: 3            │
│ 4 Juiz       9→2  │ …                                    │                          │
│ 5 Escolha    2→1  │                                      │                          │
├───────────────────┴──────────────────────────────────────┴──────────────────────────┤
│ HISTÓRICO DE TRADES (par · entrada · saída · motivo · resultado após taxas · tempo) │
├─────────────────────────────────────────────────────────────────────────────────────┤
│ CALIBRAÇÃO (gráfico) · ESCADA DE CONFIANÇA: ✓ Paper ▸ Shadow ▸ (Micro: manual)       │
└─────────────────────────────────────────────────────────────────────────────────────┘
```
Regras em painel lateral, agrupadas: Funil · Juiz · Política · Risco · Saídas · Custos. Mobile: abas (Visão geral · Posição · Funil · Trades · Regras).

## 14. Escada de confiança (exibida na tela)
Paper e Shadow acontecem aqui. Teste de saída para pensar em dinheiro de verdade: **≥ 200 decisões shadow, ≥ 50 trades paper, lucro após taxas, zero quebra de regra e calibração coerente.** Micro e escala ficam fora do bot (você executa no GMGN/Axiom).
Regra do artigo: **nunca mudar as regras e o tamanho na mesma semana.**

## 15. Construção (fases)
1. **Motor puro + testes:** estado, funil, juiz, política, risco, corretora de papel, saídas, métricas (`src/desk/*`).
2. **Execução contínua:** ligar ao coletor, consulta rápida da posição aberta, castigos, registros (IndexedDB + nuvem).
3. **Interface:** aba Mesa com os painéis acima, só admin.
4. **Calibração e relatórios:** gráfico de calibração, CSV, resumo diário.
5. **Teste de fumaça + deploy.**

## 16. Fora da v1
Jev (encaixe pronto, só com sua autorização e chave), execução real, robô "House" (grid/market making não serve para memecoin), robô "Spy" copiando o operador (fase 2, usando o módulo Operadores).

## 17. Limites honestos
- Preço a cada ~5 s na posição e 10–30 s no resto — não 300 ms. O stop pode sair pior que −6%.
- DexScreener não informa holders nem carteiras únicas; "multidão falsa" é estimada pelo padrão de trades.
- Simulação não sofre MEV/sandwich nem falha de transação; resultado real tende a ser pior.
- Na bonding curve não há liquidez informada: o slippage usa a taxa fixa da curva.
