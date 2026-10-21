// Sons de alerta. Embutidos (sintetizados, sem arquivo) + arquivos que o usuário envia,
// guardados no IndexedDB do navegador.
import { store } from '@/storage/db';

export interface SoundOption {
  id: string;
  name: string;
  builtin: boolean;
}

type Note = [freq: number, startS: number, durS: number, type?: OscillatorType];

const BUILTINS: Record<string, { name: string; notes: Note[] }> = {
  'builtin:initial': { name: 'Ping azul (Initial)', notes: [[880, 0, 0.12], [1320, 0.13, 0.16]] },
  'builtin:strong': { name: 'Duplo verde (Strong)', notes: [[660, 0, 0.1], [990, 0.11, 0.1], [1320, 0.22, 0.2]] },
  'builtin:explosive': {
    name: 'Sirene vermelha (Explosive)',
    notes: [[520, 0, 0.12, 'sawtooth'], [880, 0.12, 0.12, 'sawtooth'], [520, 0.24, 0.12, 'sawtooth'], [880, 0.36, 0.2, 'sawtooth']],
  },
  'builtin:revival': { name: 'Despertar laranja (Revival)', notes: [[392, 0, 0.18, 'triangle'], [523, 0.18, 0.18, 'triangle'], [784, 0.36, 0.3, 'triangle']] },
  'builtin:custom': { name: 'Toque roxo (My Alerts)', notes: [[740, 0, 0.1, 'square'], [740, 0.16, 0.1, 'square']] },
};

let ctx: AudioContext | null = null;
function audio(): AudioContext | null {
  try {
    if (!ctx) ctx = new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** Navegadores só liberam áudio após um clique; chamar isso no primeiro gesto do usuário. */
export function unlockAudio() {
  audio();
}

function playSynth(notes: Note[], volume: number) {
  const c = audio();
  if (!c) return;
  const t0 = c.currentTime + 0.01;
  for (const [f, s, d, type = 'sine'] of notes) {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.value = f;
    g.gain.setValueAtTime(0, t0 + s);
    g.gain.linearRampToValueAtTime(0.25 * volume, t0 + s + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + s + d);
    o.connect(g).connect(c.destination);
    o.start(t0 + s);
    o.stop(t0 + s + d + 0.02);
  }
}

const urlCache = new Map<string, string>();

export async function playSound(id: string | null, volume = 0.7) {
  if (!id) return;
  const b = BUILTINS[id];
  if (b) return playSynth(b.notes, volume);
  let url = urlCache.get(id);
  if (!url) {
    const rec = await store.getSound(id);
    if (!rec) return;
    url = URL.createObjectURL(rec.blob);
    urlCache.set(id, url);
  }
  const el = new Audio(url);
  el.volume = Math.max(0, Math.min(1, volume));
  await el.play().catch(() => {});
}

export function builtinSounds(): SoundOption[] {
  return Object.entries(BUILTINS).map(([id, v]) => ({ id, name: v.name, builtin: true }));
}

export async function allSounds(): Promise<SoundOption[]> {
  const custom = await store.listSounds();
  return [...builtinSounds(), ...custom.map((s) => ({ id: s.id, name: s.name, builtin: false }))];
}

export function forgetSoundUrl(id: string) {
  const u = urlCache.get(id);
  if (u) URL.revokeObjectURL(u);
  urlCache.delete(id);
}
