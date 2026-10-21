// Sincroniza as configurações do usuário com o Supabase (tabela user_state),
// para abrirem iguais em qualquer aparelho. Alertas, snapshots e sons continuam no navegador.
// A API key do PumpPortal NUNCA vai para a nuvem.
import { supabase } from './supabase';
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
  const { signals: _s, unread: _u, ...operator } = s.operator;
  void _s;
  void _u;
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
    operator,
  };
}

async function push() {
  if (!supabase || !userId) return;
  await supabase.from('user_state').upsert({ user_id: userId, data: snapshot(), updated_at: new Date().toISOString() });
}

/** Carrega os dados da conta (a nuvem vence) e passa a salvar as mudanças automaticamente. */
export async function startCloudSync(uid: string) {
  if (!supabase) return;
  userId = uid;
  const { data } = await supabase.from('user_state').select('data').eq('user_id', uid).maybeSingle();
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
      myAlerts: [],
      savedTokens: [],
      operator: EMPTY_OPERATOR_STATE,
    });
  }
  if (cloud && Object.keys(cloud).length) {
    // Reaproveita o "merge" do persist (inclui migrações de presets) escrevendo os dados da nuvem
    // no formato do localStorage e reidratando a store.
    const cur = useStore.getState();
    const local = {
      ...cloud,
      prefs: { ...(cloud.prefs as object), pumpPortalKey: cur.prefs.pumpPortalKey },
      operator: { ...(cloud.operator as object), signals: cur.operator.signals, unread: cur.operator.unread },
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
}

export function stopCloudSync() {
  unsub?.();
  unsub = null;
  userId = null;
}
