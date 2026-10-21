// Proxy mínimo para a API pública do DexScreener (Cloudflare Workers, plano grátis).
// Só é necessário se o navegador bloquear chamadas diretas (CORS).
// Deploy: Cloudflare → Workers & Pages → Create → Worker → cole este arquivo → Deploy.
// Depois cole a URL do worker em BearHunter → Configurações → Fontes.

const UPSTREAM = 'https://api.dexscreener.com';
// Somente os caminhos que o BearHunter usa.
const ALLOWED = [/^\/tokens\/v1\/solana\/[A-Za-z0-9,]+$/, /^\/latest\/dex\/search$/, /^\/token-boosts\/(top|latest)\/v1$/, /^\/token-profiles\/latest\/v1$/];

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Accept, Content-Type',
};

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'GET') return new Response('method not allowed', { status: 405, headers: cors });
    const url = new URL(request.url);
    if (!ALLOWED.some((r) => r.test(url.pathname))) return new Response('not found', { status: 404, headers: cors });
    const res = await fetch(UPSTREAM + url.pathname + url.search, { headers: { Accept: 'application/json' } });
    const headers = new Headers(cors);
    headers.set('Content-Type', res.headers.get('Content-Type') ?? 'application/json');
    headers.set('Cache-Control', 'no-store');
    return new Response(res.body, { status: res.status, headers });
  },
};
