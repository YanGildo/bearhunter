import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download, Play, Trash2, Upload, PlugZap } from 'lucide-react';
import { useStore } from '@/state/store';
import { store as db } from '@/storage/db';
import { allSounds, forgetSoundUrl, playSound, unlockAudio, type SoundOption } from '@/services/sound';
import { collector } from '@/collector/collector';
import { DEXSCREENER_DEFAULT_BASE } from '@/adapters/dexscreener/client';
import { SourceRow } from '@/ui/Header';
import { Switch, toast } from '@/ui/primitives';
import { exportConfig, importConfig } from '@/services/backup';
import { cn } from '@/lib/cn';
import docs from '../../docs/DOCUMENTACAO.md?raw';

const TABS = [
  { k: 'sons', l: 'Sons de alerta' },
  { k: 'fontes', l: 'Fontes de dados' },
  { k: 'dados', l: 'Dados e backup' },
  { k: 'docs', l: 'Documentação' },
] as const;
type Tab = (typeof TABS)[number]['k'];
const ACCEPT = '.mp3,.wav,.ogg,.m4a,audio/mpeg,audio/wav,audio/ogg,audio/mp4';

function MuteScam() {
  const v = useStore((s) => s.prefs.muteScamSound);
  const setPrefs = useStore((s) => s.setPrefs);
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-line bg-card p-3">
      <div>
        <div className="text-[12px] font-semibold">Silenciar tokens marcados como SCAM</div>
        <div className="text-[11px] text-muted">O alerta continua aparecendo com a marca SCAM, mas não toca som nem notificação.</div>
      </div>
      <Switch checked={v} onChange={(nv) => setPrefs({ muteScamSound: nv })} />
    </div>
  );
}

