import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock, Radar, RefreshCw, Search, ShieldX, Users } from 'lucide-react';
import { supabase, type Profile } from '@/services/supabase';
import { useAuth } from '@/state/auth';
import { Switch, toast } from '@/ui/primitives';
import { cn } from '@/lib/cn';

type Filter = 'all' | 'pending' | 'active' | 'blocked';
const statusCls: Record<Profile['status'], string> = {
  pending: 'border-warn/50 bg-warn/10 text-warn',
  active: 'border-up/50 bg-up/10 text-up',
  blocked: 'border-down/50 bg-down/10 text-down',
};
const statusLabel: Record<Profile['status'], string> = { pending: 'pendente', active: 'ativo', blocked: 'bloqueado' };

export default function Admin() {
  const me = useAuth((s) => s.profile);
  const [rows, setRows] = useState<Profile[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [f, setF] = useState<Filter>('all');

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
    if (error) setErr(error.message);
    else setRows(data as Profile[]);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const update = async (id: string, patch: Partial<Profile>, ok: string) => {
    if (!supabase) return;
    const { error } = await supabase.from('profiles').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) return toast(`Erro: ${error.message}`);
    toast(ok);
    setRows((r) => (r ?? []).map((x) => (x.id === id ? { ...x, ...patch } : x)));
  };

  const list = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return (rows ?? []).filter((r) => (f === 'all' || r.status === f) && (!qq || (r.email ?? '').toLowerCase().includes(qq) || (r.name ?? '').toLowerCase().includes(qq)));
  }, [rows, q, f]);
  const count = (s: Profile['status']) => (rows ?? []).filter((r) => r.status === s).length;

  if (!me?.is_admin) return <div className="p-6 text-[12px] text-dim">Acesso restrito ao administrador.</div>;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-[1000px] space-y-4 p-4">
        <div className="flex items-center gap-2">
          <h1 className="text-[20px] font-bold">Painel Admin</h1>
          <button className="btn ml-auto h-8" onClick={() => void load()}>
            <RefreshCw size={13} /> Atualizar
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {[
            { l: 'Total', v: rows?.length ?? 0, icon: Users, c: 'text-fg' },
            { l: 'Ativos', v: count('active'), icon: CheckCircle2, c: 'text-up' },
            { l: 'Pendentes', v: count('pending'), icon: Clock, c: 'text-warn' },
            { l: 'Bloqueados', v: count('blocked'), icon: ShieldX, c: 'text-down' },
          ].map((x) => (
            <div key={x.l} className="rounded-lg border border-line bg-card p-3">
              <div className="label flex items-center gap-1.5">
                <x.icon size={12} /> {x.l}
              </div>
              <div className={cn('num mt-1 text-[20px] font-bold', x.c)}>{x.v}</div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-dim" />
            <input className="input pl-8" placeholder="Buscar por nome ou e-mail…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {(['all', 'pending', 'active', 'blocked'] as Filter[]).map((x) => (
            <button key={x} className={cn('tab h-8 px-3', f === x && 'tab-active')} onClick={() => setF(x)}>
              {x === 'all' ? 'Todos' : statusLabel[x]}
            </button>
          ))}
        </div>
        {err && <div className="text-[12px] text-down">{err}</div>}
        <div className="overflow-hidden rounded-lg border border-line">
          {!rows && <div className="p-4 text-[12px] text-dim">Carregando…</div>}
          {rows && !list.length && <div className="p-4 text-center text-[12px] text-dim">Nenhum usuário neste filtro.</div>}
          {list.map((r) => {
            const self = r.id === me.id;
            return (
              <div key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-card px-3 py-2.5 last:border-0">
                <div className="min-w-[180px] flex-1">
                  <div className="text-[13px] font-semibold">
                    {r.name || '—'} {r.is_admin && <span className="chip ml-1 border-primary/50 text-primary">admin</span>}
                  </div>
                  <div className="num text-[11px] text-muted">{r.email}</div>
                </div>
                <span className={cn('chip', statusCls[r.status])}>{statusLabel[r.status]}</span>
                <span className="num text-[10.5px] text-dim">{new Date(r.created_at).toLocaleDateString('pt-BR')}</span>
                <label className="flex items-center gap-1.5 text-[11px] text-muted" title="Libera a aba Operadores para este usuário">
                  <Radar size={12} /> Operadores
                  <Switch checked={r.operators_enabled} onChange={(v) => void update(r.id, { operators_enabled: v }, v ? 'Operadores liberado' : 'Operadores removido')} />
                </label>
                <div className="flex gap-1.5">
                  {r.status !== 'active' && (
                    <button className="btn h-7 border-up/50 text-up" onClick={() => void update(r.id, { status: 'active' }, r.status === 'blocked' ? 'Usuário reativado' : 'Usuário aprovado')}>
                      {r.status === 'blocked' ? 'Reativar' : 'Aprovar'}
                    </button>
                  )}
                  {r.status !== 'blocked' && !self && (
                    <button className="btn h-7 border-down/50 text-down" onClick={() => void update(r.id, { status: 'blocked' }, 'Usuário bloqueado')}>
                      Bloquear
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-[11px] text-dim">Cada usuário tem os próprios presets, Watchlist e carteiras, salvos na conta dele. A aba Operadores só aparece para quem você liberar.</p>
      </div>
    </div>
  );
}
