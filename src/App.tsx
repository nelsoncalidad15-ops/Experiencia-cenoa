import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Branch, SurveyArea, SurveyEntry, SyncState } from './types/survey';
import {
  DEFAULT_BRANCHES,
  DEFAULT_QUESTION,
  DEFAULT_THANK_YOU_SUBTITLE,
  DEFAULT_THANK_YOU_TITLE,
  inferDealershipGroup,
  slugifyBranchId,
} from './utils/surveyLogic';
import {
  createId,
  enqueue,
  fetchRemote,
  flushQueue,
  isRemoteEnabled,
  pendingCount,
  readCache,
  readQueue,
  writeCache,
} from './services/api';
import { TopBar, type AppView } from './components/TopBar';
import { BranchSelectorBar } from './components/BranchSelectorBar';
import { SurveyKiosk } from './components/SurveyKiosk';
import { DatabaseView } from './components/DatabaseView';
import { BranchesManager } from './components/BranchesManager';

const STORAGE_ACTIVE_BRANCH = 'concesionario_active_branch_v1';
const STORAGE_DB_FILTER = 'concesionario_db_filter_v1';
const STORAGE_KIOSK_LOCKED = 'concesionario_kiosk_locked_v1';
const STORAGE_KIOSK_PIN = 'concesionario_kiosk_pin_v1';

const SYNC_INTERVAL_MS = 30_000;

