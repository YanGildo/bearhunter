import { useEffect, useState } from 'react';
import { Check, Save, TrendingDown, TrendingUp, Volume2, X, HelpCircle } from 'lucide-react';
import { useStore } from '@/state/store';
import { useUi } from '@/state/ui';
import { Modal } from './primitives';
import { PRESET_KEYS, TIMEFRAMES, type PresetConfig, type PresetKey, type RevivalConfig, type Timeframe, type TimeframeConfig } from '@/domain/types';
import { PRESET_META, DEFAULT_REVIVAL } from '@/domain/presets';
import { PRESET_ICON, presetBg, presetBorder, presetText } from './PresetBar';
import { cn } from '@/lib/cn';
import { allSounds, playSound, unlockAudio, type SoundOption } from '@/services/sound';

const TFL: Record<Timeframe, string> = { '5m': '5M', '1h': '1H', '6h': '6H', '24h': '24H' };
const checkBg: Record<PresetKey, string> = { initial: 'bg-initial', strong: 'bg-strong', explosive: 'bg-explosive', revival: 'bg-revival' };

/** Campo numérico: vazio = null (nunca vira zero). */
function NumField({
  label,
  value,
  onChange,
  unit,
  required,
  help,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  unit?: string;
  required?: boolean;
  help?: string;
}) {
  const [txt, setTxt] = useState(value == null ? '' : String(value));
  useEffect(() => setTxt(value == null ? '' : String(value)), [value]);
  return (
    <div className="flex items-center justify-between gap-3 py-[5px]">
      <span className="flex items-center gap-1 text-[12px] text-fg/85">
        {label}
        {help && (
          <span title={help} className="cursor-help text-dim">
            <HelpCircle size={12} />
          </span>
        )}
      </span>
      <span className="flex items-center gap-1.5">
        <input
          inputMode="decimal"
          value={txt}
          placeholder="—"
          onChange={(e) => setTxt(e.target.value)}
          onBlur={() => {
            const t = txt.trim().replace(',', '.');
            if (t === '') {
              if (required) setTxt(value == null ? '' : String(value));
              else onChange(null);
              return;
            }
            const n = Number(t);
            if (Number.isFinite(n)) onChange(n);
            else setTxt(value == null ? '' : String(value));
          }}
          className="num h-8 w-[84px] rounded-md border border-line bg-raised px-2 text-right text-[12px] outline-none focus:border-primary/60"
        />
        <span className="w-7 text-[10px] text-dim">{unit}</span>
      </span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 border-b border-line pb-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">{title}</div>
      {children}
    </div>
  );
}

function TfEditor({ cfg, set }: { cfg: TimeframeConfig; set: (c: TimeframeConfig) => void; tf: Timeframe }) {
  const f = <K extends keyof TimeframeConfig>(k: K) => (v: TimeframeConfig[K]) => set({ ...cfg, [k]: v });
  return (
    <div className="grid gap-x-8 gap-y-4 md:grid-cols-2">
      <Section title="Core filters">
        <NumField label="Vol Rise" unit="%" value={cfg.volRisePct} onChange={f('volRisePct')} help="Quanto o volume da janela subiu desde o snapshot anterior. Vazio = não exige." />
        <NumField label="MCap Rise" unit="%" value={cfg.mcapRisePct} onChange={f('mcapRisePct')} help="Quanto o market cap subiu desde o snapshot anterior. Vazio = não exige." />
        <NumField label="Min Vol" unit="$" value={cfg.minVol} onChange={f('minVol')} />
        <NumField label="Min MCap" unit="$" value={cfg.minMcap} onChange={f('minMcap')} />
        <NumField label="Max MCap" unit="$" value={cfg.maxMcap} onChange={f('maxMcap')} />
        <NumField label="Check Interval" unit="s" required value={cfg.checkIntervalS} onChange={(v) => f('checkIntervalS')(Math.max(10, v ?? 30))} help="De quanto em quanto tempo o preset avalia (mínimo 10s)." />
        <NumField label="Alert Cooldown" unit="s" required value={cfg.cooldownS} onChange={(v) => f('cooldownS')(Math.max(0, v ?? 300))} help="Tempo mínimo entre dois alertas do mesmo token/preset/timeframe/direção." />
        <NumField label="Max Tokens" required value={cfg.maxTokens} onChange={(v) => f('maxTokens')(Math.max(50, v ?? 3000))} />
        <NumField label="No Vol Remove" unit="cyc" value={cfg.noVolRemoveCycles} onChange={f('noVolRemoveCycles')} help="Remove da lista automática após N ciclos sem volume. Manuais e favoritos nunca saem." />
        <NumField label="Hi Vol Threshold" unit="$" value={cfg.hiVolThreshold} onChange={f('hiVolThreshold')} help="Acima disso o token ganha badge HOT e prioridade de coleta. Não gera alerta sozinho." />
      </Section>
      <div className="space-y-4">
        <Section title="Direction">
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              onClick={() => set({ ...cfg, buySide: !cfg.buySide })}
              className={cn('flex h-9 items-center justify-center gap-1.5 rounded-md border text-[12px] font-bold', cfg.buySide ? 'border-up/60 bg-up/15 text-up' : 'border-line text-dim')}
            >
              <TrendingUp size={14} /> Buy-Side
            </button>
            <button
              onClick={() => set({ ...cfg, sellSide: !cfg.sellSide })}
              className={cn('flex h-9 items-center justify-center gap-1.5 rounded-md border text-[12px] font-bold', cfg.sellSide ? 'border-down/60 bg-down/15 text-down' : 'border-line text-dim')}
            >
              <TrendingDown size={14} /> Sell-Side
            </button>
          </div>
        </Section>
        <Section title="Optional filters">
          <NumField label="Max Vol" unit="$" value={cfg.maxVol} onChange={f('maxVol')} />
          <NumField label="Min Change" unit="%" value={cfg.minChangePct} onChange={f('minChangePct')} />
          <NumField label="Max Change" unit="%" value={cfg.maxChangePct} onChange={f('maxChangePct')} />
          <NumField label="Min Txns" value={cfg.minTxns} onChange={f('minTxns')} />
          <NumField label="Max Txns" value={cfg.maxTxns} onChange={f('maxTxns')} />
          <NumField label="Min Liquidity" unit="$" value={cfg.minLiq} onChange={f('minLiq')} help="Atenção: tokens na bonding curve não têm liquidez informada e serão rejeitados se este filtro estiver ativo." />
          <NumField label="Max Liquidity" unit="$" value={cfg.maxLiq} onChange={f('maxLiq')} />
        </Section>
        <Section title="Pair age">
          <div className="grid grid-cols-2 gap-x-4">
            <NumField label="Min Age" unit="h" value={cfg.minAgeH} onChange={f('minAgeH')} />
            <NumField label="Max Age" unit="h" value={cfg.maxAgeH} onChange={f('maxAgeH')} />
          </div>
        </Section>
      </div>
    </div>
  );
}

