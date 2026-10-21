import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import History from './pages/History';
import Settings from './pages/Settings';
import { StatusRow, TopNav } from './ui/Header';
import { PresetBar } from './ui/PresetBar';
import { ControlBar } from './ui/ControlBar';
import { PresetModal } from './ui/PresetModal';
import { ChartModal } from './ui/context/ContextPanel';
import { Toaster } from './ui/primitives';
import { collector } from './collector/collector';
import { unlockAudio } from './services/sound';

function Shell() {
  const loc = useLocation();
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
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
      <PresetModal />
      <ChartModal />
      <Toaster />
    </div>
  );
}

export default function App() {
  useEffect(() => {
    // Coleta começa ao abrir o painel (como no projeto antigo). STOP pausa.
    void collector.start();
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
  }, []);
  return (
    <BrowserRouter>
      <Shell />
    </BrowserRouter>
  );
}
