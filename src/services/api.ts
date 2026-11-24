/**
 * Capa de datos: Google Sheets vía Google Apps Script (Web App).
 *
 * - La URL del Web App se toma de VITE_APPS_SCRIPT_URL (variable de entorno
 *   en Cloudflare Pages) o de la configuración guardada en la tablet
 *   (panel "Sucursales" → "Conexión con Google Sheets").
 * - Las escrituras usan POST con Content-Type text/plain para evitar el
 *   preflight CORS que Apps Script no soporta.
 * - Si no hay conexión, las encuestas quedan en una cola local y se
 *   reenvían automáticamente: la tablet nunca pierde un voto.
 */
import type { Branch, SurveyEntry } from '../types/survey';

const STORAGE_URL = 'cenoa_apps_script_url_v1';
const STORAGE_QUEUE = 'cenoa_sync_queue_v1';
const STORAGE_CACHE = 'cenoa_cache_v1';

export type QueueOp =
  | { kind: 'saveSurvey'; id: string; payload: SurveyEntry }
  | { kind: 'deleteSurvey'; id: string }
  | { kind: 'saveBranch'; id: string; payload: Branch };

interface CacheShape {
  branches: Branch[];
  surveys: SurveyEntry[];
  sheetUrl?: string;
}

export interface RemoteSnapshot {
  branches: Branch[];
  surveys: SurveyEntry[];
  sheetUrl?: string;
}

// ---------- Configuración ----------

export function getEnvScriptUrl(): string {
  return (import.meta.env.VITE_APPS_SCRIPT_URL as string | undefined)?.trim() || '';
}

export function getScriptUrl(): string {
  try {
    const stored = localStorage.getItem(STORAGE_URL);
    if (stored && stored.trim()) return stored.trim();
  } catch {
    /* ignore */
  }
  return getEnvScriptUrl();
}

export function setScriptUrl(url: string): void {
  try {
    if (url.trim()) localStorage.setItem(STORAGE_URL, url.trim());
    else localStorage.removeItem(STORAGE_URL);
  } catch {
    /* ignore */
  }
}

export function isRemoteEnabled(): boolean {
  return /^https:\/\/script\.google(usercontent)?\.com\//.test(getScriptUrl());
}

// ---------- Cache local ----------

export function readCache(): CacheShape | null {
  try {
    const raw = localStorage.getItem(STORAGE_CACHE);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheShape;
    if (!Array.isArray(parsed.branches) || !Array.isArray(parsed.surveys)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeCache(data: CacheShape): void {
  try {
    // Limitamos a las últimas 2000 encuestas para no llenar el storage.
    localStorage.setItem(
      STORAGE_CACHE,
      JSON.stringify({ ...data, surveys: data.surveys.slice(0, 2000) })
    );
  } catch {
    /* ignore */
  }
}

// ---------- Cola de sincronización ----------

export function readQueue(): QueueOp[] {
  try {
    const raw = localStorage.getItem(STORAGE_QUEUE);
    const parsed = raw ? (JSON.parse(raw) as QueueOp[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(queue: QueueOp[]): void {
  try {
    localStorage.setItem(STORAGE_QUEUE, JSON.stringify(queue));
  } catch {
    /* ignore */
  }
}

/** Agrega una operación a la cola, fusionando con la anterior del mismo registro. */
export function enqueue(op: QueueOp): void {
  const queue = readQueue();
  const sameKind = (o: QueueOp) =>
    o.id === op.id &&
    (o.kind === op.kind || (o.kind === 'saveSurvey' && op.kind === 'deleteSurvey'));
  const filtered = queue.filter((o) => !sameKind(o));
  filtered.push(op);
  writeQueue(filtered);
}

export function pendingCount(): number {
  return readQueue().length;
}

// ---------- HTTP ----------

async function postAction<T>(action: string, payload: unknown): Promise<T> {
  const url = getScriptUrl();
  const res = await fetch(url, {
    method: 'POST',
    // text/plain = "simple request": sin preflight CORS.
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, payload }),
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as { ok: boolean; error?: string } & T;
  if (!data.ok) throw new Error(data.error || 'Error en Apps Script');
  return data;
}

export async function fetchRemote(urlOverride?: string): Promise<RemoteSnapshot> {
  const url = urlOverride || getScriptUrl();
  const res = await fetch(`${url}?action=getAll&t=${Date.now()}`, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as { ok: boolean; error?: string } & RemoteSnapshot;
  if (!data.ok) throw new Error(data.error || 'Respuesta inválida de Apps Script');
  return {
    branches: Array.isArray(data.branches) ? data.branches : [],
    surveys: Array.isArray(data.surveys) ? data.surveys : [],
    sheetUrl: data.sheetUrl,
  };
}

let flushing: Promise<number> | null = null;

/** Envía la cola pendiente. Devuelve cuántas operaciones quedaron sin enviar. */
export function flushQueue(): Promise<number> {
  if (!isRemoteEnabled()) return Promise.resolve(pendingCount());
  if (flushing) return flushing;

  flushing = (async () => {
    try {
      let queue = readQueue();
      while (queue.length > 0) {
        const op = queue[0];
        if (op.kind === 'saveSurvey') await postAction('saveSurvey', op.payload);
        else if (op.kind === 'deleteSurvey') await postAction('deleteSurvey', { id: op.id });
        else if (op.kind === 'saveBranch') await postAction('saveBranch', op.payload);
        // Releemos por si se agregaron operaciones mientras enviábamos.
        queue = readQueue();
        if (queue[0] && queue[0].kind === op.kind && queue[0].id === op.id &&
            JSON.stringify(queue[0]) === JSON.stringify(op)) {
          queue = queue.slice(1);
          writeQueue(queue);
        }
      }
      return 0;
    } catch (err) {
      console.warn('Sincronización pendiente:', err);
      return pendingCount();
    } finally {
      flushing = null;
    }
  })();

  return flushing;
}

export function createId(prefix: string): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 10)
      : Math.random().toString(36).slice(2, 12);
  return `${prefix}-${rand}`;
}
