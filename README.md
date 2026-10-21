# BearHunter Bot

Terminal de monitoramento de memecoins na Solana focado em volume. Descobre tokens da Pump.fun e destaques do DexScreener, compara snapshots e toca um alerta quando um token bate os seus presets.

**v1 pessoal:** roda inteiro no navegador, sem servidor e sem custo. Veja [docs/DOCUMENTACAO.md](docs/DOCUMENTACAO.md).

## Rodar no seu computador
```bash
npm install
npm run dev
```
Abra o endereço que aparecer (normalmente http://localhost:5173).

## Publicar de graça (Cloudflare Pages)
1. Cloudflare → Workers & Pages → Create → Pages → conectar ao GitHub → escolher este repositório.
2. Build command: `npm run build` · Output directory: `dist`.
3. Cada push na branch `main` publica de novo sozinho.

## Desenvolvimento
- `npm test` — testes do motor de alertas e dos adapters
- `npm run typecheck`, `npm run build`
- `node scripts/smoke.mjs <pasta>` — teste de ponta a ponta com Playwright (rede interceptada) e screenshots

Os sinais são métricas de mercado e não garantem segurança ou retorno.
