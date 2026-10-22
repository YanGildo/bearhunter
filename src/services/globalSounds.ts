// Sons globais: o admin publica um som enviado por ele e todos os usuários passam a poder usá-lo.
// Arquivo no Supabase Storage (bucket público "sounds"), lista na tabela global_sounds.
import { supabase } from './supabase';

export interface GlobalSound {
  id: string; // id na tabela (sem o prefixo "g:")
  name: string;
  path: string;
  active: boolean;
  url: string;
}

let cache: GlobalSound[] | null = null;
let loading: Promise<GlobalSound[]> | null = null;

/** id local ("custom:123-0") → id global ("custom-123-0") */
export const globalIdFor = (localId: string) => localId.replace(/[^a-zA-Z0-9_-]/g, '-');

function publicUrl(path: string) {
  return supabase ? supabase.storage.from('sounds').getPublicUrl(path).data.publicUrl : '';
}

export async function listGlobalSounds(force = false): Promise<GlobalSound[]> {
  if (!supabase) return [];
  if (cache && !force) return cache;
  if (loading && !force) return loading;
  loading = (async () => {
    const { data, error } = await supabase.from('global_sounds').select('id,name,path,active').order('created_at', { ascending: false });
    if (error) return cache ?? [];
    cache = (data ?? []).map((r) => ({ ...(r as Omit<GlobalSound, 'url'>), url: publicUrl((r as { path: string }).path) }));
    return cache;
  })();
  try {
    return await loading;
  } finally {
    loading = null;
  }
}

export function globalSoundUrl(id: string): string | null {
  return cache?.find((g) => g.id === id && g.active)?.url ?? null;
}

/** Liga/desliga um som enviado pelo admin como global. */
export async function setSoundGlobal(localId: string, name: string, blob: Blob, on: boolean): Promise<string | null> {
  if (!supabase) return 'Login não configurado';
  const id = globalIdFor(localId);
  if (!on) {
    const { error } = await supabase.from('global_sounds').update({ active: false }).eq('id', id);
    await listGlobalSounds(true);
    return error?.message ?? null;
  }
  const ext = (blob.type.split('/')[1] || 'mp3').replace('mpeg', 'mp3').replace('x-', '');
  const path = `${id}.${ext}`;
  const existing = (await listGlobalSounds(true)).find((g) => g.id === id);
  if (!existing) {
    const up = await supabase.storage.from('sounds').upload(path, blob, { contentType: blob.type || 'audio/mpeg', upsert: true });
    if (up.error) return up.error.message;
  }
  const { data: u } = await supabase.auth.getUser();
  const { error } = existing
    ? await supabase.from('global_sounds').update({ active: true, name }).eq('id', id)
    : await supabase.from('global_sounds').insert({ id, name, path, created_by: u.user?.id ?? null, active: true });
  await listGlobalSounds(true);
  return error?.message ?? null;
}
