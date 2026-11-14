import { useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import type { SimulationRunStatus } from '@/types/simulation';

export type BackendHealthStatus = 'ONLINE' | 'CHECKING' | 'UNAVAILABLE';

interface AppShellProps {
  children: ReactNode;
  workerStatus?: SimulationRunStatus | 'BOOTING' | 'ERROR';
  backendStatus?: BackendHealthStatus;
}

const NAV_ITEMS = [
  { to: '/', label: '01 Overview' },
  { to: '/digital-twin', label: '02 Digital Twin' },
  { to: '/simulation', label: '03 Simulation Lab' },
  { to: '/analytics', label: '04 Performance Analytics' },
  { to: '/optimization', label: '05 Optimization Center' },
];

export function AppShell({
  children,
  workerStatus = 'READY',
  backendStatus = 'CHECKING',
}: AppShellProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const workerDotColor =
    workerStatus === 'RUNNING'
      ? 'bg-[#22C55E]'
      : workerStatus === 'FAULTED' || workerStatus === 'ERROR'
        ? 'bg-[#EF4444]'
        : workerStatus === 'PAUSED' || workerStatus === 'BOOTING'
          ? 'bg-[#F59E0B]'
          : 'bg-[#36C5D9]';

  const backendBadge =
    backendStatus === 'ONLINE'
      ? { dot: 'bg-[#22C55E]', text: 'API Online', border: 'border-[#22C55E]/30 text-[#F1F5F9]' }
      : backendStatus === 'CHECKING'
        ? { dot: 'bg-[#F59E0B]', text: 'API Checking', border: 'border-[#243242] text-[#94A3B8]' }
        : { dot: 'bg-[#F59E0B]', text: 'API Offline', border: 'border-[#F59E0B]/40 text-[#F59E0B]' };

  return (
    <div className="flex min-h-screen flex-col bg-[#0B0F14] text-[#F1F5F9]">
      <header className="sticky top-0 z-40 border-b border-[#243242] bg-[#0B0F14]/95 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-[1920px] items-center justify-between gap-4 px-4">
          <div className="flex items-center gap-3">
            <NavLink to="/" className="flex items-center gap-2.5 focus:outline-none">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
                className="shrink-0"
              >
                <rect x="2" y="2" width="20" height="20" rx="4" stroke="#36C5D9" strokeWidth="1.5" />
                <path
                  d="M7 16L11.5 7L17 16M9 13H15"
                  stroke="#F1F5F9"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="font-display text-lg font-bold tracking-[-0.02em] text-[#F1F5F9]">
                AoKira
              </span>
            </NavLink>
            <span className="hidden rounded-full border border-[#36C5D9]/35 bg-[#141B23] px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-[#36C5D9] sm:inline-flex">
              SIMULATION ONLY
            </span>
          </div>

          <nav aria-label="Primary Navigation" className="hidden items-center gap-1 lg:flex">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                    isActive
                      ? 'bg-[#1C2631] text-[#36C5D9] ring-1 ring-[#36C5D9]/40'
                      : 'text-[#94A3B8] hover:bg-[#141B23] hover:text-[#F1F5F9]'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <div
              className="hidden items-center gap-1.5 rounded-full border border-[#243242] bg-[#141B23] px-2.5 py-1 text-[11px] font-mono sm:flex"
              title="Rust/WASM Simulation Worker Status"
            >
              <span className={`h-2 w-2 rounded-full ${workerDotColor}`} />
              <span className="text-[#94A3B8]">WASM</span>
              <span className="tabular-nums text-[#F1F5F9]">{workerStatus}</span>
            </div>

            <div
              className={`flex items-center gap-1.5 rounded-full border bg-[#141B23] px-2.5 py-1 text-[11px] font-mono ${backendBadge.border}`}
              title="Python FastAPI Analytics Service Status"
            >
              <span className={`h-2 w-2 rounded-full ${backendBadge.dot}`} />
              <span>{backendBadge.text}</span>
            </div>

            <button
              type="button"
              aria-label={mobileNavOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={mobileNavOpen}
              onClick={() => setMobileNavOpen((prev) => !prev)}
              className="inline-flex items-center justify-center rounded border border-[#243242] bg-[#141B23] p-1.5 text-[#F1F5F9] hover:border-[#36C5D9]/50 lg:hidden"
            >
              {mobileNavOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {mobileNavOpen && (
          <nav
            aria-label="Mobile Navigation"
            className="border-t border-[#243242] bg-[#141B23] px-4 py-2 lg:hidden"
          >
            <div className="flex flex-col gap-1">
              {NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  onClick={() => setMobileNavOpen(false)}
                  className={({ isActive }) =>
                    `rounded px-3 py-2 text-sm font-medium ${
                      isActive
                        ? 'bg-[#1C2631] text-[#36C5D9] ring-1 ring-[#36C5D9]/40'
                        : 'text-[#94A3B8] hover:bg-[#1C2631] hover:text-[#F1F5F9]'
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </div>
          </nav>
        )}
      </header>

      <main className="flex-1">{children}</main>
    </div>
  );
}
