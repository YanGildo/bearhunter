import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import { AUTH_ENABLED, supabase, type Profile } from '@/services/supabase';

type Status = 'loading' | 'local' | 'signedOut' | 'pending' | 'blocked' | 'active' | 'error';

interface AuthState {
  status: Status;
  session: Session | null;
  profile: Profile | null;
  error: string | null;
  init: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (name: string, email: string, password: string) => Promise<string | null>;
  signInGoogle: () => Promise<string | null>;
  signOut: () => Promise<void>;
}

const msg = (e: unknown) => {
  const m = (e as { message?: string })?.message ?? String(e);
  if (/Invalid login credentials/i.test(m)) return 'E-mail ou senha incorretos.';
  if (/already registered/i.test(m)) return 'Este e-mail já tem cadastro. Use "Entrar".';
  if (/Password should be/i.test(m)) return 'A senha precisa ter pelo menos 6 caracteres.';
  if (/provider is not enabled/i.test(m)) return 'O login com Google ainda não foi ativado no Supabase.';
  return m;
};

let started = false;
let lastTouch = 0;

/** Marca o "último acesso" no Admin (no máximo a cada 5 min). */
export function touchLastSeen() {
  if (!supabase || Date.now() - lastTouch < 5 * 60_000) return;
  lastTouch = Date.now();
  void supabase.rpc('touch_last_seen').then(
    () => undefined,
    () => undefined,
  );
}
let listening = false;

/** Não deixa uma chamada ao Supabase prender a tela de carregamento para sempre. */
function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`${what} demorou demais (sem resposta do servidor de login)`)), ms))]);
}

export const useAuth = create<AuthState>()((set, get) => ({
  status: AUTH_ENABLED ? 'loading' : 'local',
  session: null,
  profile: null,
  error: null,

  init: async () => {
    if (!supabase || started) return;
    started = true;
    set({ status: 'loading', error: null });
    try {
      const { data } = await withTimeout(supabase.auth.getSession(), 15000, 'Restaurar a sessão');
      set({ session: data.session });
      if (data.session) await withTimeout(get().refreshProfile(), 15000, 'Carregar o perfil');
      else set({ status: 'signedOut' });
    } catch (e) {
      started = false; // permite "Tentar novamente"
      set({ status: 'error', error: msg(e) });
    }
    if (listening) return;
    listening = true;
    supabase.auth.onAuthStateChange((_ev, session) => {
      // Recomendação do Supabase: nada de chamadas ao Supabase dentro deste callback
      // (ele roda com a trava do login segura). Adia para fora dele.
      setTimeout(() => {
        const prev = get().session?.user.id;
        set({ session });
        if (!session) set({ status: 'signedOut', profile: null });
        else if (session.user.id !== prev || get().status === 'error') void get().refreshProfile();
      }, 0);
    });
  },

  refreshProfile: async () => {
    if (!supabase) return;
    const uid = get().session?.user.id;
    if (!uid) return set({ status: 'signedOut', profile: null });
    // o perfil é criado por um gatilho no cadastro; tenta algumas vezes logo após criar a conta
    for (let i = 0; i < 4; i++) {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle();
      if (error) return set({ status: 'error', error: msg(error) });
      if (data) {
        const p = data as Profile;
        if (p.status === 'active') touchLastSeen();
        return set({ profile: p, status: p.status === 'active' ? 'active' : p.status === 'blocked' ? 'blocked' : 'pending', error: null });
      }
      await new Promise((r) => setTimeout(r, 800));
    }
    set({ status: 'pending', profile: null });
  },

  signIn: async (email, password) => {
    if (!supabase) return 'Login não configurado';
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    return error ? msg(error) : null;
  },

  signUp: async (name, email, password) => {
    if (!supabase) return 'Login não configurado';
    const { error } = await supabase.auth.signUp({ email: email.trim(), password, options: { data: { name: name.trim() } } });
    return error ? msg(error) : null;
  },

  signInGoogle: async () => {
    if (!supabase) return 'Login não configurado';
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } });
    return error ? msg(error) : null;
  },

  signOut: async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    set({ status: 'signedOut', profile: null, session: null });
  },
}));

/** Pode usar a aba Operadores? (modo local: sempre; com login: liberado pelo admin) */
export function operatorsAllowed(): boolean {
  const a = useAuth.getState();
  if (a.status === 'local') return true;
  return !!a.profile?.operators_enabled && a.status === 'active';
}