function Sounds() {
  const [list, setList] = useState<SoundOption[]>([]);
  const [queue, setQueue] = useState<{ name: string; status: string }[]>([]);
  const ref = useRef<HTMLInputElement>(null);
  const reload = () => void allSounds().then(setList);
  useEffect(reload, []);
  const upload = async (files: FileList) => {
    const items = [...files].map((f) => ({ name: f.name, status: 'enviando…' }));
    setQueue(items);
    for (const [i, f] of [...files].entries()) {
      // falha de um arquivo não cancela o lote
      const ok = /\.(mp3|wav|ogg|m4a)$/i.test(f.name) && f.size < 5_000_000;
      if (ok) await db.putSound({ id: `custom:${Date.now()}-${i}`, name: f.name.replace(/\.[^.]+$/, ''), blob: f, createdAt: Date.now() });
      items[i] = { name: f.name, status: ok ? 'ok' : 'rejeitado (formato ou >5MB)' };
      setQueue([...items]);
    }
    reload();
  };
  return (
    <div className="space-y-4">
      <p className="text-[12px] text-muted">Os sons ficam salvos neste navegador. Escolha qual toca em cada preset no modal de configuração do preset.</p>
      <MuteScam />
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn h-9" onClick={() => ref.current?.click()}>
          <Upload size={14} /> Enviar sons (mp3, wav, ogg, m4a)
        </button>
        <input ref={ref} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => e.target.files && void upload(e.target.files)} />
      </div>
      {!!queue.length && (
        <div className="space-y-0.5 rounded-md border border-line bg-card p-2 text-[11px]">
          {queue.map((q, i) => (
            <div key={i} className="flex justify-between">
              <span>{q.name}</span>
              <span className={q.status === 'ok' ? 'text-up' : q.status.startsWith('rej') ? 'text-down' : 'text-muted'}>{q.status}</span>
            </div>
          ))}
        </div>
      )}
      <div className="divide-y divide-line rounded-lg border border-line bg-card">
        {list.map((s) => (
          <div key={s.id} className="flex items-center gap-2 px-3 py-2">
            <span className="flex-1 text-[12px]">{s.name}</span>
            {s.builtin && <span className="chip border-line text-dim">embutido</span>}
            <button
              className="btn-ghost"
              onClick={() => {
                unlockAudio();
                void playSound(s.id, 0.7);
              }}
            >
              <Play size={13} />
            </button>
            {!s.builtin && (
              <button
                className="btn-ghost hover:text-down"
                onClick={async () => {
                  await db.deleteSound(s.id);
                  forgetSoundUrl(s.id);
                  reload();
                }}
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Sources() {
  const prefs = useStore((s) => s.prefs);
  const setPrefs = useStore((s) => s.setPrefs);
  const health = useStore((s) => s.health);
  const [base, setBase] = useState(prefs.dsBaseUrl);
  const [testing, setTesting] = useState<string | null>(null);
  const test = async () => {
    setTesting('testando…');
    try {
      const r = await collector.ds.fetchTokens(['So11111111111111111111111111111111111111112']);
      setTesting(`OK — DexScreener respondeu (${r.observations.length + r.missing.length} token)`);
    } catch (e) {
      setTesting(`Falhou: ${(e as Error).message}`);
    }
  };
  const row = (label: string, desc: string, v: boolean, k: 'discoverNew' | 'discoverMigrations' | 'discoverTrending') => (
    <div className="flex items-center justify-between gap-4 border-b border-line py-2.5 last:border-0">
      <div>
        <div className="text-[12px] font-semibold">{label}</div>
        <div className="text-[11px] text-muted">{desc}</div>
      </div>
      <Switch
        checked={v}
        onChange={(nv) => {
          setPrefs({ [k]: nv });
          setTimeout(() => collector.applyDiscoveryPrefs(), 0);
        }}
      />
    </div>
  );
  return (
    <div className="space-y-5">
      <div className="grid gap-2 md:grid-cols-2">
        {health.length ? health.map((h) => <SourceRow key={h.id} h={h} />) : <div className="text-[12px] text-dim">Clique em START no Dashboard para ver o estado das fontes.</div>}
      </div>
      <div className="rounded-lg border border-line bg-card p-3">
        <div className="label mb-1">Descoberta de tokens</div>
        {row('PumpPortal — tokens novos', 'Canal gratuito subscribeNewToken. Cada token novo da Pump.fun entra na lista e sai sozinho se não ganhar tração.', prefs.discoverNew, 'discoverNew')}
        {row('PumpPortal — migrações', 'Canal gratuito subscribeMigration. Tokens que saem da bonding curve para o PumpSwap.', prefs.discoverMigrations, 'discoverMigrations')}
        {row('DexScreener — destaques', 'Boosts e perfis recentes da Solana, a cada 3 minutos (equivale ao Load Top Solana).', prefs.discoverTrending, 'discoverTrending')}
        <div className="flex items-center justify-between gap-4 pt-2.5">
          <div>
            <div className="text-[12px] font-semibold">Tempo de vida do token novo sem tração</div>
            <div className="text-[11px] text-muted">Depois disso, token novo com menos de $1K de volume em 5m sai da lista.</div>
          </div>
          <input className="input num h-8 w-20 text-right" type="number" min={2} max={120} value={prefs.newTokenMinutes} onChange={(e) => setPrefs({ newTokenMinutes: Math.max(2, Number(e.target.value) || 10) })} />
        </div>
      </div>
      <div className="space-y-2 rounded-lg border border-line bg-card p-3">
        <div className="label">Endereço da API do DexScreener</div>
        <p className="text-[11px] text-muted">Padrão: {DEXSCREENER_DEFAULT_BASE}. Se o navegador bloquear as chamadas (erro de CORS), publique o proxy gratuito em <code className="num">proxy/worker.js</code> no Cloudflare Workers e cole a URL dele aqui.</p>
        <div className="flex flex-wrap gap-2">
          <input className="input num flex-1" value={base} onChange={(e) => setBase(e.target.value)} />
          <button
            className="btn h-8"
            onClick={() => {
              setPrefs({ dsBaseUrl: base.trim() || DEXSCREENER_DEFAULT_BASE });
              toast('Endereço salvo');
            }}
          >
            Salvar
          </button>
          <button className="btn h-8" onClick={test}>
            <PlugZap size={13} /> Testar
          </button>
        </div>
        {testing && <div className={cn('text-[11px]', testing.startsWith('OK') ? 'text-up' : testing.startsWith('Falhou') ? 'text-down' : 'text-muted')}>{testing}</div>}
      </div>
    </div>
  );
}

function Data() {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-3">
      <p className="text-[12px] text-muted">Tudo fica neste navegador: presets, Watchlist, pastas, My Alerts, alertas e snapshots. Exporte para levar para outro computador.</p>
      <div className="flex flex-wrap gap-2">
        <button className="btn h-9" onClick={exportConfig}>
          <Download size={14} /> Exportar configurações
        </button>
        <button className="btn h-9" onClick={() => ref.current?.click()}>
          <Upload size={14} /> Importar configurações
        </button>
        <input
          ref={ref}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) toast((await importConfig(f)) ? 'Configurações importadas' : 'Arquivo inválido');
            e.target.value = '';
          }}
        />
      </div>
      <div className="flex flex-wrap gap-2 pt-2">
        <button className="btn h-9 border-down/40 text-down" onClick={() => void collector.clearAlerts().then(() => toast('Alertas apagados'))}>
          <Trash2 size={14} /> Apagar todos os alertas
        </button>
        <button className="btn h-9 border-down/40 text-down" onClick={() => void db.clearSnapshots().then(() => toast('Snapshots apagados'))}>
          <Trash2 size={14} /> Apagar snapshots salvos
        </button>
      </div>
    </div>
  );
}

function Docs() {
  const download = () => {
    const blob = new Blob([docs], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'bearhunter-documentacao.md';
    a.click();
  };
  return (
    <div className="space-y-3">
      <button className="btn h-9" onClick={download}>
        <Download size={14} /> Baixar documentação (.md)
      </button>
      <pre className="whitespace-pre-wrap rounded-lg border border-line bg-card p-4 font-sans text-[12px] leading-relaxed text-fg/85">{docs}</pre>
    </div>
  );
}

export default function Settings() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'sons';
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-[980px] space-y-4 p-4">
        <h1 className="text-[20px] font-bold">Configurações</h1>
        <div className="flex flex-wrap gap-1 border-b border-line pb-2">
          {TABS.map((t) => (
            <button key={t.k} className={cn('tab h-8 px-3 text-[11px] font-bold uppercase tracking-wider', tab === t.k && 'tab-active')} onClick={() => setParams({ tab: t.k })}>
              {t.l}
            </button>
          ))}
        </div>
        {tab === 'sons' && <Sounds />}
        {tab === 'fontes' && <Sources />}
        {tab === 'dados' && <Data />}
        {tab === 'docs' && <Docs />}
      </div>
    </div>
  );
}
