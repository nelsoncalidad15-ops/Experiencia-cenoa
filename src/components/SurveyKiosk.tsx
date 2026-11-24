import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  Car,
  Check,
  CloudOff,
  FileText,
  Lock,
  Package,
  ShieldCheck,
  Wrench,
} from 'lucide-react';
import type { Branch, DealershipGroup, SurveyArea, SurveyEntry, SyncState } from '../types/survey';
import { SURVEY_AREAS, getRatingLabel, getTagsForRating } from '../utils/surveyLogic';
import { GROUP_LOGOS } from './DealershipLogo';

interface SurveyKioskProps {
  branch: Branch;
  isKioskLocked: boolean;
  hasPinConfigured: boolean;
  syncState: SyncState;
  pendingCount: number;
  onUnlockKiosk: (pinAttempt?: string) => boolean;
  onSubmitVote: (rating: 1 | 2 | 3 | 4 | 5) => Promise<SurveyEntry>;
  onUpdateVoteDetails: (
    surveyId: string,
    updates: { rating?: 1 | 2 | 3 | 4 | 5; area?: SurveyArea; comment?: string; tags?: string[] }
  ) => Promise<void>;
}

type Step = 'rate' | 'details' | 'done';
type Rating = 1 | 2 | 3 | 4 | 5;

const STARS: Rating[] = [1, 2, 3, 4, 5];
const DETAILS_IDLE_SECONDS = 30;
const DONE_SECONDS = 6;

const AREA_ICONS: Record<string, typeof Car> = {
  Ventas: Car,
  'Postventa / Taller': Wrench,
  Repuestos: Package,
  Administración: FileText,
};

/** Color de acento sutil por marca para el fondo del showroom. */
const GROUP_ACCENT: Record<DealershipGroup, string> = {
  Autosol: '37, 99, 235',
  Autolux: '235, 10, 30',
  Autociel: '56, 189, 248',
  Otro: '212, 175, 55',
};

const STAR_PATH =
  'M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z';

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 15_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

function SyncBadge({ state, pending }: { state: SyncState; pending: number }) {
  if (state === 'local') return null;
  const map: Record<Exclude<SyncState, 'local'>, { dot: string; text: string }> = {
    synced: { dot: 'bg-emerald-400', text: 'En línea' },
    syncing: { dot: 'bg-sky-400 animate-pulse', text: 'Sincronizando' },
    pending: { dot: 'bg-amber-400', text: `${pending} pendiente${pending === 1 ? '' : 's'}` },
    error: { dot: 'bg-rose-400', text: 'Sin conexión' },
  };
  const { dot, text } = map[state];
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-medium text-white/60">
      {state === 'error' ? (
        <CloudOff className="h-3.5 w-3.5" aria-hidden="true" />
      ) : (
        <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden="true" />
      )}
      {text}
    </span>
  );
}

