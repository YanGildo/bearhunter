// Sincroniza as configurações do usuário com o Supabase (tabela user_state),
// para abrirem iguais em qualquer aparelho. Alertas, snapshots e sons continuam no navegador.
// A API key do PumpPortal NUNCA vai para a nuvem.
import { supabase } from './supabase';
import { touchLastSeen } from '@/state/auth';
import { useStore } from '@/state/store';
import { defaultIndicator, defaultPresets } from '@/domain/presets';
import { EMPTY_OPERATOR_STATE } from '@/operators/types';

const STORAGE_KEY = 'bearhunter:v1';
let unsub: (() => void) | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let userId: string | null = null;

function snapshot() {
  const s = useStore.getState();
  const { pumpPortalKey: _k, ...prefs } = s.prefs;
  const { signals, unread: _u, ...rest } = s.operator;
  void _u;
  // sinais também vão para a nuvem (os 200 mais recentes), para não sumirem ao limpar o navegador
  const operator = { ...rest, signals: signals.slice(0, 200) };
  void _k;
  return {
    presets: s.presets,
    indicators: s.indicators,
    presetsVersion: s.presetsVersion,
    prefs,
    favorites: s.favorites,
    scams: s.scams,
    folders: s.folders,
    watchTab: s.watchTab,
    alertFilter: s.alertFilter,
    myAlerts: s.myAlerts,
    savedTokens: s.savedTokens,
    journal: s.journal,
    analyses: s.analyses.slice(0, 100),
    operator,
  };
}

const dirtyKey = (uid: string) => `bearhunter:dirty:${uid}`;
function setDirty(uid: string, on: boolean) {
  try {
    if (on) localStorage.setItem(dirtyKey(uid), String(Date.now()));
    else localStorage.removeItem(dirtyKey(uid));
  } catch {
    /* ignore */
  }
}
function isDirty(uid: string) {
  try {
    return !!localStorage.getItem(dirtyKey(uid));
  } catch {
    return false;
  }
}

let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryDelay = 15_000;

/** Sobe o estado atual. Se falhar, marca "pendente" (sobrevive a recarregar) e tenta de novo. */
async function push(): Promise<boolean> {
  if (!supabase || !userId) return false;
  const uid = userId;
  setDirty(uid, true);
  touchLastSeen();
  let ok = false;
  try {
    const { error } = await supabase.from('user_state').upsert({ user_id: uid, data: snapshot(), updated_at: new Date().toISOString() });
    ok = !error;
  } catch {
    ok = false;
  }
  if (ok) {
    setDirty(uid, false);
    retryDelay = 15_000;
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
  } else if (!retryTimer && userId === uid) {
    retryTimer = setTimeout(() => {
      retryTimer = null;
      void push();
    }, retryDelay);
    retryDelay = Math.min(120_000, retryDelay * 2);
  }
  return ok;
}

type Sig = { id: string; at: number };
function mergeSignals(a: Sig[] = [], b: Sig[] = []): Sig[] {
  const m = new Map<string, Sig>();
  for (const x of [...a, ...b]) if (x?.id) m.set(x.id, x);
  return [...m.values()].sort((x, y) => y.at - x.at).slice(0, 300);
}

/** Carrega os dados da conta (a nuvem vence) e passa a salvar as mudanças automaticamente. */
export async function startCloudSync(uid: string) {
  if (!supabase) return;
  userId = uid;
  const { data, error } = await supabase.from('user_state').select('data').eq('user_id', uid).maybeSingle();
  if (error) {
    // não conseguiu ler a nuvem: NÃO sobe nada (senão apagaria a nuvem com dados velhos); tenta de novo em 15s
    setTimeout(() => {
      if (userId === uid) void startCloudSync(uid);
    }, 15_000);
    return;
  }
  const cloud = (data?.data ?? null) as Record<string, unknown> | null;
  let owner: string | null = null;
  try {
    owner = localStorage.getItem('bearhunter:owner');
    localStorage.setItem('bearhunter:owner', uid);
  } catch {
    /* ignore */
  }
  if (!(cloud && Object.keys(cloud).length) && owner && owner !== uid) {
    // outra conta usou este navegador antes: começa limpo em vez de herdar os dados dela
    useStore.setState({
      presets: defaultPresets(),
      indicators: [{ ...defaultIndicator(), active: false }],
      favorites: [],
      scams: {},
      folders: [],
      journal: [],
      analyses: [],
      myAlerts: [],
      savedTokens: [],
      operator: EMPTY_OPERATOR_STATE,
    });
  }
  if (cloud && Object.keys(cloud).length && owner === uid && isDirty(uid)) {
    // este navegador tem mudanças que não chegaram à nuvem (ex.: internet caiu): o local vence e sobe agora
    await push();
  } else if (cloud && Object.keys(cloud).length) {
    // Reaproveita o "merge" do persist (inclui migrações de presets) escrevendo os dados da nuvem
    // no formato do localStorage e reidratando a store.
    const cur = useStore.getState();
    const local = {
      ...cloud,
      prefs: { ...(cloud.prefs as object), pumpPortalKey: cur.prefs.pumpPortalKey },
      operator: {
        ...(cloud.operator as object),
        signals: mergeSignals((cloud.operator as { signals?: Sig[] } | undefined)?.signals, owner === uid ? (cur.operator.signals as Sig[]) : []),
        unread: cur.operator.unread,
      },
      graveyard: cur.graveyard,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: local, version: 0 }));
    } catch {
      /* ignore */
    }
    await useStore.persist.rehydrate();
  } else {
    await push(); // primeira vez nesta conta: sobe o que já existe neste navegador
  }
  unsub?.();
  let last = JSON.stringify(snapshot());
  // a store muda a cada ciclo (preços); agenda no máximo 1 verificação a cada 4s
  unsub = useStore.subscribe(() => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      const now = JSON.stringify(snapshot());
      if (now === last) return;
      last = now;
      void push();
    }, 4000);
  });
  // ao fechar/sair da aba, tenta salvar o que estiver pendente
  if (!pagehideBound) {
    pagehideBound = true;
    window.addEventListener('pagehide', () => {
      if (userId && (timer || isDirty(userId))) void push();
    });
  }
}
let pagehideBound = false;

export function stopCloudSync() {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  unsub?.();
  unsub = null;
  userId = null;
}
