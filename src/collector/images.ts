// Busca a foto de tokens que o DexScreener não fornece.
// Fonte: o próprio metadado do token (link "uri" que o PumpPortal manda no evento de criação).
// Fila pequena (3 por vez), uma tentativa por token, sem bloquear alertas.
import { useStore } from '@/state/store';
import { store as db } from '@/storage/db';

const uriBy = new Map<string, string>();
const tried = new Set<string>();
const queue: string[] = [];
let inflight = 0;

/** Gateways IPFS em ordem de preferência (o primeiro que responder vence). */
const IPFS = ['https://ipfs.io/ipfs/', 'https://cloudflare-ipfs.com/ipfs/'];

export function ipfsToHttp(u: string): string {
  const m = /^ipfs:\/\/(?:ipfs\/)?(.+)$/i.exec(u.trim());
  return m ? IPFS[0] + m[1] : u.trim();
}

export function rememberMetadataUri(address: string, uri: string | null | undefined) {
  if (!uri || typeof uri !== 'string') return;
  uriBy.set(address, uri);
  if (uriBy.size > 40_000) {
    const first = uriBy.keys().next().value;
    if (first !== undefined) uriBy.delete(first);
  }
}

/** Pede a foto de um token (se ainda não tem e há metadado conhecido). */
export function wantImage(address: string) {
  if (tried.has(address) || !uriBy.has(address)) return;
  const t = useStore.getState().tokens[address];
  if (t?.meta.imageUrl) return;
  tried.add(address);
  queue.push(address);
  pump();
}

function pump() {
  while (inflight < 3 && queue.length) {
    const a = queue.shift()!;
    inflight++;
    void resolve(a).finally(() => {
      inflight--;
      pump();
    });
  }
}

async function resolve(address: string) {
  const uri = uriBy.get(address);
  if (!uri) return;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(ipfsToHttp(uri), { signal: ctrl.signal });
    if (!res.ok) return;
    const j = (await res.json()) as { image?: unknown };
    if (typeof j?.image !== 'string' || !j.image) return;
    setImage(address, ipfsToHttp(j.image));
  } catch {
    /* sem foto: fica o círculo com as iniciais */
  } finally {
    clearTimeout(timer);
  }
}

function setImage(address: string, imageUrl: string) {
  const s = useStore.getState();
  const t = s.tokens[address];
  const patch: Partial<ReturnType<typeof useStore.getState>> = {};
  if (t && !t.meta.imageUrl) patch.tokens = { ...s.tokens, [address]: { ...t, meta: { ...t.meta, imageUrl } } };
  const fixed = s.alerts.filter((a) => a.tokenAddress === address && !a.imageUrl);
  if (fixed.length) {
    patch.alerts = s.alerts.map((a) => (a.tokenAddress === address && !a.imageUrl ? { ...a, imageUrl } : a));
    for (const a of fixed) void db.putAlert({ ...a, imageUrl });
  }
  if (Object.keys(patch).length) useStore.setState(patch);
}