function StarIcon({ filled, className = '' }: { filled: boolean; className?: string }) {
  const gradId = useId();
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FDE68A" />
          <stop offset="45%" stopColor="#F5B931" />
          <stop offset="100%" stopColor="#C2780A" />
        </linearGradient>
      </defs>
      <path
        d={STAR_PATH}
        fill={filled ? `url(#${gradId})` : 'none'}
        stroke={filled ? '#F5B931' : 'rgba(255,255,255,0.35)'}
        strokeWidth={filled ? 0.8 : 1.3}
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SurveyKiosk({
  branch,
  isKioskLocked,
  hasPinConfigured,
  syncState,
  pendingCount,
  onUnlockKiosk,
  onSubmitVote,
  onUpdateVoteDetails,
}: SurveyKioskProps) {
  const [step, setStep] = useState<Step>('rate');
  const [hovered, setHovered] = useState<number | null>(null);
  const [rating, setRating] = useState<Rating | null>(null);
  const [survey, setSurvey] = useState<SurveyEntry | null>(null);
  const [area, setArea] = useState<SurveyArea | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(DETAILS_IDLE_SECONDS);
  const [error, setError] = useState<string | null>(null);

  const [showUnlock, setShowUnlock] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);

  const now = useClock();
  const finishingRef = useRef(false);
  const initialRatingRef = useRef<Rating | null>(null);
  const accent = GROUP_ACCENT[branch.group] ?? GROUP_ACCENT.Otro;
  const logos = GROUP_LOGOS[branch.group] ?? [];

  const reset = useCallback(() => {
    setStep('rate');
    setHovered(null);
    setRating(null);
    setSurvey(null);
    setArea(null);
    setTags([]);
    setComment('');
    setError(null);
    setSecondsLeft(DETAILS_IDLE_SECONDS);
    finishingRef.current = false;
    initialRatingRef.current = null;
  }, []);

  useEffect(() => {
    reset();
  }, [branch.id, reset]);

  const finishDetails = useCallback(async () => {
    if (!survey || finishingRef.current) return;
    finishingRef.current = true;
    const ratingChanged =
      initialRatingRef.current !== null && survey.rating !== initialRatingRef.current;
    const hasDetails = Boolean(
      ratingChanged || area || tags.length > 0 || comment.trim().length > 0
    );
    setStep('done');
    setSecondsLeft(DONE_SECONDS);
    if (hasDetails) {
      try {
        await onUpdateVoteDetails(survey.id, {
          rating: survey.rating,
          area: area ?? 'General',
          tags,
          comment: comment.trim(),
        });
      } catch (err) {
        console.error(err);
      }
    }
  }, [survey, area, tags, comment, onUpdateVoteDetails]);

  // Temporizador: inactividad en detalles / regreso automático al inicio.
  useEffect(() => {
    if (step === 'rate') return;
    const id = window.setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [step]);

  useEffect(() => {
    if (secondsLeft > 0) return;
    if (step === 'details') void finishDetails();
    else if (step === 'done') reset();
  }, [secondsLeft, step, finishDetails, reset]);

  const bumpActivity = () => {
    if (step === 'details') setSecondsLeft(DETAILS_IDLE_SECONDS);
  };

  const handleRate = async (value: Rating) => {
    if (rating) return;
    setRating(value);
    setError(null);
    try {
      const [created] = await Promise.all([
        onSubmitVote(value),
        new Promise((r) => window.setTimeout(r, 650)), // deja ver la animación
      ]);
      initialRatingRef.current = created.rating;
      setSurvey(created);
      setSecondsLeft(DETAILS_IDLE_SECONDS);
      setStep('details');
    } catch (err) {
      setRating(null);
      setError(err instanceof Error ? err.message : 'No pudimos registrar tu calificación.');
    }
  };

  const handleChangeRating = (value: Rating) => {
    if (!survey) return;
    bumpActivity();
    const prevRating = survey.rating;
    if (prevRating === value) return;
    if ((prevRating >= 4) !== (value >= 4)) {
      setTags([]);
    }
    setRating(value);
    setSurvey({ ...survey, rating: value });
  };

  const toggleTag = (tag: string) => {
    bumpActivity();
    setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  };

  const handleUnlockClick = () => {
    if (!hasPinConfigured) {
      onUnlockKiosk();
      return;
    }
    setShowUnlock(true);
    setPinInput('');
    setPinError(null);
  };

  const handleUnlockSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (onUnlockKiosk(pinInput)) {
      setShowUnlock(false);
      setPinInput('');
    } else {
      setPinError('PIN incorrecto');
      setPinInput('');
    }
  };

  const highlight = hovered ?? rating ?? 0;
  const isPositive = (rating ?? 5) >= 4;
  const stepIndex = step === 'rate' ? 0 : step === 'details' ? 1 : 2;

  return (
    <section
      aria-label={`Encuesta de satisfacción ${branch.name}`}
      onPointerDown={bumpActivity}
      onKeyDown={bumpActivity}
      className={`kiosk-stage relative flex flex-1 select-none flex-col overflow-hidden text-white ${
        isKioskLocked ? 'min-h-[100dvh]' : 'min-h-[calc(100dvh-120px)]'
      }`}
      style={{ ['--accent' as string]: accent }}
    >
      {/* Fondo: degradado profundo + halos de luz de showroom */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_-10%,#1e293b_0%,#0b1120_55%,#05070d_100%)]" />
        <div className="kiosk-glow absolute -top-40 left-1/2 h-[620px] w-[1100px] -translate-x-1/2 rounded-full opacity-60 blur-3xl" />
        <div className="kiosk-gold absolute bottom-[-260px] left-1/2 h-[420px] w-[900px] -translate-x-1/2 rounded-full opacity-40 blur-3xl" />
        <div className="kiosk-grid absolute inset-x-0 bottom-0 h-[45%]" />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />
      </div>

      {/* Encabezado */}
      <header className="relative z-10 flex items-center justify-between gap-4 px-5 pt-5 sm:px-10 sm:pt-8">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <div className="flex items-center gap-2">
            {logos.length > 0 ? (
              logos.map((logo) => (
                <div
                  key={logo.src}
                  className="flex h-11 w-11 items-center justify-center rounded-xl bg-white p-1.5 shadow-lg shadow-black/30 sm:h-14 sm:w-14 sm:rounded-2xl sm:p-2"
                >
                  <img
                    src={logo.src}
                    alt={logo.alt}
                    className={`h-full w-full object-contain mix-blend-multiply ${logo.scaleClass ?? ''}`}
                  />
                </div>
              ))
            ) : (
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white font-display text-lg font-bold text-slate-900 sm:h-14 sm:w-14">
                {branch.name.charAt(0)}
              </div>
            )}
          </div>
          <div className="min-w-0">
            <div className="truncate font-display text-base font-semibold tracking-tight sm:text-xl">
              {branch.name}
            </div>
            <div className="truncate text-xs text-white/50 sm:text-sm">{branch.city}</div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <SyncBadge state={syncState} pending={pendingCount} />
          <span className="hidden font-display text-lg font-medium tabular-nums text-white/70 sm:block">
            {now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
          </span>
          {isKioskLocked && (
            <button
              type="button"
              onClick={handleUnlockClick}
              aria-label="Desbloquear panel de gestión"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/40 transition hover:bg-white/10 hover:text-white/80 cursor-pointer"
            >
              <Lock className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </header>

      {/* Contenido */}
      <div className="relative z-10 flex flex-1 items-center justify-center px-5 py-4 sm:px-10 sm:py-6">
        {step === 'rate' && (
          <div key="rate" className="kiosk-enter flex w-full max-w-4xl flex-col items-center text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-300/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-amber-200">
              Tu opinión nos importa
            </span>

            <h1 className="mt-6 max-w-3xl text-balance font-display text-3xl font-semibold leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl">
              {branch.question}
            </h1>

            <p className="mt-4 text-sm text-white/55 sm:text-lg">
              Tocá una estrella para calificar tu atención
            </p>

            <div
              role="radiogroup"
              aria-label="Calificación de 1 a 5 estrellas"
              onMouseLeave={() => setHovered(null)}
              className="mt-10 grid w-full max-w-3xl grid-cols-5 gap-2 sm:mt-14 sm:gap-4"
            >
              {STARS.map((value) => {
                const filled = value <= highlight;
                const chosen = rating === value;
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={chosen}
                    aria-label={`${value} ${value === 1 ? 'estrella' : 'estrellas'}: ${getRatingLabel(value)}`}
                    disabled={rating !== null}
                    onMouseEnter={() => setHovered(value)}
                    onFocus={() => setHovered(value)}
                    onBlur={() => setHovered(null)}
                    onClick={() => handleRate(value)}
                    style={{ animationDelay: `${value * 60}ms` }}
                    className={`kiosk-star group relative flex aspect-[4/5] flex-col items-center justify-center gap-2 rounded-2xl border transition-all duration-200 ease-out active:scale-95 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 sm:rounded-3xl ${
                      filled
                        ? 'border-amber-300/40 bg-gradient-to-b from-amber-300/15 to-amber-500/5 shadow-[0_20px_50px_-20px_rgba(245,185,49,0.55)] -translate-y-1'
                        : 'border-white/10 bg-white/[0.04] hover:border-white/20'
                    } ${chosen ? 'kiosk-star-chosen' : ''} disabled:cursor-default`}
                  >
                    <StarIcon
                      filled={filled}
                      className={`h-10 w-10 transition-transform duration-200 sm:h-16 sm:w-16 lg:h-20 lg:w-20 ${
                        filled ? 'scale-110 drop-shadow-[0_6px_18px_rgba(245,185,49,0.45)]' : ''
                      }`}
                    />
                    <span
                      className={`font-display text-sm font-semibold tabular-nums sm:text-lg ${
                        filled ? 'text-amber-200' : 'text-white/40'
                      }`}
                    >
                      {value}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-7 h-8 font-display text-xl font-medium sm:text-2xl" aria-live="polite">
              {highlight > 0 ? (
                <span key={highlight} className="kiosk-enter inline-block text-amber-200">
                  {getRatingLabel(highlight)}
                </span>
              ) : (
                <span className="text-base text-white/30 sm:text-lg">
                  1 · Muy insatisfecho &nbsp;—&nbsp; 5 · Excelente
                </span>
              )}
            </div>

            {error && (
              <p role="alert" className="mt-4 text-sm font-medium text-rose-300">
                {error}
              </p>
            )}
          </div>
        )}

        {step === 'details' && survey && (
          <div key="details" className="kiosk-enter w-full max-w-3xl">
            <div className="rounded-[28px] border border-white/10 bg-white/[0.06] p-5 shadow-2xl shadow-black/40 backdrop-blur-xl sm:p-8">
              <div className="flex flex-col items-center text-center">
                <div className="flex items-center gap-1" role="group" aria-label="Cambiar calificación">
                  {STARS.map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => handleChangeRating(v)}
                      title={`Cambiar calificación a ${v} ${v === 1 ? 'estrella' : 'estrellas'}`}
                      aria-label={`Cambiar calificación a ${v} ${v === 1 ? 'estrella' : 'estrellas'}`}
                      aria-pressed={v === survey.rating}
                      className="rounded-lg p-1 transition-transform hover:scale-110 active:scale-95 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
                    >
                      <StarIcon filled={v <= survey.rating} className="h-7 w-7 sm:h-8 sm:w-8" />
                    </button>
                  ))}
                </div>
                <h2 className="mt-3 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
                  {isPositive ? '¡Gracias! Nos alegra mucho.' : 'Gracias por contarnos.'}
                </h2>
                <p className="mt-1.5 text-sm text-white/55 sm:text-base">
                  {isPositive
                    ? 'Si querés, contanos qué fue lo que más te gustó.'
                    : 'Tu respuesta nos ayuda a mejorar. ¿Qué podemos hacer mejor?'}
                </p>
              </div>

              <div className="mt-5">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/40">
                  ¿Qué área visitaste?
                </p>
                <div className="mt-2.5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                  {SURVEY_AREAS.map((a) => {
                    const Icon = AREA_ICONS[a] ?? Car;
                    const active = area === a;
                    return (
                      <button
                        key={a}
                        type="button"
                        onClick={() => {
                          bumpActivity();
                          setArea(active ? null : a);
                        }}
                        aria-pressed={active}
                        className={`flex min-h-[60px] flex-col items-center justify-center gap-1.5 rounded-2xl border px-3 py-2.5 text-sm font-medium transition-all cursor-pointer ${
                          active
                            ? 'border-amber-300/60 bg-amber-300 text-slate-900 shadow-[0_10px_30px_-10px_rgba(245,185,49,0.7)]'
                            : 'border-white/10 bg-white/[0.04] text-white/80 hover:bg-white/10'
                        }`}
                      >
                        <Icon className="h-5 w-5" aria-hidden="true" />
                        <span className="leading-tight">{a}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-5">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/40">
                  {isPositive ? 'Lo que más destacás' : 'Qué podríamos mejorar'}
                </p>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {getTagsForRating(survey.rating).map((tag) => {
                    const active = tags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => toggleTag(tag)}
                        aria-pressed={active}
                        className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm transition-all cursor-pointer ${
                          active
                            ? 'border-white bg-white text-slate-900'
                            : 'border-white/15 bg-transparent text-white/75 hover:border-white/30'
                        }`}
                      >
                        {active && <Check className="h-4 w-4" aria-hidden="true" />}
                        {tag}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-5">
                <label
                  htmlFor="kiosk-comment"
                  className="text-xs font-semibold uppercase tracking-[0.16em] text-white/40"
                >
                  Comentario <span className="normal-case tracking-normal text-white/30">(opcional)</span>
                </label>
                <textarea
                  id="kiosk-comment"
                  rows={2}
                  maxLength={280}
                  value={comment}
                  onChange={(e) => {
                    bumpActivity();
                    setComment(e.target.value);
                  }}
                  placeholder="Escribí aquí…"
                  className="mt-2.5 w-full resize-none rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-base text-white placeholder:text-white/30 focus:border-amber-300/50 focus:outline-none focus:ring-2 focus:ring-amber-300/20"
                />
              </div>

              <div className="mt-6 flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-center text-xs tabular-nums text-white/35 sm:text-left">
                  Se enviará automáticamente en {secondsLeft}s
                </span>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => void finishDetails()}
                    className="min-h-[48px] flex-1 rounded-2xl border border-white/15 px-6 text-sm font-medium text-white/70 transition hover:bg-white/5 cursor-pointer sm:flex-none"
                  >
                    Omitir
                  </button>
                  <button
                    type="button"
                    onClick={() => void finishDetails()}
                    className="min-h-[48px] flex-1 rounded-2xl bg-gradient-to-b from-amber-200 to-amber-400 px-8 text-sm font-semibold text-slate-900 shadow-[0_14px_40px_-12px_rgba(245,185,49,0.8)] transition hover:brightness-105 active:translate-y-px cursor-pointer sm:flex-none"
                  >
                    Enviar respuesta
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 'done' && (
          <button
            key="done"
            type="button"
            onClick={reset}
            className="kiosk-enter flex max-w-2xl flex-col items-center text-center cursor-pointer"
          >
            <div className="relative flex h-28 w-28 items-center justify-center sm:h-36 sm:w-36">
              <div className="kiosk-ripple absolute inset-0 rounded-full border border-amber-300/40" />
              <div className="kiosk-ripple absolute inset-0 rounded-full border border-amber-300/30 [animation-delay:600ms]" />
              <svg viewBox="0 0 52 52" className="relative h-full w-full">
                <circle cx="26" cy="26" r="24" fill="rgba(245,185,49,0.12)" stroke="#F5B931" strokeWidth="1.5" className="kiosk-check-circle" />
                <path d="M15 27 l7 7 l15 -16" fill="none" stroke="#FDE68A" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="kiosk-check-path" />
              </svg>
            </div>
            <h2 className="mt-8 text-balance font-display text-3xl font-semibold tracking-tight sm:text-5xl">
              {branch.thankYouTitle}
            </h2>
            <p className="mt-4 max-w-lg text-base text-white/60 sm:text-xl">
              {branch.thankYouSubtitle}
            </p>
            <div className="mt-10 h-1 w-48 overflow-hidden rounded-full bg-white/10">
              <div
                className="kiosk-progress h-full rounded-full bg-amber-300"
                style={{ animationDuration: `${DONE_SECONDS}s` }}
              />
            </div>
            <span className="mt-3 text-xs text-white/35">Tocá para comenzar una nueva encuesta</span>
          </button>
        )}
      </div>

      {/* Pie */}
      <footer className="relative z-10 flex items-center justify-between gap-4 px-5 pb-5 text-[11px] text-white/35 sm:px-10 sm:pb-7 sm:text-xs">
        <span className="inline-flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          Encuesta anónima · menos de 30 segundos
        </span>
        <div className="flex items-center gap-1.5" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === stepIndex ? 'w-6 bg-amber-300' : 'w-1.5 bg-white/20'
              }`}
            />
          ))}
        </div>
      </footer>

      {showUnlock && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="unlock-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
        >
          <form
            onSubmit={handleUnlockSubmit}
            className="kiosk-enter w-full max-w-xs rounded-3xl border border-white/10 bg-slate-900 p-6 text-center shadow-2xl"
          >
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white/5">
              <Lock className="h-5 w-5 text-white/70" aria-hidden="true" />
            </div>
            <h3 id="unlock-title" className="mt-4 font-display text-lg font-semibold">
              Acceso de personal
            </h3>
            <p className="mt-1 text-xs text-white/50">Ingresá el PIN para salir del modo tablet</p>
            <input
              type="password"
              inputMode="numeric"
              autoFocus
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              aria-label="PIN"
              className="mt-5 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-center font-mono text-2xl tracking-[0.5em] text-white focus:border-amber-300/50 focus:outline-none"
              placeholder="••••"
            />
            {pinError && (
              <p role="alert" className="mt-2 text-xs font-medium text-rose-300">
                {pinError}
              </p>
            )}
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setShowUnlock(false)}
                className="min-h-[44px] rounded-xl border border-white/10 text-sm text-white/70 hover:bg-white/5 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="min-h-[44px] rounded-xl bg-amber-300 text-sm font-semibold text-slate-900 hover:bg-amber-200 cursor-pointer"
              >
                Entrar
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
