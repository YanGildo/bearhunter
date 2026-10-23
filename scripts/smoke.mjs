// Teste de fumaça de ponta a ponta (só para desenvolvimento).
// Sobe o build, intercepta DexScreener e PumpPortal com respostas no formato real
// e verifica que o pipeline coleta → motor → alerta → UI funciona. Tira screenshots.
// Uso: npm run build && node scripts/smoke.mjs <pasta-de-saida>
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const OUT = process.argv[2] ?? 'smoke-out';
mkdirSync(OUT, { recursive: true });
const PORT = 4179;
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));

const now = Date.now();
const H = 3600_000;
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const addr = (seed) => Array.from({ length: 40 }, (_, i) => B58[(seed * 31 + i * 7 + i * i) % 58]).join('') + 'pump';

const TOKENS = [
  { sym: 'MOON', name: 'Moon Cat', grow: 1.9, mcap: 60_000, vol: 18_000, age: 3 * H, dex: 'pumpswap', liq: 25_000 },
  { sym: 'KIMCHI', name: 'Aura Final Boss', grow: 1.0, mcap: 42_300_000, vol: 173_700, age: 3 * H, dex: 'pumpswap', liq: 650_200 },
  { sym: 'BUYOUT', name: 'buyoutSH', grow: 1.0, mcap: 37_000, vol: 48_500, age: 6 * 60_000, dex: 'pumpfun', liq: null, change: -11.8 },
  { sym: 'WNV', name: 'Wen New Volume', revival: true, mcap: 16_200, age: 30 * 24 * H, dex: 'pumpswap', liq: 9_000 },
  { sym: 'COPE', name: 'cope', grow: 1.6, mcap: 120_000, vol: 21_000, age: 26 * H, dex: 'pumpswap', liq: 40_000 },
].map((t, i) => ({ ...t, address: addr(i + 3), calls: 0 }));
const byAddr = new Map(TOKENS.map((t) => [t.address, t]));

function pair(t) {
  t.calls++;
  const g = t.grow ? Math.pow(t.grow, Math.min(t.calls - 1, 4)) : 1;
  const vol5 = t.revival ? 3200 : Math.round(t.vol * g);
  const mcap = Math.round(t.mcap * (t.grow ? Math.pow(1 + (t.grow - 1) * 0.9, Math.min(t.calls - 1, 4)) : 1));
  const change = t.change ?? (t.grow > 1 ? 18 + t.calls * 6 : 4.7);
  const p = {
    chainId: 'solana',
    dexId: t.dex,
    url: `https://dexscreener.com/solana/${t.address}`,
    pairAddress: 'P' + t.address.slice(1, 40),
    baseToken: { address: t.address, name: t.name, symbol: t.sym },
    quoteToken: { address: 'So11111111111111111111111111111111111111112', name: 'Wrapped SOL', symbol: 'SOL' },
    priceNative: '0.000004',
    priceUsd: '0.0004',
    txns: { m5: { buys: change > 0 ? 650 : 120, sells: change > 0 ? 505 : 410 }, h1: { buys: 2000, sells: 1500 }, h6: { buys: 5000, sells: 4000 }, h24: { buys: 9000, sells: 8000 } },
    volume: t.revival ? { m5: vol5, h1: 3500, h6: 3900, h24: 8000 } : { m5: vol5, h1: vol5 * 5, h6: vol5 * 12, h24: vol5 * 30 },
    priceChange: { m5: change, h1: change * 2, h6: 10, h24: 30 },
    fdv: mcap,
    marketCap: mcap,
    pairCreatedAt: now - t.age,
    info: { imageUrl: undefined },
  };
  if (t.liq != null) p.liquidity = { usd: t.liq, base: 1, quote: 1 };
  return p;
}

