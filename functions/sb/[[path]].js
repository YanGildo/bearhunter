// Cloudflare Pages Function: repassa /sb/* para o Supabase.
// Motivo: algumas operadoras no Brasil não conseguem acessar *.supabase.co. Pelo mesmo domínio do site
// o navegador fala só com o Cloudflare, e o Cloudflare fala com o Supabase.
const UPSTREAM = 'https://cyowwavylixpxdqraibb.supabase.co';

export async function onRequest({ request }) {
  const url = new URL(request.url);
  const target = UPSTREAM + url.pathname.replace(/^\/sb/, '') + url.search;
  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.delete('cookie');
  const init = { method: request.method, headers, redirect: 'manual' };
  if (!['GET', 'HEAD'].includes(request.method)) init.body = request.body;
  const res = await fetch(target, init);
  const out = new Headers(res.headers);
  out.set('cache-control', 'no-store');
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: out });
}