function RevivalEditor({ cfg, set }: { cfg: RevivalConfig; set: (c: RevivalConfig) => void }) {
  const f = <K extends keyof RevivalConfig>(k: K) => (v: number | null) => set({ ...cfg, [k]: v ?? (DEFAULT_REVIVAL[k] as number) });
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-revival/40 bg-revival/[0.06] p-3">
        <div className="text-[12px] font-bold uppercase text-revival">Revival — lógica de ressurreição</div>
        <p className="mt-1 text-[11.5px] text-muted">
          Compara o estado atual contra um <b className="text-fg">baseline histórico de token morto</b>. Os filtros genéricos de % não se aplicam — use só os parâmetros abaixo. Sem histórico próprio suficiente, o baseline é
          estimado pelas janelas 1H/6H/24H (confiança baixa).
        </p>
      </div>
      <Section title="Revival parameters">
        <NumField label="Dead Baseline Ceiling" unit="$" required value={cfg.deadBaselineCeiling} onChange={f('deadBaselineCeiling')} help="Volume de 5m máximo para considerar o token 'morto'." />
        <NumField label="Spike Multiplier" unit="x" required value={cfg.spikeMultiplier} onChange={f('spikeMultiplier')} help="Quantas vezes o volume atual precisa estar acima do baseline." />
        <NumField label="Real Volume Floor" unit="$" required value={cfg.realVolumeFloor} onChange={f('realVolumeFloor')} help="Volume de 5m mínimo do pico (evita 20x de quase nada)." />
        <NumField label="Liquidity Ceiling" unit="$" value={cfg.liquidityCeiling} onChange={(v) => set({ ...cfg, liquidityCeiling: v })} help="Liquidez máxima. Vazio = sem teto." />
        <NumField label="Min Pair Age" unit="h" required value={cfg.minPairAgeH} onChange={f('minPairAgeH')} />
        <NumField label="Janela mínima morta" unit="min" required value={cfg.deadWindowMin} onChange={f('deadWindowMin')} help="Por quanto tempo antes do pico o token precisa ter ficado morto." />
        <NumField label="Janela de análise" unit="h" required value={cfg.analysisWindowH} onChange={f('analysisWindowH')} />
      </Section>
      <Section title="Operational">
        <div className="grid gap-x-8 md:grid-cols-2">
          <NumField label="Check Interval" unit="s" required value={cfg.checkIntervalS} onChange={(v) => set({ ...cfg, checkIntervalS: Math.max(10, v ?? 30) })} />
          <NumField label="Alert Cooldown" unit="s" required value={cfg.cooldownS} onChange={f('cooldownS')} />
        </div>
      </Section>
    </div>
  );
}

