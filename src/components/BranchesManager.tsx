import { useEffect, useState } from 'react';
import { Check, Plus, Shield, Sheet, Loader2 } from 'lucide-react';
import type { Branch, SyncState } from '../types/survey';
import { DealershipLogo } from './DealershipLogo';
import { fetchRemote, getEnvScriptUrl, getScriptUrl, setScriptUrl } from '../services/api';

interface BranchesManagerProps {
  branches: Branch[];
  activeBranch: Branch;
  kioskPin: string;
  syncState: SyncState;
  onSaveKioskPin: (pin: string) => void;
  onSelectActiveBranch: (branchId: string) => void;
  onCreateBranch: (payload: { name: string; city: string }) => Promise<void>;
  onUpdateBranch: (
    branchId: string,
    payload: { question: string; thankYouTitle: string; thankYouSubtitle: string }
  ) => Promise<void>;
  onConnectionChanged: () => void;
}

function ConnectionCard({
  syncState,
  onConnectionChanged,
}: {
  syncState: SyncState;
  onConnectionChanged: () => void;
}) {
  const [url, setUrl] = useState(getScriptUrl());
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const envUrl = getEnvScriptUrl();

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (trimmed && !/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(trimmed)) {
      setResult({ ok: false, msg: 'La URL debe terminar en /exec (Implementación de Apps Script).' });
      return;
    }
    setTesting(true);
    setResult(null);
    try {
      if (trimmed) {
        const snap = await fetchRemote(trimmed);
        setResult({
          ok: true,
          msg: `Conectado: ${snap.branches.length} sucursales y ${snap.surveys.length} encuestas.`,
        });
      } else {
        setResult({ ok: true, msg: envUrl ? 'Se usará la URL por defecto del sitio.' : 'Modo local activado.' });
      }
      setScriptUrl(trimmed === envUrl ? '' : trimmed);
      onConnectionChanged();
    } catch (err) {
      setResult({
        ok: false,
        msg: `No se pudo conectar (${err instanceof Error ? err.message : 'error'}). Revisá que la implementación tenga acceso "Cualquier persona".`,
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6">
      <div className="flex items-center gap-2">
        <Sheet className="h-4 w-4 text-emerald-600" aria-hidden="true" />
        <h2 className="font-display text-sm font-semibold text-slate-900">Conexión con Google Sheets</h2>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Pegá la URL del Web App de Apps Script (termina en <code>/exec</code>).
        {syncState === 'synced' && <span className="ml-1 font-medium text-emerald-700">● Conectado</span>}
        {syncState === 'error' && <span className="ml-1 font-medium text-rose-700">● Sin conexión</span>}
      </p>
      <form onSubmit={handleSave} className="mt-4 space-y-3">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://script.google.com/macros/s/…/exec"
          className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs text-slate-900 focus:border-slate-900 focus:outline-none"
        />
        <button
          type="submit"
          disabled={testing}
          className="inline-flex min-h-[40px] w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-60 cursor-pointer"
        >
          {testing && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
          {testing ? 'Probando conexión…' : 'Guardar y probar conexión'}
        </button>
        {result && (
          <p
            role="status"
            className={`text-xs font-medium ${result.ok ? 'text-emerald-700' : 'text-rose-700'}`}
          >
            {result.msg}
          </p>
        )}
      </form>
    </div>
  );
}

export function BranchesManager({
  branches,
  activeBranch,
  kioskPin,
  syncState,
  onSaveKioskPin,
  onSelectActiveBranch,
  onCreateBranch,
  onUpdateBranch,
  onConnectionChanged,
}: BranchesManagerProps) {
  const [question, setQuestion] = useState(activeBranch.question);
  const [thankYouTitle, setThankYouTitle] = useState(activeBranch.thankYouTitle);
  const [thankYouSubtitle, setThankYouSubtitle] = useState(activeBranch.thankYouSubtitle);
  const [savingBranch, setSavingBranch] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);

  const [newName, setNewName] = useState('');
  const [newCity, setNewCity] = useState('');
  const [creatingBranch, setCreatingBranch] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [pinDraft, setPinDraft] = useState(kioskPin);
  const [pinSaved, setPinSaved] = useState(false);

  useEffect(() => {
    setQuestion(activeBranch.question);
    setThankYouTitle(activeBranch.thankYouTitle);
    setThankYouSubtitle(activeBranch.thankYouSubtitle);
    setSavedMsg(false);
  }, [activeBranch]);

  const handleSaveBranchText = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim() || !thankYouTitle.trim()) return;
    setSavingBranch(true);
    try {
      await onUpdateBranch(activeBranch.id, {
        question: question.trim(),
        thankYouTitle: thankYouTitle.trim(),
        thankYouSubtitle: thankYouSubtitle.trim(),
      });
      setSavedMsg(true);
      window.setTimeout(() => setSavedMsg(false), 2500);
    } finally {
      setSavingBranch(false);
    }
  };

  const handleAddBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newName.trim().length < 2) {
      setCreateError('Ingresa el nombre de la concesionaria.');
      return;
    }
    setCreateError(null);
    setCreatingBranch(true);
    try {
      await onCreateBranch({ name: newName.trim(), city: newCity.trim() });
      setNewName('');
      setNewCity('');
    } catch (err) {
      setCreateError(
        err instanceof Error ? err.message : 'No se pudo crear la sucursal.'
      );
    } finally {
      setCreatingBranch(false);
    }
  };

  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveKioskPin(pinDraft.trim());
    setPinSaved(true);
    window.setTimeout(() => setPinSaved(false), 2500);
  };

  return (
    <section
      aria-label="Configuración de sucursales y tablet"
      className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8"
    >
      <div>
        <h1 className="font-display text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
          Sucursales y Terminal Tablet
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          La sucursal seleccionada queda guardada en esta tablet para uso diario continuo sin cerrarse.
        </p>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left: Edit active branch copy */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 lg:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div className="flex items-center gap-3">
              <DealershipLogo branch={activeBranch} size="sm" />
              <span className="text-xs text-slate-400">· {activeBranch.city}</span>
            </div>
            <span className="text-xs font-medium text-amber-700">Sucursal activa</span>
          </div>

          <form onSubmit={handleSaveBranchText} className="mt-5 space-y-4">
            <div>
              <label
                htmlFor="branch-question-input"
                className="block text-xs font-medium text-slate-700"
              >
                Pregunta principal en pantalla
              </label>
              <input
                id="branch-question-input"
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                required
                maxLength={160}
                className="mt-1.5 w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="branch-thanks-title"
                  className="block text-xs font-medium text-slate-700"
                >
                  Título al votar
                </label>
                <input
                  id="branch-thanks-title"
                  type="text"
                  value={thankYouTitle}
                  onChange={(e) => setThankYouTitle(e.target.value)}
                  required
                  maxLength={100}
                  className="mt-1.5 w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="branch-thanks-sub"
                  className="block text-xs font-medium text-slate-700"
                >
                  Mensaje de agradecimiento
                </label>
                <input
                  id="branch-thanks-sub"
                  type="text"
                  value={thankYouSubtitle}
                  onChange={(e) => setThankYouSubtitle(e.target.value)}
                  maxLength={200}
                  className="mt-1.5 w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={savingBranch}
                className="min-h-[40px] rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-60 cursor-pointer"
              >
                {savingBranch ? 'Guardando...' : 'Guardar textos de sucursal'}
              </button>

              {savedMsg && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  Cambios guardados
                </span>
              )}
            </div>
          </form>

          {/* List of branches quick switch */}
          <div className="mt-8 border-t border-slate-100 pt-5">
            <h2 className="font-display text-sm font-semibold text-slate-900">
              Concesionarias disponibles ({branches.length})
            </h2>
            <div className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200">
              {branches.map((branch) => {
                const isCurrent = branch.id === activeBranch.id;
                return (
                  <div
                    key={branch.id}
                    className="flex items-center justify-between gap-3 px-4 py-3"
                  >
                    <div>
                      <div className="text-sm font-medium text-slate-900">{branch.name}</div>
                      <div className="text-xs text-slate-500">{branch.city}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onSelectActiveBranch(branch.id)}
                      className={`min-h-[36px] rounded-lg px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                        isCurrent
                          ? 'bg-amber-50 text-amber-800 ring-1 ring-amber-300'
                          : 'border border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {isCurrent ? 'Activa en esta tablet' : 'Usar en esta tablet'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right: Add branch & Kiosk PIN */}
        <div className="space-y-6">
          <ConnectionCard syncState={syncState} onConnectionChanged={onConnectionChanged} />

          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="font-display text-sm font-semibold text-slate-900">
              Agregar nueva sucursal
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Suma otro punto de atención al selector persistente y a la base de datos.
            </p>

            <form onSubmit={handleAddBranch} className="mt-4 space-y-3">
              <div>
                <label htmlFor="new-branch-name" className="block text-xs font-medium text-slate-700">
                  Nombre de la concesionaria
                </label>
                <input
                  id="new-branch-name"
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Ej: Autosol Tartagal"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="new-branch-city" className="block text-xs font-medium text-slate-700">
                  Ciudad / Ubicación
                </label>
                <input
                  id="new-branch-city"
                  type="text"
                  value={newCity}
                  onChange={(e) => setNewCity(e.target.value)}
                  placeholder="Ej: Tartagal, Salta"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
                />
              </div>

              {createError && (
                <p role="alert" className="text-xs font-medium text-rose-700">
                  {createError}
                </p>
              )}

              <button
                type="submit"
                disabled={creatingBranch}
                className="inline-flex min-h-[40px] w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-60 cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{creatingBranch ? 'Agregando...' : 'Agregar sucursal'}</span>
              </button>
            </form>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-amber-700" aria-hidden="true" />
              <h2 className="font-display text-sm font-semibold text-slate-900">
                PIN de desbloqueo en tablet (opcional)
              </h2>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Si configuras un PIN, se solicitará al salir del modo "Fijar en Tablet" para evitar cambios accidentales de los clientes.
            </p>

            <form onSubmit={handlePinSubmit} className="mt-4 space-y-3">
              <div>
                <label htmlFor="pin-setting-input" className="block text-xs font-medium text-slate-700">
                  PIN (dejar vacío para desbloqueo directo)
                </label>
                <input
                  id="pin-setting-input"
                  type="text"
                  inputMode="numeric"
                  maxLength={8}
                  value={pinDraft}
                  onChange={(e) => setPinDraft(e.target.value)}
                  placeholder="Ej: 1234"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm tracking-widest text-slate-900 focus:border-slate-900 focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  className="min-h-[40px] rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-900 hover:bg-slate-50 cursor-pointer"
                >
                  Guardar PIN
                </button>
                {pinSaved && (
                  <span className="text-xs font-medium text-emerald-700">
                    PIN actualizado
                  </span>
                )}
              </div>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}
