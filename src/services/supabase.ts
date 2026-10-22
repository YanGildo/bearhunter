import { createClient, navigatorLock, NavigatorLockAcquireTimeoutError, type SupabaseClient } from '@supabase/supabase-js';

const directUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
/**
 * No site publicado, o Supabase é acessado por /sb (proxy no Cloudflare, ver functions/sb/),
 * porque algumas operadoras brasileiras bloqueiam *.supabase.co. Em localhost vai direto.
 */
const viaProxy = typeof window !== 'undefined' && !/^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);
const url = directUrl && viaProxy ? `${window.location.origin}/sb` : directUrl;
// mantém a mesma chave da sessão salva (senão todo mundo teria que entrar de novo)
const storageKey = directUrl ? `sb-${new URL(directUrl).hostname.split('.')[0]}-auth-token` : undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * Trava do login com tempo máximo. O Supabase usa uma trava entre abas para renovar o token.
 * Se uma aba antiga (congelada pelo navegador em segundo plano) segurar essa trava, as outras
 * ficariam presas em "Carregando…" para sempre. Aqui, depois de 5s, a trava é "roubada".
 */
const LOCK_WAIT_MS = 5000;
async function safeLock<R>(name: string, acquireTimeout: number, fn: () => Promise<R>): Promise<R> {
  const wait = acquireTimeout < 0 ? LOCK_WAIT_MS : Math.min(acquireTimeout, LOCK_WAIT_MS);
  try {
    return await navigatorLock(name, wait, fn);
  } catch (e) {
    const err = e as { isAcquireTimeout?: boolean; name?: string };
    const timedOut = e instanceof NavigatorLockAcquireTimeoutError || !!err?.isAcquireTimeout || err?.name === 'AbortError';
    if (!timedOut) throw e;
    if (typeof navigator !== 'undefined' && navigator.locks?.request) {
      return (await navigator.locks.request(name, { steal: true }, () => fn())) as R;
    }
    return fn();
  }
}

/** Sem as variáveis de ambiente o app roda em "modo local" (sem login), como na v1. */
export const supabase: SupabaseClient | null =
  url && key ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, lock: safeLock, storageKey } }) : null;
export const AUTH_ENABLED = !!supabase;

export interface Profile {
  id: string;
  email: string | null;
  name: string | null;
  status: 'pending' | 'active' | 'blocked';
  is_admin: boolean;
  operators_enabled: boolean;
  created_at: string;
  last_seen_at?: string | null;
}
