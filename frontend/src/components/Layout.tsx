import { useEffect, useState } from 'react';
import { Outlet, useNavigate } from 'react-router';
import { ApprovalBell } from './ApprovalBell';
import { Sidebar } from './Sidebar/Sidebar';
import { SystemPulse } from './SystemPulse';
import { useAppStore } from '../lib/store';
import { checkHealth } from '../lib/api';

export function Layout() {
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const [apiReachable, setApiReachable] = useState<boolean | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let unmounted = false;

    const check = async () => {
      try {
        const reachable = await checkHealth();
        if (!unmounted) {
          setApiReachable(reachable);
          // If reachable, check again in 30s. If unreachable, retry in 3s so the banner clears as soon as the backend is up.
          timer = setTimeout(check, reachable ? 30000 : 3000);
        }
      } catch {
        if (!unmounted) {
          setApiReachable(false);
          timer = setTimeout(check, 3000);
        }
      }
    };

    check();
    const onFocus = () => {
      clearTimeout(timer);
      check();
    };
    window.addEventListener('focus', onFocus);
    return () => {
      unmounted = true;
      clearTimeout(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  const navigate = useNavigate();

  return (
    <div className="flex flex-col h-full w-full overflow-hidden relative" style={{ paddingTop: '3px' }}>
      <div className="hud-backdrop" aria-hidden="true" />
      <SystemPulse apiReachable={apiReachable} />
      <ApprovalBell />

      {/* Health check banner */}
      {apiReachable === false && (
        <div
          className="flex items-center gap-3 px-4 py-2 text-sm shrink-0"
          style={{
            background: 'color-mix(in srgb, var(--color-error) 8%, transparent)',
            borderBottom: '1px solid color-mix(in srgb, var(--color-error) 15%, transparent)',
            color: 'var(--color-text)',
          }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{ background: 'var(--color-error)' }}
          />
          <span>Cannot reach Friday backend</span>
          <button
            onClick={() => navigate('/settings')}
            className="text-sm underline cursor-pointer ml-auto shrink-0"
            style={{ color: 'var(--color-accent)' }}
          >
            Change URL
          </button>
        </div>
      )}

      <div className="flex flex-1 min-h-0 relative z-10" style={{ background: '#0D0E12' }}>
        <Sidebar />
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-20 bg-black/40 md:hidden"
            onClick={() => useAppStore.getState().setSidebarOpen(false)}
          />
        )}
        <main
          className="flex-1 flex flex-col min-w-0 h-full relative overflow-hidden transition-all duration-200"
          style={{
            background: 'var(--color-bg)',
            borderTopLeftRadius: '24px',
            borderBottomLeftRadius: '24px',
            boxShadow: '-4px 0 24px rgba(0, 0, 0, 0.25)',
          }}
        >
          <div className="flex-1 flex flex-col min-w-0 min-h-0 relative z-[2]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
