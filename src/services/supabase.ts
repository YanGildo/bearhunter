import { createClient, navigatorLock, NavigatorLockAcquireTimeoutError, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
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
  url && key ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, lock: safeLock } }) : null;
export const AUTH_ENABLED = !!supabase;

export interface Profile {
  id: string;
  email: string | null;
  name: string | null;
  status: 'pending' | 'active' | 'blocked';
  is_admin: boolean;
  operators_enabled: boolean;
  created_at: string;
}
