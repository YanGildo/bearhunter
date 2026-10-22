// Cloudflare Pages Function: rota alternativa para o WebSocket do PumpPortal.
// Usada só quando a conexão direta falha (algumas operadoras bloqueiam pumpportal.fun).
export async function onRequest({ request }) {
  if (request.headers.get('Upgrade') !== 'websocket') return new Response('PumpPortal WS proxy', { status: 426 });
  const url = new URL(request.url);
  return fetch(new Request('https://pumpportal.fun/api/data' + url.search, request));
}
