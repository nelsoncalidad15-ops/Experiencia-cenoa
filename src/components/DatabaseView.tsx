import { useMemo, useState } from 'react';
import { Check, Copy, Download, ExternalLink, RefreshCw, Search, Star, Trash2 } from 'lucide-react';
import type { Branch, SurveyEntry } from '../types/survey';
import {
  computeBranchStats,
  filterSurveys,
  formatCsv,
  formatDateTimeEs,
  formatTsvForSheets,
  getRatingLabel,
} from '../utils/surveyLogic';

interface DatabaseViewProps {
  surveys: SurveyEntry[];
  branches: Branch[];
  selectedBranchId: string;
  isLoading: boolean;
  sheetUrl?: string;
  lastSyncAt?: string | null;
  onRefresh?: () => void;
  onDeleteSurvey: (id: string) => Promise<void>;
}

const STAR_LEVELS: Array<5 | 4 | 3 | 2 | 1> = [5, 4, 3, 2, 1];

export function DatabaseView({
  surveys,
  branches,
  selectedBranchId,
  isLoading,
  sheetUrl,
  lastSyncAt,
  onRefresh,
  onDeleteSurvey,
}: DatabaseViewProps) {
  const [ratingFilter, setRatingFilter] = useState<number | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedFeedback, setCopiedFeedback] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<SurveyEntry | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const selectedBranchName = useMemo(() => {
    if (selectedBranchId === 'all') return 'Todas las sucursales';
    return branches.find((b) => b.id === selectedBranchId)?.name ?? 'Sucursal';
  }, [branches, selectedBranchId]);

  const stats = useMemo(
    () => computeBranchStats(surveys, selectedBranchId),
    [surveys, selectedBranchId]
  );

  const filteredSurveys = useMemo(
    () =>
      filterSurveys(surveys, {
        branchId: selectedBranchId,
        ratingFilter,
        searchQuery,
      }),
    [surveys, selectedBranchId, ratingFilter, searchQuery]
  );

  const handleDownloadCsv = () => {
    const csvContent = formatCsv(filteredSurveys);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const dateSlug = new Date().toISOString().slice(0, 10);
    const branchSlug = selectedBranchId === 'all' ? 'todas' : selectedBranchId;
    link.href = url;
    link.download = `encuestas-${branchSlug}-${dateSlug}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleCopyForSheets = async () => {
    const tsv = formatTsvForSheets(filteredSurveys);
    try {
      await navigator.clipboard.writeText(tsv);
      setCopiedFeedback(true);
      window.setTimeout(() => setCopiedFeedback(false), 3000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = tsv;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopiedFeedback(true);
      window.setTimeout(() => setCopiedFeedback(false), 3000);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setIsDeleting(true);
    try {
      await onDeleteSurvey(pendingDelete.id);
      setPendingDelete(null);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <section
      aria-label="Base de datos de encuestas"
      className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            Resultados · {selectedBranchName}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {lastSyncAt
              ? `Sincronizado con Google Sheets · ${formatDateTimeEs(lastSyncAt)}`
              : 'Registros de encuestas por concesionaria.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap cursor-pointer"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Actualizar</span>
            </button>
          )}
          {sheetUrl && (
            <a
              href={sheetUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-medium text-emerald-800 transition-colors hover:bg-emerald-100 whitespace-nowrap"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Abrir Google Sheet</span>
            </a>
          )}
          <button
            type="button"
            onClick={handleCopyForSheets}
            disabled={filteredSurveys.length === 0}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
          >
            {copiedFeedback ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                <span className="text-emerald-700">Copiado para Google Sheets</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Copiar para Sheets</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleDownloadCsv}
            disabled={filteredSurveys.length === 0}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Exportar CSV</span>
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="mt-6 grid grid-cols-2 divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white sm:grid-cols-4 sm:divide-x sm:divide-y-0">
        <div className="p-4 sm:p-5">
          <div className="text-xs font-medium text-slate-500">Total encuestas</div>
          <div className="mt-1.5 font-display text-2xl font-semibold tracking-tight text-slate-900 tabular-nums">
            {stats.total}
          </div>
        </div>

        <div className="p-4 sm:p-5">
          <div className="text-xs font-medium text-slate-500">Calificación promedio</div>
          <div className="mt-1.5 flex items-baseline gap-1.5">
            <span className="font-display text-2xl font-semibold tracking-tight text-slate-900 tabular-nums">
              {stats.total > 0 ? stats.average.toFixed(1) : '—'}
            </span>
            {stats.total > 0 && (
              <span className="text-xs font-medium text-slate-400 tabular-nums">/ 5.0</span>
            )}
          </div>
        </div>

        <div className="p-4 sm:p-5">
          <div className="text-xs font-medium text-slate-500">Satisfacción (4–5 estrellas)</div>
          <div className="mt-1.5 font-display text-2xl font-semibold tracking-tight text-slate-900 tabular-nums">
            {stats.total > 0 ? `${stats.satisfactionRate}%` : '—'}
          </div>
        </div>

        <div className="p-4 sm:p-5">
          <div className="text-xs font-medium text-slate-500">Última encuesta</div>
          <div className="mt-2 font-mono text-xs font-medium text-slate-700 tabular-nums sm:text-sm">
            {stats.lastCreatedAt ? formatDateTimeEs(stats.lastCreatedAt) : 'Sin registros'}
          </div>
        </div>
      </div>

      {/* Distribution + Filters */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold text-slate-900">
              Distribución de estrellas
            </h2>
            {ratingFilter !== 'all' && (
              <button
                type="button"
                onClick={() => setRatingFilter('all')}
                className="text-xs font-medium text-amber-700 hover:text-amber-800 cursor-pointer"
              >
                Ver todas
              </button>
            )}
          </div>

          <div className="mt-4 space-y-2.5">
            {STAR_LEVELS.map((level) => {
              const count = stats.distribution[level];
              const pct = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0;
              const isSelected = ratingFilter === level;

              return (
                <button
                  key={level}
                  type="button"
                  onClick={() => setRatingFilter(isSelected ? 'all' : level)}
                  className={`flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors cursor-pointer ${
                    isSelected ? 'bg-amber-50/80 ring-1 ring-amber-300' : 'hover:bg-slate-50'
                  }`}
                >
                  <span className="flex w-10 items-center gap-1 text-xs font-medium text-slate-700 tabular-nums shrink-0">
                    <span>{level}</span>
                    <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" aria-hidden="true" />
                  </span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-amber-500 transition-[width] duration-150"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-14 text-right font-mono text-xs text-slate-500 tabular-nums shrink-0">
                    {count} ({pct}%)
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Records Table */}
        <div className="rounded-xl border border-slate-200 bg-white lg:col-span-2">
          <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <label htmlFor="survey-search" className="sr-only">
                Buscar por comentario, área o sucursal
              </label>
              <input
                id="survey-search"
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por comentario o sector (Ventas, Taller...)"
                className="w-full rounded-lg border border-slate-200 bg-slate-50/50 py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:bg-white focus:outline-none"
              />
            </div>

            <div className="text-xs font-medium text-slate-500 tabular-nums shrink-0">
              {filteredSurveys.length}{' '}
              {filteredSurveys.length === 1 ? 'registro' : 'registros'}
            </div>
          </div>

          {isLoading ? (
            <div className="divide-y divide-slate-100 p-4">
              {[1, 2, 3, 4].map((row) => (
                <div key={row} className="flex items-center justify-between py-3.5">
                  <div className="h-4 w-40 animate-pulse rounded bg-slate-100" />
                  <div className="h-4 w-24 animate-pulse rounded bg-slate-100" />
                </div>
              ))}
            </div>
          ) : filteredSurveys.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <p className="font-display text-sm font-semibold text-slate-900">
                No hay encuestas que coincidan con el filtro actual
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Cambia el selector de sucursal o registra una nueva votación desde la pantalla de Encuesta.
              </p>
            </div>
          ) : (
            <>
              {/* Desktop / Tablet table */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs font-medium text-slate-500">
                      <th className="px-4 py-3 font-medium">Fecha</th>
                      <th className="px-4 py-3 font-medium">Sucursal</th>
                      <th className="px-4 py-3 font-medium">Calificación</th>
                      <th className="px-4 py-3 font-medium">Sector</th>
                      <th className="px-4 py-3 font-medium">Motivos / Comentario</th>
                      <th className="px-4 py-3 text-right font-medium">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredSurveys.map((entry) => (
                      <tr key={entry.id} className="transition-colors hover:bg-slate-50/70">
                        <td className="px-4 py-3 font-mono text-xs text-slate-500 tabular-nums whitespace-nowrap">
                          {formatDateTimeEs(entry.createdAt)}
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-900 whitespace-nowrap">
                          {entry.branchName}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-xs font-semibold text-slate-900 tabular-nums">
                              {entry.rating}★
                            </span>
                            <span className="text-xs text-slate-500">
                              · {getRatingLabel(entry.rating)}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">
                          {entry.area}
                        </td>
                        <td className="max-w-xs px-4 py-3 text-xs text-slate-600">
                          {entry.tags && entry.tags.length > 0 && (
                            <div className="mb-1 flex flex-wrap gap-1">
                              {entry.tags.map((t) => (
                                <span
                                  key={t}
                                  className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${
                                    entry.rating >= 4
                                      ? 'bg-emerald-50 text-emerald-700'
                                      : 'bg-rose-50 text-rose-700'
                                  }`}
                                >
                                  {t}
                                </span>
                              ))}
                            </div>
                          )}
                          {entry.comment ? (
                            <span className="line-clamp-2">{entry.comment}</span>
                          ) : !entry.tags?.length ? (
                            <span className="text-slate-300">—</span>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => setPendingDelete(entry)}
                            aria-label={`Eliminar encuesta de ${entry.branchName} del ${formatDateTimeEs(entry.createdAt)}`}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-700 cursor-pointer"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile card-free stacked rows */}
              <div className="divide-y divide-slate-100 md:hidden">
                {filteredSurveys.map((entry) => (
                  <div key={entry.id} className="flex items-start justify-between gap-3 p-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                        <span className="font-semibold text-slate-900">{entry.branchName}</span>
                        <span aria-hidden="true" className="text-slate-300">·</span>
                        <span className="font-mono font-semibold text-amber-700 tabular-nums">
                          {entry.rating}★
                        </span>
                        <span aria-hidden="true" className="text-slate-300">·</span>
                        <span className="text-slate-500">{entry.area}</span>
                      </div>
                      {entry.tags && entry.tags.length > 0 && (
                        <p className="mt-1 text-[11px] text-slate-500">{entry.tags.join(' · ')}</p>
                      )}
                      {entry.comment && (
                        <p className="mt-1 text-xs text-slate-700">{entry.comment}</p>
                      )}
                      <div className="mt-1 font-mono text-[11px] text-slate-400 tabular-nums">
                        {formatDateTimeEs(entry.createdAt)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPendingDelete(entry)}
                      aria-label={`Eliminar encuesta de ${entry.branchName}`}
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-700 cursor-pointer"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {pendingDelete && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-survey-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <h3 id="delete-survey-title" className="font-display text-base font-semibold text-slate-900">
              Eliminar registro de encuesta
            </h3>
            <p className="mt-1.5 text-sm text-slate-600">
              ¿Deseas eliminar la calificación de {pendingDelete.rating} estrellas registrada en{' '}
              <span className="font-medium text-slate-900">{pendingDelete.branchName}</span>?
            </p>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                className="min-h-[40px] rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={confirmDelete}
                className="min-h-[40px] rounded-lg bg-rose-700 px-4 py-2 text-xs font-medium text-white hover:bg-rose-800 disabled:opacity-60 cursor-pointer"
              >
                {isDeleting ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
