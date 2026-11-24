import { Lock, RefreshCw } from 'lucide-react';
import type { SyncState } from '../types/survey';

export type AppView = 'survey' | 'database' | 'branches';

interface TopBarProps {
  activeView: AppView;
  onSelectView: (view: AppView) => void;
  onLockKiosk: () => void;
  syncState: SyncState;
  pendingCount: number;
  onSyncNow: () => void;
}

const SYNC_LABEL: Record<SyncState, { dot: string; text: string }> = {
  local: { dot: 'bg-slate-300', text: 'Modo local (sin Sheets)' },
  synced: { dot: 'bg-emerald-500', text: 'Google Sheets conectado' },
  syncing: { dot: 'bg-sky-500 animate-pulse', text: 'Sincronizando…' },
  pending: { dot: 'bg-amber-500', text: 'Pendientes de envío' },
  error: { dot: 'bg-rose-500', text: 'Sin conexión' },
};

export function TopBar({
  activeView,
  onSelectView,
  onLockKiosk,
  syncState,
  pendingCount,
  onSyncNow,
}: TopBarProps) {
  const navItems: { id: AppView; label: string }[] = [
    { id: 'survey', label: 'Encuesta' },
    { id: 'database', label: 'Resultados' },
    { id: 'branches', label: 'Configuración' },
  ];
  const sync = SYNC_LABEL[syncState];

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <a
          href="#encuesta"
          onClick={(e) => {
            e.preventDefault();
            onSelectView('survey');
          }}
          className="flex items-center gap-2.5 shrink-0"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 font-display text-sm font-bold text-amber-300">
            ★
          </span>
          <span className="hidden flex-col leading-tight sm:flex">
            <span className="font-display text-sm font-semibold tracking-tight text-slate-900">
              Experiencia CENOA
            </span>
            <span className="text-[11px] text-slate-500">Encuestas de satisfacción</span>
          </span>
        </a>

        <nav
          aria-label="Navegación principal"
          className="flex items-center gap-1 rounded-xl bg-slate-100 p-1"
        >
          {navItems.map((item) => {
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectView(item.id)}
                className={`min-h-[36px] rounded-lg px-3 py-1.5 text-xs font-medium transition-all whitespace-nowrap cursor-pointer sm:px-4 sm:text-sm ${
                  isActive
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onSyncNow}
            title={sync.text}
            className="hidden min-h-[36px] items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-600 hover:bg-slate-50 cursor-pointer md:inline-flex"
          >
            <span className={`h-2 w-2 rounded-full ${sync.dot}`} aria-hidden="true" />
            <span>
              {sync.text}
              {pendingCount > 0 ? ` (${pendingCount})` : ''}
            </span>
            <RefreshCw
              className={`h-3.5 w-3.5 text-slate-400 ${syncState === 'syncing' ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
          </button>
          <button
            type="button"
            onClick={onLockKiosk}
            className="inline-flex min-h-[36px] items-center gap-2 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-slate-800 whitespace-nowrap cursor-pointer sm:text-sm"
          >
            <Lock className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Modo tablet</span>
          </button>
        </div>
      </div>
    </header>
  );
}
