import { useStore } from '@/state/store';

/** Exporta presets, preferências, favoritos, pastas, My Alerts e tokens manuais em JSON. */
export function exportConfig() {
  const s = useStore.getState();
  const data = {
    kind: 'bearhunter-config',
    version: 1,
    exportedAt: new Date().toISOString(),
    presets: s.presets,
    prefs: s.prefs,
    favorites: s.favorites,
    scams: s.scams,
    folders: s.folders,
    myAlerts: s.myAlerts,
    savedTokens: s.savedTokens,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `bearhunter-config-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export async function importConfig(file: File): Promise<boolean> {
  try {
    const d = JSON.parse(await file.text());
    if (d?.kind !== 'bearhunter-config') return false;
    const s = useStore.getState();
    useStore.setState({
      presets: d.presets ?? s.presets,
      prefs: { ...s.prefs, ...(d.prefs ?? {}) },
      favorites: Array.isArray(d.favorites) ? d.favorites : s.favorites,
      scams: d.scams && typeof d.scams === 'object' ? d.scams : s.scams,
      folders: Array.isArray(d.folders) ? d.folders : s.folders,
      myAlerts: Array.isArray(d.myAlerts) ? d.myAlerts : s.myAlerts,
      savedTokens: Array.isArray(d.savedTokens) ? d.savedTokens : s.savedTokens,
    });
    const tokens = { ...useStore.getState().tokens };
    for (const t of useStore.getState().savedTokens) if (!tokens[t.address]) tokens[t.address] = { ...t, lastFetchAt: null, lastObservation: null, status: 'waiting' };
    useStore.setState({ tokens });
    return true;
  } catch {
    return false;
  }
}
