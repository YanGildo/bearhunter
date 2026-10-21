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
await page.keyboard.press('Escape');

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

console.log(JSON.stringify({ alertsText, mobileHorizontalOverflow: overflow, errors: errors.filter((e) => !/ERR_FAILED|net::/.test(e)).slice(0, 10) }, null, 2));
await browser.close();
server.kill();
process.exit(0);
