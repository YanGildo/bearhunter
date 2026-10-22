// Cloudflare Pages Function: rota alternativa para a RPC da Solana (HTTP e WebSocket).
// ?u=<url da RPC> escolhe o destino; só hosts de RPC conhecidos são aceitos (não é um proxy aberto).
const DEFAULT = 'https://api.mainnet-beta.solana.com';
const ALLOWED = [/^api\.mainnet-beta\.solana\.com$/, /(^|\.)helius-rpc\.com$/, /(^|\.)quiknode\.pro$/, /(^|\.)alchemy\.com$/, /(^|\.)ankr\.com$/, /(^|\.)extrnode\.com$/];

export async function onRequest({ request }) {
  const url = new URL(request.url);
  let target;
  try {
    target = new URL(url.searchParams.get('u') || DEFAULT);
  } catch {
    return new Response('url inválida', { status: 400 });
  }
  if (target.protocol === 'wss:') target.protocol = 'https:';
  if (target.protocol === 'ws:') target.protocol = 'http:';
  if (!ALLOWED.some((r) => r.test(target.hostname))) return new Response('host de RPC não permitido', { status: 403 });
  if (request.headers.get('Upgrade') === 'websocket') return fetch(new Request(target.toString(), request));
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
  if (request.method !== 'POST') return new Response('use POST', { status: 405 });
  const res = await fetch(target.toString(), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: request.body,
  });
  return new Response(res.body, { status: res.status, headers: { 'content-type': res.headers.get('content-type') || 'application/json', 'cache-control': 'no-store' } });
}