// ---- RPC da Solana simulada (módulo Operadores) ----
const MARKER = '8c3ssYCwFCyLv5yf11UF9FPznkS6i4VrNtRSNtmjifEe';
const FARM = ['9f4E' + 'x'.repeat(36) + '8dN3', '6L5A' + 'y'.repeat(36) + 'wUbZ'];
const OP_MINT = TOKENS[0].address; // MOON
function rpcTx(sig) {
  const bal = (owner, ui, idx) => ({ accountIndex: idx, mint: OP_MINT, owner, uiTokenAmount: { amount: String(Math.round(ui * 1e6)), decimals: 6 } });
  return {
    blockTime: Math.floor(Date.now() / 1000),
    meta: { err: null, fee: 5000, preBalances: [1e9, 0], postBalances: [0.948e9, 0], preTokenBalances: [bal(MARKER, 0, 2)], postTokenBalances: [bal(MARKER, 1_500_000, 2)], logMessages: ['Program log: Instruction: Buy'] },
    transaction: { signatures: [sig], message: { accountKeys: [{ pubkey: MARKER }, { pubkey: '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P' }] } },
  };
}
async function rpcRoute(route) {
  const body = JSON.parse(route.request().postData() || '{}');
  const ok = (result) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ jsonrpc: '2.0', id: body.id, result }) });
  if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST' } });
  switch (body.method) {
    case 'getSignaturesForAddress': return ok([]);
    case 'getTransaction': return ok(rpcTx(body.params[0]));
    case 'getTokenSupply': return ok({ value: { uiAmount: 1e9 } });
    case 'getTokenLargestAccounts': return ok({ value: [{ address: 'TA1' + 'a'.repeat(40), uiAmount: 20e6 }, { address: 'TA2' + 'b'.repeat(40), uiAmount: 18e6 }, { address: 'TA3' + 'c'.repeat(40), uiAmount: 300e6 }] });
    case 'getMultipleAccounts': {
      const keys = body.params[0];
      if (body.params[1]?.encoding === 'jsonParsed') return ok({ value: keys.map((k, i) => ({ data: { parsed: { info: { owner: i === 2 ? 'POOLpda' + 'p'.repeat(37) : FARM[i] } } } })) });
      return ok({ value: keys.map((k) => (k.startsWith('POOL') ? { owner: 'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA' } : { owner: '11111111111111111111111111111111' })) });
    }
    default: return ok(null);
  }
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }).catch(() => chromium.launch());
const errors = [];
async function setup(page) {
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
  await page.route('https://fonts.gstatic.com/**', (r) => r.abort());
  await page.route('https://dexscreener.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<html><body style="background:#0b0b10;color:#666;font:14px sans-serif;display:grid;place-items:center;height:100vh">DexScreener embed (bloqueado no teste)</body></html>' }));
  await page.route('https://api.dexscreener.com/**', async (r) => {
    const u = new URL(r.request().url());
    const json = (b) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(b) });
    if (u.pathname.startsWith('/tokens/v1/solana/')) {
      const list = u.pathname.split('/').pop().split(',');
      return json(list.map((a) => byAddr.get(a)).filter(Boolean).map(pair));
    }
    if (u.pathname.startsWith('/token-boosts/')) return json(TOKENS.slice(0, 3).map((t, i) => ({ chainId: 'solana', tokenAddress: t.address, totalAmount: i === 2 ? 500 : 0 })));
    if (u.pathname.startsWith('/token-profiles/')) return json(TOKENS.slice(3).map((t) => ({ chainId: 'solana', tokenAddress: t.address })));
    if (u.pathname.startsWith('/latest/dex/search')) return json({ pairs: TOKENS.slice(0, 2).map(pair) });
    return json([]);
  });
  await page.route('https://api.mainnet-beta.solana.com/**', rpcRoute);
  await page.route('https://api.mainnet-beta.solana.com', rpcRoute);
  await page.routeWebSocket(/api\.mainnet-beta\.solana\.com/, (ws) => {
    let n = 100;
    ws.onMessage((raw) => {
      const m = JSON.parse(String(raw));
      if (m.method === 'logsSubscribe') {
        const sub = n++;
        ws.send(JSON.stringify({ jsonrpc: '2.0', id: m.id, result: sub }));
        if (m.params[0].mentions[0] === MARKER) setTimeout(() => ws.send(JSON.stringify({ jsonrpc: '2.0', method: 'logsNotification', params: { subscription: sub, result: { value: { signature: 'SIGBUY1', err: null, logs: ['Program log: Instruction: Buy'] } } } })), 6000);
      }
    });
  });
  await page.addInitScript(([marker]) => {
    if (!localStorage.getItem('bearhunter:v1')) {
      localStorage.setItem('bearhunter:v1', JSON.stringify({ state: { operator: { wallets: [{ address: marker, label: '8c3ss', role: 'marcador', active: true, addedAt: Date.now(), lastActivityAt: null, lastSignature: 'x' }], signals: [], tokens: {}, unread: 0 } }, version: 0 }));
    }
  }, [MARKER]);
  await page.routeWebSocket('wss://pumpportal.fun/api/data', (ws) => {
    ws.onMessage(() => ws.send(JSON.stringify({ message: 'Successfully subscribed' })));
    setTimeout(() => ws.send(JSON.stringify({ txType: 'create', mint: TOKENS[4].address, name: 'cope', symbol: 'COPE', signature: 'sig1', pool: 'pump' })), 1500);
    setTimeout(() => ws.send(JSON.stringify({ txType: 'create', mint: addr(99), name: 'Bonk thing', symbol: 'BNK', signature: 'sig2', pool: 'bonk' })), 1700);
  });
}

