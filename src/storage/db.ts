// Persistência local no navegador (IndexedDB). Nada sai do aparelho.
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Alert, MarketObservation } from '@/domain/types';

export interface SoundRecord {
  id: string;
  name: string;
  blob: Blob;
  createdAt: number;
}

interface BHSchema extends DBSchema {
  alerts: { key: string; value: Alert; indexes: { byTime: number } };
  snapshots: { key: [string, number]; value: MarketObservation; indexes: { byTime: number; byToken: string } };
  sounds: { key: string; value: SoundRecord };
}

let dbp: Promise<IDBPDatabase<BHSchema>> | null = null;

function db() {
  if (!dbp) {
    dbp = openDB<BHSchema>('bearhunter', 1, {
      upgrade(d) {
        const a = d.createObjectStore('alerts', { keyPath: 'id' });
        a.createIndex('byTime', 'detectedAt');
        const s = d.createObjectStore('snapshots', { keyPath: ['tokenAddress', 'observedAt'] });
        s.createIndex('byTime', 'observedAt');
        s.createIndex('byToken', 'tokenAddress');
        d.createObjectStore('sounds', { keyPath: 'id' });
      },
    });
  }
  return dbp;
}

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    console.warn('[db]', e);
    return fallback;
  }
}

export const store = {
  putAlert: (a: Alert) => safe(async () => void (await (await db()).put('alerts', a)), undefined),
  clearAlerts: () => safe(async () => void (await (await db()).clear('alerts')), undefined),
  /** Alertas mais recentes primeiro. */
  recentAlerts: (limit = 500) =>
    safe(async () => {
      const tx = (await db()).transaction('alerts');
      const out: Alert[] = [];
      let cur = await tx.store.index('byTime').openCursor(null, 'prev');
      while (cur && out.length < limit) {
        out.push(cur.value);
        cur = await cur.continue();
      }
      return out;
    }, [] as Alert[]),

  putSnapshots: (list: MarketObservation[]) =>
    safe(async () => {
      if (!list.length) return;
      const tx = (await db()).transaction('snapshots', 'readwrite');
      await Promise.all([...list.map((s) => tx.store.put(s)), tx.done]);
    }, undefined),
  snapshotsSince: (since: number) =>
    safe(async () => (await db()).getAllFromIndex('snapshots', 'byTime', IDBKeyRange.lowerBound(since)), [] as MarketObservation[]),
  pruneSnapshots: (before: number) =>
    safe(async () => {
      const tx = (await db()).transaction('snapshots', 'readwrite');
      let cur = await tx.store.index('byTime').openCursor(IDBKeyRange.upperBound(before));
      while (cur) {
        await cur.delete();
        cur = await cur.continue();
      }
      await tx.done;
    }, undefined),
  clearSnapshots: () => safe(async () => void (await (await db()).clear('snapshots')), undefined),

  listSounds: () => safe(async () => (await db()).getAll('sounds'), [] as SoundRecord[]),
  putSound: (s: SoundRecord) => safe(async () => void (await (await db()).put('sounds', s)), undefined),
  deleteSound: (id: string) => safe(async () => void (await (await db()).delete('sounds', id)), undefined),
  getSound: (id: string) => safe(async () => (await db()).get('sounds', id), undefined as SoundRecord | undefined),
};
