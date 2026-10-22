import { useState } from 'react';
import { Clock, LogOut, RefreshCw, ShieldX } from 'lucide-react';
import { useAuth } from '@/state/auth';
import { BrandLogo } from '@/ui/Header';
import { cn } from '@/lib/cn';

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid h-full place-items-center overflow-y-auto bg-bg p-4">
      <div className="w-full max-w-[400px] rounded-xl border border-line bg-panel p-6 shadow-2xl">
        <div className="mb-5 flex justify-center">
          <BrandLogo />
        </div>
        {children}
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

export function LoginPage() {
  const { signIn, signUp, signInGoogle } = useAuth();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setInfo(null);
    const r = mode === 'in' ? await signIn(email, pw) : await signUp(name, email, pw);
    setBusy(false);
    if (r) setErr(r);
    else if (mode === 'up') setInfo('Conta criada! Ela fica aguardando a aprovação do administrador.');
  };

  return (
    <Shell>
      <div className="mb-4 grid grid-cols-2 rounded-md border border-line p-0.5">
        {(['in', 'up'] as const).map((m) => (
          <button key={m} className={cn('h-8 rounded text-[12px] font-bold', mode === m ? 'bg-primary/20 text-primary' : 'text-muted')} onClick={() => setMode(m)}>
            {m === 'in' ? 'Entrar' : 'Criar conta'}
          </button>
        ))}
      </div>
      <form className="space-y-2.5" onSubmit={submit}>
        {mode === 'up' && <input className="input h-9" placeholder="Seu nome" value={name} onChange={(e) => setName(e.target.value)} required />}
        <input className="input h-9" type="email" placeholder="E-mail" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input className="input h-9" type="password" placeholder="Senha (mín. 6 caracteres)" autoComplete={mode === 'in' ? 'current-password' : 'new-password'} value={pw} onChange={(e) => setPw(e.target.value)} required minLength={6} />
        {err && <div className="text-[12px] text-down">{err}</div>}
        {info && <div className="text-[12px] text-up">{info}</div>}
        <button className="btn h-9 w-full justify-center border-primary/60 bg-primary/20 text-[12px] text-primary" disabled={busy}>
          {busy ? 'Aguarde…' : mode === 'in' ? 'Entrar' : 'Criar conta'}
        </button>
      </form>
      <div className="my-4 flex items-center gap-3 text-[11px] text-dim">
        <span className="h-px flex-1 bg-line" /> ou <span className="h-px flex-1 bg-line" />
      </div>
      <button
        className="btn h-9 w-full justify-center text-[12px]"
        onClick={async () => {
          const r = await signInGoogle();
          if (r) setErr(r);
        }}
      >
        <GoogleIcon /> Continuar com Google
      </button>
      <p className="mt-4 text-center text-[11px] text-dim">Novas contas precisam ser aprovadas pelo administrador antes do primeiro acesso.</p>
      <p className="mt-2 text-center text-[11px] text-dim">
        <a className="underline hover:text-fg" href="/privacidade.html">Privacidade</a> ·{' '}
        <a className="underline hover:text-fg" href="/termos.html">Termos de uso</a>
      </p>
    </Shell>
  );
}

export function PendingPage({ blocked }: { blocked?: boolean }) {
  const { profile, session, refreshProfile, signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  return (
    <Shell>
      <div className="space-y-3 text-center">
        <div className={cn('mx-auto grid h-12 w-12 place-items-center rounded-full', blocked ? 'bg-down/15 text-down' : 'bg-warn/15 text-warn')}>{blocked ? <ShieldX size={22} /> : <Clock size={22} />}</div>
        <h1 className="text-[16px] font-bold">{blocked ? 'Acesso bloqueado' : 'Aguardando aprovação'}</h1>
        <p className="text-[12px] text-muted">
          {blocked
            ? 'Sua conta foi bloqueada pelo administrador.'
            : 'Sua conta foi criada. Assim que o administrador aprovar, o acesso é liberado — clique em "Verificar" para conferir.'}
        </p>
        <p className="num text-[11px] text-dim">{profile?.email ?? session?.user.email}</p>
        <div className="flex justify-center gap-2 pt-1">
          {!blocked && (
            <button
              className="btn h-8"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                await refreshProfile();
                setBusy(false);
              }}
            >
              <RefreshCw size={13} /> Verificar
            </button>
          )}
          <button className="btn h-8" onClick={() => void signOut()}>
            <LogOut size={13} /> Sair
          </button>
        </div>
      </div>
    </Shell>
  );
}

export function LoadingPage({ text = 'Carregando…', onRetry }: { text?: string; onRetry?: () => void }) {
  return (
    <div className="grid h-full place-items-center bg-bg p-4">
      <div className="flex max-w-[420px] flex-col items-center gap-3 text-center">
        <BrandLogo />
        <div className="text-[12px] text-muted">{text}</div>
        {onRetry && (
          <button className="btn h-8" onClick={onRetry}>
            <RefreshCw size={13} /> Tentar novamente
          </button>
        )}
      </div>
    </div>
  );
}