const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
const page = await ctx.newPage();
await setup(page);
await page.goto(`http://localhost:${PORT}/dashboard`);
await page.waitForTimeout(4000);
await page.screenshot({ path: `${OUT}/01-desktop-start.png` });
// espera ciclos suficientes para comparar snapshots (check interval padrão 30s)
await page.waitForTimeout(68_000);
const alertsText = await page.locator('text=/Alerts \\(\\d+\\)/').first().textContent();
await page.screenshot({ path: `${OUT}/02-desktop-alerts.png` });
// clique no fundo do card de alerta (texto do resumo, não um botão) deve abrir o gráfico
await page.locator('text=/ALERTA INICIAL — MOON/').first().click();
await page.waitForTimeout(800);
const chartSrc = await page.locator('iframe[title="DexScreener chart"]').first().getAttribute('src').catch(() => null);
const chartOk = !!chartSrc && chartSrc.includes('chartType=marketCap') && chartSrc.includes('interval=1');
// marca de scam pelo card de alerta
await page.getByRole('button', { name: /^Scam$/ }).first().click();
await page.waitForTimeout(500);
const scamBadges = await page.locator('text=SCAM').count();
await page.screenshot({ path: `${OUT}/02b-alert-click-scam.png` });
await page.locator('text=KIMCHI').first().click();
await page.waitForTimeout(800);
await page.getByRole('button', { name: /Histórico/ }).first().click();
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/03-desktop-historico.png` });
await page.getByRole('button', { name: 'Configurar Strong' }).click();
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/04-preset-modal.png` });
await page.getByRole('button', { name: /^Revival$/ }).last().click();
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/05-preset-revival.png` });
await page.getByRole('button', { name: /Indicadores DRK/ }).last().click();
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/05b-preset-drk.png`, fullPage: false });
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
const drkAlerts = await page.locator('text=/ALERTA INDICADORES DRK/').count();
await page.goto(`http://localhost:${PORT}/operadores`);
await page.waitForTimeout(9000);
const entrada = await page.locator('text=ENTRADA').count();
await page.getByRole('button', { name: /Pelos holders dos tokens/ }).click();
await page.locator('textarea').nth(1).fill(`https://gmgn.ai/sol/token/${TOKENS[0].address}\nhttps://gmgn.ai/sol/token/${TOKENS[1].address}`);
await page.getByRole('button', { name: /Analisar holders/ }).click();
await page.waitForTimeout(3000);
const farmFound = await page.locator('text=/em 2 par/').count();
await page.getByRole('button', { name: /^É ele$/ }).first().click();
await page.waitForTimeout(400);
await page.getByRole('button', { name: /^É ele\s*1$/ }).click();
await page.waitForTimeout(300);
const yesTab = await page.locator('text=/é ele|confirmado/i').count();
await page.screenshot({ path: `${OUT}/08b-operadores-e-ele.png` });
await page.getByRole('button', { name: /Gerar relatório/ }).click();
await page.waitForTimeout(2500);
const reportOk = (await page.locator('textarea[readonly]').inputValue().catch(() => '')).includes('Relatório do operador');
await page.screenshot({ path: `${OUT}/08-operadores.png`, fullPage: true });

const m = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const mp = await m.newPage();
await setup(mp);
await mp.goto(`http://localhost:${PORT}/dashboard`);
await mp.waitForTimeout(5000);
await mp.screenshot({ path: `${OUT}/06-mobile.png` });
const overflow = await mp.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
await mp.goto(`http://localhost:${PORT}/settings?tab=fontes`);
await mp.waitForTimeout(1500);
await mp.screenshot({ path: `${OUT}/07-mobile-settings.png` });
await mp.goto(`http://localhost:${PORT}/ganhos`);
await mp.waitForTimeout(800);
await mp.locator('input[placeholder="Par (ex.: PIG)"]').fill('PIG');
await mp.locator('input[placeholder^="Entrada"]').fill('0,5');
await mp.locator('input[placeholder^="Saída"]').fill('1.25');
await mp.getByRole('button', { name: 'Registrar' }).click();
await mp.waitForTimeout(400);
const journalOk = (await mp.locator('text=/\\+0,75 SOL/').count()) > 0;
await mp.screenshot({ path: `${OUT}/09-mobile-ganhos.png`, fullPage: true });
const overflowGanhos = await mp.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);

const sizes = [
  [1024, 768],
  [820, 1180],
  [1280, 720],
];
const overflowAt = {};
for (const [w, h] of sizes) {
  const c = await browser.newContext({ viewport: { width: w, height: h } });
  const pg = await c.newPage();
  await setup(pg);
  for (const route of ['dashboard', 'operadores', 'ganhos', 'admin']) {
    await pg.goto(`http://localhost:${PORT}/${route}`);
    await pg.waitForTimeout(route === 'dashboard' ? 4000 : 1000);
    await pg.screenshot({ path: `${OUT}/10-${w}x${h}-${route}.png` });
    overflowAt[`${w}-${route}`] = await pg.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  }
  await c.close();
}

console.log(JSON.stringify({ yesTab, journalOk, overflowGanhos, overflowAt, alertsText, reportOk, drkAlerts, entrada, farmFound, chartOk, scamBadges, mobileHorizontalOverflow: overflow, errors: errors.filter((e) => !/ERR_FAILED|net::/.test(e)).slice(0, 10) }, null, 2));
await browser.close();
server.kill();
process.exit(0);
