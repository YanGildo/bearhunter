import { Eye, Crosshair, Flame, Zap, Settings2, Check, Plus, Activity } from 'lucide-react';
import { useStore } from '@/state/store';
import { useUi } from '@/state/ui';
import { PRESET_KEYS, type Alert, type IndicatorColor, type PresetKey } from '@/domain/types';
import { PRESET_META, MAX_INDICATORS, INDICATOR_COLORS, defaultIndicator } from '@/domain/presets';
import { cn } from '@/lib/cn';

export const PRESET_ICON: Record<PresetKey, typeof Eye> = { initial: Eye, strong: Crosshair, explosive: Flame, revival: Zap };
export const INDICATOR_ICON = Activity;

// Classes estáticas por cor (Tailwind precisa enxergá-las no código).
export const presetText: Record<string, string> = {
  initial: 'text-initial',
  strong: 'text-strong',
  explosive: 'text-explosive',
  revival: 'text-revival',
  custom: 'text-custom',
  test: 'text-warn',
  cyan: 'text-cyan',
  pink: 'text-pink',
  lime: 'text-lime',
};
export const presetBorder: Record<string, string> = {
  initial: 'border-initial/60',
  strong: 'border-strong/60',
  explosive: 'border-explosive/60',
  revival: 'border-revival/60',
  custom: 'border-custom/60',
  test: 'border-warn/60',
  cyan: 'border-cyan/60',
  pink: 'border-pink/60',
  lime: 'border-lime/60',
};
export const presetBg: Record<string, string> = {
  initial: 'bg-initial/15',
  strong: 'bg-strong/15',
  explosive: 'bg-explosive/15',
  revival: 'bg-revival/15',
  custom: 'bg-custom/15',
  test: 'bg-warn/15',
  cyan: 'bg-cyan/15',
  pink: 'bg-pink/15',
  lime: 'bg-lime/15',
};
export const solidBg: Record<string, string> = {
  initial: 'bg-initial',
  strong: 'bg-strong',
  explosive: 'bg-explosive',
  revival: 'bg-revival',
  cyan: 'bg-cyan',
  pink: 'bg-pink',
  lime: 'bg-lime',
};

/** Chave de cor de um alerta (preset nativo, indicador, custom ou teste). */
export function alertColor(a: Pick<Alert, 'preset' | 'presetColor' | 'isTest'>): string {
  if (a.isTest) return 'test';
  if (a.preset.startsWith('ind:')) return a.presetColor ?? 'cyan';
  return a.preset;
}

export function PresetBar() {
  const presets = useStore((s) => s.presets);
  const indicators = useStore((s) => s.indicators);
  const setPreset = useStore((s) => s.setPreset);
  const openModal = (k: string) => useUi.getState().set({ presetModal: k as PresetKey });

  const addIndicator = () => {
    const used = new Set(indicators.map((i) => i.color));
    const color: IndicatorColor = INDICATOR_COLORS.find((c) => !used.has(c)) ?? 'cyan';
    const ind = defaultIndicator(`Indicador ${indicators.length + 1}`, color);
    useStore.setState({ indicators: [...indicators, ind] });
    openModal(ind.id);
  };

  const Item = ({ id, label, active, color, Icon, onToggle }: { id: string; label: string; active: boolean; color: string; Icon: typeof Eye; onToggle: () => void }) => (
    <div className="flex items-center gap-1.5">
      <button
        aria-label={`Ativar ${label}`}
        onClick={onToggle}
        className={cn('grid h-[18px] w-[18px] place-items-center rounded border', active ? `${solidBg[color]} border-transparent` : 'border-line bg-card')}
      >
        {active && <Check size={13} strokeWidth={3} className="text-black" />}
      </button>
      <button onClick={() => openModal(id)} className={cn('chip h-6 max-w-[180px] px-2 text-[10.5px]', presetBorder[color], presetText[color], active ? presetBg[color] : 'bg-transparent opacity-60')}>
        <Icon size={12} /> <span className="truncate">{label}</span>
      </button>
      <button className="btn-ghost hidden h-6 px-1 sm:inline-flex" aria-label={`Configurar ${label}`} onClick={() => openModal(id)}>
        <Settings2 size={13} />
      </button>
    </div>
  );

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-line px-3 py-1.5 sm:px-4">
      {PRESET_KEYS.map((k) => (
        <Item key={k} id={k} label={PRESET_META[k].label} active={presets[k].active} color={k} Icon={PRESET_ICON[k]} onToggle={() => setPreset(k, { ...presets[k], active: !presets[k].active })} />
      ))}
      {indicators.map((ind) => (
        <Item
          key={ind.id}
          id={ind.id}
          label={ind.name}
          active={ind.active}
          color={ind.color}
          Icon={INDICATOR_ICON}
          onToggle={() => useStore.setState({ indicators: indicators.map((i) => (i.id === ind.id ? { ...i, active: !i.active } : i)) })}
        />
      ))}
      {indicators.length < MAX_INDICATORS && (
        <button className="chip h-6 border-dashed border-line px-2 text-[10.5px] text-muted hover:text-fg" onClick={addIndicator} title="Adicionar indicador personalizado (até 3)">
          <Plus size={12} /> Indicador
        </button>
      )}
    </div>
  );
}
