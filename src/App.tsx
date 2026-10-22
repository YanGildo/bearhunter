import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import History from './pages/History';
import Settings from './pages/Settings';
import Operators from './pages/Operators';
import { OperatorToaster } from './ui/OperatorToaster';
import { operatorTracker } from './operators/tracker';
import { StatusRow, TopNav } from './ui/Header';
import { PresetBar } from './ui/PresetBar';
import { ControlBar } from './ui/ControlBar';
import { PresetModal } from './ui/PresetModal';
import { ChartModal } from './ui/context/ContextPanel';
import { Toaster } from './ui/primitives';
import { collector } from './collector/collector';
import { unlockAudio } from './services/sound';
import Admin from './pages/Admin';
import { LoadingPage, LoginPage, PendingPage } from './pages/Login';
import { operatorsAllowed, useAuth } from './state/auth';
import { AUTH_ENABLED } from './services/supabase';
import { startCloudSync } from './services/cloudSync';

function Shell() {
  const loc = useLocation();
  useAuth((s) => s.profile);
  useEffect(() => {
    // Coleta começa ao abrir o painel (como no projeto antigo). STOP pausa.
    operatorTracker.allowedForUser = operatorsAllowed;
    operatorTracker.init();
    void collector.start().then(() => operatorTracker.start());
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
  }, []);
  const dash = loc.pathname.startsWith('/dashboard');
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <TopNav />
      {dash && (
        <>
          <StatusRow />
          <PresetBar />
          <ControlBar />
        </>
      )}
      <Routes>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/history" element={<History />} />
        <Route path="/operadores" element={operatorsAllowed() ? <Operators /> : <Navigate to="/dashboard" replace />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
      <PresetModal />
      <ChartModal />
      <OperatorToaster />
      <Toaster />
    </div>
  );
}

export default function App() {
  const status = useAuth((s) => s.status);
  const uid = useAuth((s) => s.session?.user.id);
  const error = useAuth((s) => s.error);
  const [synced, setSynced] = useState(!AUTH_ENABLED);
  useEffect(() => {
    void useAuth.getState().init();
  }, []);
  useEffect(() => {
    if (status === 'active' && uid && !synced) {
      // no máximo 10s esperando a nuvem; se demorar, abre com o que está neste navegador
      const t = setTimeout(() => setSynced(true), 10000);
      void startCloudSync(uid).finally(() => {
        clearTimeout(t);
        setSynced(true);
      });
    }
  }, [status, uid, synced]);
  if (status === 'loading') return <LoadingPage />;
  if (status === 'signedOut') return <LoginPage />;
  if (status === 'pending') return <PendingPage />;
  if (status === 'blocked') return <PendingPage blocked />;
  if (status === 'error')
    return (
      <LoadingPage
        text={`Não foi possível entrar: ${error ?? ''}. Se houver outra aba do BearHunter aberta, feche-a e tente de novo.`}
        onRetry={() => void useAuth.getState().init()}
      />
    );
  if (!synced) return <LoadingPage text="Carregando suas configurações…" />;
  return (
    <BrowserRouter>
      <Shell />
    </BrowserRouter>
  );
}