function readLS(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeLS(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

/** Aplica sobre los datos remotos las operaciones que todavía no se enviaron. */
function mergeWithQueue(branches: Branch[], surveys: SurveyEntry[]) {
  const queue = readQueue();
  let nextBranches = [...branches];
  let nextSurveys = [...surveys];
  for (const op of queue) {
    if (op.kind === 'saveSurvey') {
      nextSurveys = [op.payload, ...nextSurveys.filter((s) => s.id !== op.id)];
    } else if (op.kind === 'deleteSurvey') {
      nextSurveys = nextSurveys.filter((s) => s.id !== op.id);
    } else if (op.kind === 'saveBranch') {
      const exists = nextBranches.some((b) => b.id === op.id);
      nextBranches = exists
        ? nextBranches.map((b) => (b.id === op.id ? op.payload : b))
        : [...nextBranches, op.payload];
    }
  }
  nextSurveys.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { branches: nextBranches, surveys: nextSurveys };
}

export default function App() {
  const cache = useMemo(() => readCache(), []);
  const [branches, setBranches] = useState<Branch[]>(
    cache?.branches.length ? cache.branches : DEFAULT_BRANCHES
  );
  const [surveys, setSurveys] = useState<SurveyEntry[]>(cache?.surveys ?? []);
  const [sheetUrl, setSheetUrl] = useState<string | undefined>(cache?.sheetUrl);
  const [isLoading, setIsLoading] = useState(!cache);
  const [syncState, setSyncState] = useState<SyncState>(
    isRemoteEnabled() ? 'syncing' : 'local'
  );
  const [pending, setPending] = useState(pendingCount());
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);

  const [activeView, setActiveView] = useState<AppView>('survey');
  const [activeBranchId, setActiveBranchId] = useState<string>(() =>
    readLS(STORAGE_ACTIVE_BRANCH, DEFAULT_BRANCHES[0].id)
  );
  const [dbFilterBranchId, setDbFilterBranchId] = useState<string>(() =>
    readLS(STORAGE_DB_FILTER, readLS(STORAGE_ACTIVE_BRANCH, 'all'))
  );
  const [isKioskLocked, setIsKioskLocked] = useState<boolean>(
    () => readLS(STORAGE_KIOSK_LOCKED, 'false') === 'true'
  );
  const [kioskPin, setKioskPin] = useState<string>(() => readLS(STORAGE_KIOSK_PIN, ''));

  // Persistimos cache local cada vez que cambian los datos.
  const stateRef = useRef({ branches, surveys, sheetUrl });
  useEffect(() => {
    stateRef.current = { branches, surveys, sheetUrl };
    writeCache({ branches, surveys, sheetUrl });
  }, [branches, surveys, sheetUrl]);

  /** Envía pendientes y trae el estado actual del Google Sheet. */
  const syncNow = useCallback(async (opts: { pull?: boolean } = { pull: true }) => {
    if (!isRemoteEnabled()) {
      setSyncState('local');
      setPending(pendingCount());
      setIsLoading(false);
      return;
    }
    setSyncState('syncing');
    const left = await flushQueue();
    setPending(left);
    if (opts.pull !== false) {
      try {
        const remote = await fetchRemote();
        const merged = mergeWithQueue(
          remote.branches.length ? remote.branches : stateRef.current.branches,
          remote.surveys
        );
        setBranches(merged.branches);
        setSurveys(merged.surveys);
        if (remote.sheetUrl) setSheetUrl(remote.sheetUrl);
        setLastSyncAt(new Date().toISOString());
        setSyncState(left > 0 ? 'pending' : 'synced');
      } catch (err) {
        console.warn('No se pudo leer Google Sheets:', err);
        setSyncState(left > 0 ? 'pending' : 'error');
      }
    } else {
      setSyncState(left > 0 ? 'pending' : 'synced');
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    syncNow();
    const interval = window.setInterval(() => {
      // En modo tablet solo empujamos pendientes; leemos todo cuando hay panel abierto.
      syncNow({ pull: !readLS(STORAGE_KIOSK_LOCKED, 'false').includes('true') });
    }, SYNC_INTERVAL_MS);
    const onOnline = () => syncNow({ pull: false });
    window.addEventListener('online', onOnline);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('online', onOnline);
    };
  }, [syncNow]);

  const pushOps = useCallback(() => {
    setPending(pendingCount());
    void syncNow({ pull: false });
  }, [syncNow]);

  const activeBranch = useMemo(
    () => branches.find((b) => b.id === activeBranchId) ?? branches[0] ?? DEFAULT_BRANCHES[0],
    [branches, activeBranchId]
  );

  const handleSelectActiveBranch = (branchId: string) => {
    setActiveBranchId(branchId);
    setDbFilterBranchId(branchId);
    writeLS(STORAGE_ACTIVE_BRANCH, branchId);
    writeLS(STORAGE_DB_FILTER, branchId);
  };

  const handleSelectDbBranch = (branchId: string) => {
    setDbFilterBranchId(branchId);
    writeLS(STORAGE_DB_FILTER, branchId);
  };

  const handleLockKiosk = () => {
    setActiveView('survey');
    setIsKioskLocked(true);
    writeLS(STORAGE_KIOSK_LOCKED, 'true');
    document.documentElement.requestFullscreen?.().catch(() => undefined);
  };

  const handleUnlockKiosk = (pinAttempt?: string): boolean => {
    if (kioskPin && pinAttempt !== kioskPin) return false;
    setIsKioskLocked(false);
    writeLS(STORAGE_KIOSK_LOCKED, 'false');
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => undefined);
    void syncNow();
    return true;
  };

  const handleSaveKioskPin = (pin: string) => {
    setKioskPin(pin);
    writeLS(STORAGE_KIOSK_PIN, pin);
  };

  /** Guardado optimista: la tablet responde al instante y sincroniza en segundo plano. */
  const handleSubmitVote = async (rating: 1 | 2 | 3 | 4 | 5): Promise<SurveyEntry> => {
    const entry: SurveyEntry = {
      id: createId('srv'),
      branchId: activeBranch.id,
      branchName: activeBranch.name,
      rating,
      area: 'General',
      comment: '',
      tags: [],
      createdAt: new Date().toISOString(),
    };
    setSurveys((prev) => [entry, ...prev]);
    enqueue({ kind: 'saveSurvey', id: entry.id, payload: entry });
    pushOps();
    return entry;
  };

  const handleUpdateVoteDetails = async (
    surveyId: string,
    updates: { area?: SurveyArea; comment?: string; tags?: string[] }
  ) => {
    const current = stateRef.current.surveys.find((s) => s.id === surveyId);
    if (!current) return;
    const updated: SurveyEntry = {
      ...current,
      ...(updates.area ? { area: updates.area } : {}),
      ...(typeof updates.comment === 'string'
        ? { comment: updates.comment.trim().slice(0, 280) }
        : {}),
      ...(updates.tags ? { tags: updates.tags } : {}),
    };
    setSurveys((prev) => prev.map((item) => (item.id === surveyId ? updated : item)));
    enqueue({ kind: 'saveSurvey', id: surveyId, payload: updated });
    pushOps();
  };

  const handleDeleteSurvey = async (surveyId: string) => {
    setSurveys((prev) => prev.filter((item) => item.id !== surveyId));
    enqueue({ kind: 'deleteSurvey', id: surveyId });
    pushOps();
  };

  const handleCreateBranch = async (payload: { name: string; city: string }) => {
    const name = payload.name.trim().slice(0, 60);
    if (name.length < 2) throw new Error('Ingresa un nombre de sucursal válido.');
    const baseId = slugifyBranchId(name) || createId('sucursal');
    let id = baseId;
    let n = 2;
    while (branches.some((b) => b.id === id)) id = `${baseId}-${n++}`;
    const branch: Branch = {
      id,
      name,
      group: inferDealershipGroup(name),
      city: payload.city.trim().slice(0, 60) || 'Sucursal',
      question: DEFAULT_QUESTION,
      thankYouTitle: DEFAULT_THANK_YOU_TITLE,
      thankYouSubtitle: DEFAULT_THANK_YOU_SUBTITLE,
    };
    setBranches((prev) => [...prev, branch]);
    enqueue({ kind: 'saveBranch', id, payload: branch });
    pushOps();
    handleSelectActiveBranch(id);
  };

  const handleUpdateBranch = async (
    branchId: string,
    payload: { question: string; thankYouTitle: string; thankYouSubtitle: string }
  ) => {
    const current = branches.find((b) => b.id === branchId);
    if (!current) return;
    const next: Branch = {
      ...current,
      question: payload.question.trim().slice(0, 160) || current.question,
      thankYouTitle: payload.thankYouTitle.trim().slice(0, 100) || current.thankYouTitle,
      thankYouSubtitle: payload.thankYouSubtitle.trim().slice(0, 200) || current.thankYouSubtitle,
    };
    setBranches((prev) => prev.map((b) => (b.id === branchId ? next : b)));
    enqueue({ kind: 'saveBranch', id: branchId, payload: next });
    pushOps();
  };

  const kiosk = (locked: boolean) => (
    <SurveyKiosk
      branch={activeBranch}
      isKioskLocked={locked}
      hasPinConfigured={kioskPin.length > 0}
      syncState={syncState}
      pendingCount={pending}
      onUnlockKiosk={handleUnlockKiosk}
      onSubmitVote={handleSubmitVote}
      onUpdateVoteDetails={handleUpdateVoteDetails}
    />
  );

  if (isKioskLocked) {
    return <main className="flex min-h-[100dvh] flex-col">{kiosk(true)}</main>;
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <TopBar
        activeView={activeView}
        onSelectView={setActiveView}
        onLockKiosk={handleLockKiosk}
        syncState={syncState}
        pendingCount={pending}
        onSyncNow={() => syncNow()}
      />

      {activeView === 'survey' && (
        <BranchSelectorBar
          branches={branches}
          activeBranchId={activeBranch.id}
          onSelectBranch={handleSelectActiveBranch}
          contextLabel="Sucursal activa en esta tablet:"
        />
      )}

      {activeView === 'database' && (
        <BranchSelectorBar
          branches={branches}
          activeBranchId={dbFilterBranchId}
          onSelectBranch={handleSelectDbBranch}
          allowAllOption
          isAllSelected={dbFilterBranchId === 'all'}
          onSelectAll={() => handleSelectDbBranch('all')}
          contextLabel="Filtrar por concesionaria:"
        />
      )}

      <main className="flex flex-1 flex-col">
        {activeView === 'survey' && kiosk(false)}

        {activeView === 'database' && (
          <DatabaseView
            surveys={surveys}
            branches={branches}
            selectedBranchId={dbFilterBranchId}
            isLoading={isLoading}
            sheetUrl={sheetUrl}
            lastSyncAt={lastSyncAt}
            onRefresh={() => syncNow()}
            onDeleteSurvey={handleDeleteSurvey}
          />
        )}

        {activeView === 'branches' && (
          <BranchesManager
            branches={branches}
            activeBranch={activeBranch}
            kioskPin={kioskPin}
            syncState={syncState}
            onSaveKioskPin={handleSaveKioskPin}
            onSelectActiveBranch={handleSelectActiveBranch}
            onCreateBranch={handleCreateBranch}
            onUpdateBranch={handleUpdateBranch}
            onConnectionChanged={() => syncNow()}
          />
        )}
      </main>
    </div>
  );
}