export function PresetModal() {
  const open = useUi((s) => s.presetModal);
  const presets = useStore((s) => s.presets);
  const [draft, setDraft] = useState<Record<PresetKey, PresetConfig>>(presets);
  const [tab, setTab] = useState<PresetKey>('initial');
  const [editTf, setEditTf] = useState<Record<PresetKey, Timeframe>>({ initial: '5m', strong: '5m', explosive: '5m', revival: '5m' });
  const [sounds, setSounds] = useState<SoundOption[]>([]);

  useEffect(() => {
    if (open) {
      setDraft(structuredClone(useStore.getState().presets));
      setTab(open);
      void allSounds().then(setSounds);
    }
  }, [open]);

  const close = () => useUi.getState().set({ presetModal: null });
  const save = () => {
    useStore.setState({ presets: draft });
    close();
  };
  const p = draft[tab];
  const set = (np: PresetConfig) => setDraft({ ...draft, [tab]: np });
  const tf = editTf[tab];

  return (
    <Modal
      open={!!open}
      onOpenChange={(o) => !o && close()}
      title="Preset configuration"
      footer={
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Volume2 size={15} className="text-muted" />
            <select className="input h-8 w-64 max-w-full" value={p.soundId ?? ''} onChange={(e) => set({ ...p, soundId: e.target.value || null })}>
              <option value="">Sem som</option>
              {sounds.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <span className="text-[11px] text-muted">Vol:</span>
            <input type="range" min={0} max={1} step={0.05} value={p.volume} onChange={(e) => set({ ...p, volume: Number(e.target.value) })} className="w-36 accent-[hsl(var(--primary))]" />
            <span className="num w-9 text-[11px] text-muted">{Math.round(p.volume * 100)}%</span>
            <button
              className="btn border-warn/40 text-warn"
              onClick={() => {
                unlockAudio();
                void playSound(p.soundId, p.volume);
              }}
            >
              Test
            </button>
          </div>
          <div className="flex justify-end gap-2">
            <button className="btn h-9 px-4" onClick={close}>
              <X size={13} /> Cancel
            </button>
            <button className="btn h-9 border-up/60 bg-up/15 px-4 text-up" onClick={save}>
              <Save size={13} /> Save
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-4 p-5">
        <div className="flex flex-wrap gap-2">
          {PRESET_KEYS.map((k) => {
            const Icon = PRESET_ICON[k];
            return (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={cn('flex h-9 items-center gap-1.5 rounded-md border px-3 text-[12px] font-bold uppercase tracking-wide', tab === k ? cn(presetBorder[k], presetBg[k], presetText[k]) : 'border-line bg-card text-muted')}
              >
                <Icon size={14} /> {PRESET_META[k].label}
              </button>
            );
          })}
          <label className="ml-auto flex items-center gap-2 text-[11px] text-muted">
            <input type="checkbox" checked={p.active} onChange={(e) => set({ ...p, active: e.target.checked })} /> Preset ativo
          </label>
        </div>

        {tab !== 'revival' ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-bold uppercase text-muted">Timeframes:</span>
              {TIMEFRAMES.map((t) => {
                const on = p.timeframes.includes(t);
                return (
                  <span key={t} className={cn('flex h-7 items-center overflow-hidden rounded-md border', editTf[tab] === t ? presetBorder[tab] : 'border-line')}>
                    <button
                      aria-label={`Monitorar ${TFL[t]}`}
                      onClick={() => set({ ...p, timeframes: on ? p.timeframes.filter((x) => x !== t) : [...p.timeframes, t] })}
                      className={cn('grid h-full w-6 place-items-center', on ? checkBg[tab] : 'bg-raised')}
                    >
                      {on && <Check size={12} strokeWidth={3} className="text-black" />}
                    </button>
                    <button onClick={() => setEditTf({ ...editTf, [tab]: t })} className={cn('num h-full px-2.5 text-[11px] font-bold', editTf[tab] === t ? cn(presetBg[tab], presetText[tab]) : 'text-muted')}>
                      {TFL[t]}
                    </button>
                  </span>
                );
              })}
              <span className="text-[10.5px] italic text-dim">(marque quais monitorar; clique no rótulo para editar a config daquele TF)</span>
            </div>
            <div className="text-[11px] text-muted">
              Editando <b className={presetText[tab]}>{TFL[tf]}</b>
              {!p.timeframes.includes(tf) && <span className="text-warn"> — este timeframe não está marcado para monitorar</span>}
            </div>
            <TfEditor key={`${tab}-${tf}`} tf={tf} cfg={p.tf[tf]} set={(c) => set({ ...p, tf: { ...p.tf, [tf]: c } })} />
          </>
        ) : (
          <RevivalEditor cfg={p.revival ?? DEFAULT_REVIVAL} set={(c) => set({ ...p, revival: c })} />
        )}
      </div>
    </Modal>
  );
}
