import { Eye, Crosshair, Flame, Zap, Settings2, Check } from 'lucide-react';
import { useStore } from '@/state/store';
import { useUi } from '@/state/ui';
import { PRESET_KEYS, type PresetKey } from '@/domain/types';
import { PRESET_META } from '@/domain/presets';
import { cn } from '@/lib/cn';

export const PRESET_ICON: Record<PresetKey, typeof Eye> = { initial: Eye, strong: Crosshair, explosive: Flame, revival: Zap };

export const presetText: Record<string, string> = {
  initial: 'text-initial',
  strong: 'text-strong',
  explosive: 'text-explosive',
  revival: 'text-revival',
  custom: 'text-custom',
  test: 'text-warn',
};
export const presetBorder: Record<string, string> = {
  initial: 'border-initial/60',
  strong: 'border-strong/60',
  explosive: 'border-explosive/60',
  revival: 'border-revival/60',
  custom: 'border-custom/60',
  test: 'border-warn/60',
};
export const presetBg: Record<string, string> = {
  initial: 'bg-initial/15',
  strong: 'bg-strong/15',
  explosive: 'bg-explosive/15',
  revival: 'bg-revival/15',
  custom: 'bg-custom/15',
  test: 'bg-warn/15',
};
const checkBg: Record<PresetKey, string> = { initial: 'bg-initial', strong: 'bg-strong', explosive: 'bg-explosive', revival: 'bg-revival' };

export function PresetBar() {
  const presets = useStore((s) => s.presets);
  const setPreset = useStore((s) => s.setPreset);
  const openModal = (k: PresetKey) => useUi.getState().set({ presetModal: k });
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-line px-3 py-1.5 sm:px-4">
      {PRESET_KEYS.map((k) => {
        const p = presets[k];
        const Icon = PRESET_ICON[k];
        return (
          <div key={k} className="flex items-center gap-1.5">
            <button
              aria-label={`Ativar ${PRESET_META[k].label}`}
              onClick={() => setPreset(k, { ...p, active: !p.active })}
              className={cn('grid h-[18px] w-[18px] place-items-center rounded border', p.active ? `${checkBg[k]} border-transparent` : 'border-line bg-card')}
            >
              {p.active && <Check size={13} strokeWidth={3} className="text-black" />}
            </button>
            <button
              onClick={() => openModal(k)}
              className={cn('chip h-6 px-2 text-[10.5px]', presetBorder[k], presetText[k], p.active ? presetBg[k] : 'bg-transparent opacity-60')}
            >
              <Icon size={12} /> {PRESET_META[k].label}
            </button>
            <button className="btn-ghost hidden h-6 px-1 sm:inline-flex" aria-label={`Configurar ${PRESET_META[k].label}`} onClick={() => openModal(k)}>
              <Settings2 size={13} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
