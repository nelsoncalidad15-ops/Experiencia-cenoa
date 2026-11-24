import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Check, CloudOff, Lock, ShieldCheck } from 'lucide-react';
import type { Branch, DealershipGroup, SurveyArea, SurveyEntry, SyncState } from '../types/survey';
import { getRatingLabel, getTagsForRating } from '../utils/surveyLogic';
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
const DETAILS_IDLE_SECONDS = 20;
const DONE_SECONDS = 5;

const SHORT_STAR_LABEL: Record<Rating, string> = {
  1: 'Muy mala',
  2: 'Mala',
  3: 'Regular',
  4: 'Muy buena',
  5: 'Excelente',
};

/** Halo sutil de estudio por marca (muy suave sobre porcelana). */
const GROUP_ACCENT: Record<DealershipGroup, string> = {
  Autosol: '0, 56, 130',
  Autolux: '220, 38, 38',
  Autociel: '30, 64, 175',
  Otro: '180, 134, 11',
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
    synced: { dot: 'bg-emerald-500', text: 'En línea' },
    syncing: { dot: 'bg-sky-500 animate-pulse', text: 'Sincronizando' },
    pending: { dot: 'bg-amber-500', text: `${pending} pendiente${pending === 1 ? '' : 's'}` },
    error: { dot: 'bg-rose-500', text: 'Sin conexión' },
  };
  const { dot, text } = map[state];
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-slate-200/80 bg-white/80 px-3 py-1.5 text-[11px] font-medium text-slate-600 shadow-2xs backdrop-blur-md">
      {state === 'error' ? (
        <CloudOff className="h-3.5 w-3.5 text-rose-500" aria-hidden="true" />
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
          <stop offset="45%" stopColor="#E5A924" />
          <stop offset="100%" stopColor="#B47B11" />
        </linearGradient>
      </defs>
      <path
        d={STAR_PATH}
        fill={filled ? `url(#${gradId})` : 'rgba(212, 168, 67, 0.08)'}
        stroke={filled ? '#B47B11' : '#C9A24B'}
        strokeWidth={filled ? 0.85 : 1.35}
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
    const hasDetails = Boolean(ratingChanged || tags.length > 0 || comment.trim().length > 0);
    setStep('done');
    setSecondsLeft(DONE_SECONDS);
    if (hasDetails) {
      try {
        await onUpdateVoteDetails(survey.id, {
          rating: survey.rating,
          area: 'Ventas',
          tags,
          comment: comment.trim(),
        });
      } catch (err) {
        console.error(err);
      }
    }
  }, [survey, tags, comment, onUpdateVoteDetails]);

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

  /** Registra inmediatamente la estrella (Ventas) apenas el cliente la toca. */
  const handleRate = async (value: Rating) => {
    if (rating) return;
    setRating(value);
    setError(null);
    try {
      const [created] = await Promise.all([
        onSubmitVote(value),
        new Promise((r) => window.setTimeout(r, 560)),
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
  const hasExtraInput = tags.length > 0 || comment.trim().length > 0;

  return (
    <section
      aria-label={`Encuesta de satisfacción ${branch.name}`}
      onPointerDown={bumpActivity}
      onKeyDown={bumpActivity}
      className={`kiosk-stage relative flex flex-1 select-none flex-col overflow-hidden text-slate-900 ${
        isKioskLocked ? 'min-h-[100dvh]' : 'min-h-[calc(100dvh-120px)]'
      }`}
      style={{ ['--accent' as string]: accent }}
    >
      {/* Fondo porcelana arquitectónica (estilo Audi / Apple Store) */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(120%_85%_at_50%_-10%,#ffffff_0%,#f5f7fa_52%,#ebeff5_100%)]" />
        <div className="kiosk-glow absolute -top-48 left-1/2 h-[560px] w-[1080px] -translate-x-1/2 rounded-full opacity-55 blur-3xl" />
        <div className="kiosk-gold absolute bottom-[-280px] left-1/2 h-[420px] w-[900px] -translate-x-1/2 rounded-full opacity-50 blur-3xl" />
        <div className="kiosk-grid absolute inset-x-0 bottom-0 h-[38%]" />
        <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-amber-500/35 to-transparent" />
      </div>

      {/* Encabezado limpio e integrado */}
      <header className="relative z-10 flex items-center justify-between gap-4 px-5 pt-5 sm:px-10 sm:pt-8">
        <div className="flex min-w-0 items-center gap-3.5 sm:gap-4">
          <div className="flex items-center gap-2">
            {logos.length > 0 ? (
              logos.map((logo) => (
                <div
                  key={logo.src}
                  className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200/80 bg-white/95 p-2 shadow-[0_8px_20px_-10px_rgba(15,23,42,0.16)] sm:h-14 sm:w-14 sm:p-2.5"
                >
                  <img
                    src={logo.src}
                    alt={logo.alt}
                    className={`h-full w-full object-contain mix-blend-multiply ${logo.scaleClass ?? ''}`}
                  />
                </div>
              ))
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-white font-display text-lg font-bold text-slate-900 shadow-xs sm:h-14 sm:w-14">
                {branch.name.charAt(0)}
              </div>
            )}
          </div>
          <div className="min-w-0">
            <div className="truncate font-display text-base font-semibold tracking-tight text-slate-950 sm:text-xl">
              {branch.name}
            </div>
            <div className="truncate text-xs font-medium tracking-wide text-slate-500 sm:text-sm">
              Salón de Ventas · {branch.city}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2.5 sm:gap-3.5">
          <SyncBadge state={syncState} pending={pendingCount} />
          <span className="hidden font-display text-sm font-medium tabular-nums tracking-wider text-slate-400 sm:block">
            {now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
          </span>
          {isKioskLocked && (
            <button
              type="button"
              onClick={handleUnlockClick}
              aria-label="Desbloquear panel de gestión"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200/90 bg-white/80 text-slate-400 shadow-2xs transition hover:border-slate-300 hover:bg-white hover:text-slate-800 cursor-pointer"
            >
              <Lock className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </header>

      {/* Contenido principal */}
      <div className="relative z-10 flex flex-1 items-center justify-center px-5 py-4 sm:px-10 sm:py-6">
        {step === 'rate' && (
          <div key="rate" className="kiosk-enter flex w-full max-w-4xl flex-col items-center text-center">
            <div className="flex items-center gap-3">
              <span className="h-px w-8 bg-gradient-to-r from-transparent to-amber-600/50" aria-hidden="true" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.26em] text-amber-800/80">
                Experiencia en Salón
              </span>
              <span className="h-px w-8 bg-gradient-to-l from-transparent to-amber-600/50" aria-hidden="true" />
            </div>

            <h1 className="mt-5 max-w-3xl text-balance font-display text-3xl font-semibold leading-[1.08] tracking-[-0.025em] text-slate-950 sm:text-5xl lg:text-[3.6rem]">
              {branch.question}
            </h1>

            <p className="mt-4 text-sm text-slate-500 sm:text-lg">
              Tocá una estrella para calificar tu atención
            </p>

            <div
              role="radiogroup"
              aria-label="Calificación de 1 a 5 estrellas"
              onMouseLeave={() => setHovered(null)}
              className="mt-9 grid w-full max-w-3xl grid-cols-5 gap-2.5 sm:mt-12 sm:gap-4"
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
                    style={{ animationDelay: `${value * 55}ms` }}
                    className={`kiosk-star kiosk-tile group relative flex aspect-[4/5] flex-col items-center justify-center gap-2 rounded-2xl border transition-all duration-200 ease-out active:scale-95 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 sm:rounded-[26px] ${
                      filled
                        ? 'kiosk-tile-active -translate-y-1.5 border-amber-400/70'
                        : 'border-slate-200/90 hover:-translate-y-0.5 hover:border-amber-300/80'
                    } ${chosen ? 'kiosk-star-chosen' : ''} disabled:cursor-default`}
                  >
                    <StarIcon
                      filled={filled}
                      className={`h-10 w-10 transition-transform duration-200 sm:h-16 sm:w-16 lg:h-[72px] lg:w-[72px] ${
                        filled ? 'scale-110 drop-shadow-[0_8px_18px_rgba(212,168,67,0.42)]' : ''
                      }`}
                    />
                    <div className="flex flex-col items-center leading-tight">
                      <span
                        className={`font-display text-sm font-semibold tabular-nums sm:text-base ${
                          filled ? 'text-slate-950' : 'text-slate-700'
                        }`}
                      >
                        {value}
                      </span>
                      <span
                        className={`mt-0.5 hidden text-[11px] font-medium sm:block ${
                          filled ? 'text-amber-800' : 'text-slate-400'
                        }`}
                      >
                        {SHORT_STAR_LABEL[value]}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-7 h-7 font-display text-lg font-medium tracking-wide sm:text-xl" aria-live="polite">
              {highlight > 0 ? (
                <span key={highlight} className="kiosk-enter inline-block text-amber-800">
                  {getRatingLabel(highlight)}
                </span>
              ) : (
                <span className="text-sm font-normal text-slate-400 sm:text-base">
                  Un solo toque registra tu calificación
                </span>
              )}
            </div>

            {error && (
              <p role="alert" className="mt-4 text-sm font-medium text-rose-700">
                {error}
              </p>
            )}
          </div>
        )}

        {step === 'details' && survey && (
          <div key="details" className="kiosk-enter w-full max-w-2xl">
            <div className="kiosk-card rounded-[30px] border border-slate-200/80 p-6 sm:p-9">
              {/* Confirmación inmediata + estrellas ajustables */}
              <div className="flex flex-col items-center text-center">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3.5 py-1 text-[11px] font-semibold tracking-wide text-emerald-700">
                  <Check className="h-3.5 w-3.5 stroke-[2.5]" aria-hidden="true" />
                  Calificación registrada
                </span>

                <div
                  className="mt-4 flex items-center gap-1"
                  role="group"
                  aria-label="Cambiar calificación"
                >
                  {STARS.map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => handleChangeRating(v)}
                      title={`Cambiar a ${v} ${v === 1 ? 'estrella' : 'estrellas'}`}
                      aria-label={`Cambiar calificación a ${v} ${v === 1 ? 'estrella' : 'estrellas'}`}
                      aria-pressed={v === survey.rating}
                      className="rounded-xl p-1 transition-transform hover:scale-110 active:scale-95 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                    >
                      <StarIcon
                        filled={v <= survey.rating}
                        className="h-8 w-8 drop-shadow-[0_3px_8px_rgba(212,168,67,0.28)] sm:h-9 sm:w-9"
                      />
                    </button>
                  ))}
                </div>

                <h2 className="mt-3.5 font-display text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
                  {isPositive ? '¡Muchas gracias por tu valoración!' : 'Gracias por contarnos.'}
                </h2>
                <p className="mt-1.5 max-w-md text-sm text-slate-500 sm:text-base">
                  {isPositive
                    ? 'Si querés, elegí qué fue lo que más destacás (opcional).'
                    : 'Tu opinión nos ayuda a mejorar. ¿En qué fallamos? (opcional)'}
                </p>
              </div>

              <div className="my-6 h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" />

              {/* Motivos en grilla simétrica */}
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                  {isPositive ? 'Lo que más destacás' : 'Qué podríamos mejorar'}
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                  {getTagsForRating(survey.rating).map((tag) => {
                    const active = tags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => toggleTag(tag)}
                        aria-pressed={active}
                        className={`inline-flex min-h-[46px] items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-center text-xs font-medium leading-snug transition-all active:scale-[0.98] cursor-pointer sm:text-sm ${
                          active
                            ? 'border-slate-950 bg-slate-950 text-white shadow-[0_10px_24px_-10px_rgba(15,23,42,0.5)]'
                            : 'border-slate-200 bg-slate-50/70 text-slate-700 hover:border-slate-300 hover:bg-white'
                        }`}
                      >
                        {active && (
                          <Check
                            className="h-3.5 w-3.5 shrink-0 stroke-[2.5] text-amber-300"
                            aria-hidden="true"
                          />
                        )}
                        <span>{tag}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Comentario opcional */}
              <div className="mt-6">
                <label
                  htmlFor="kiosk-comment"
                  className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500"
                >
                  Comentario{' '}
                  <span className="normal-case tracking-normal text-slate-400">(opcional)</span>
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
                  placeholder="¿Querés dejarnos algún comentario sobre la atención?"
                  className="mt-2.5 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 sm:text-base"
                />
              </div>

              {/* Barra de acciones */}
              <div className="mt-6 flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-center text-xs tabular-nums text-slate-400 sm:text-left">
                  Cierre automático en {secondsLeft}s
                </span>
                <div className="flex gap-2.5">
                  <button
                    type="button"
                    onClick={() => void finishDetails()}
                    className="min-h-[48px] flex-1 rounded-xl border border-slate-200 bg-white px-5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 cursor-pointer sm:flex-none"
                  >
                    Listo
                  </button>
                  <button
                    type="button"
                    onClick={() => void finishDetails()}
                    className="kiosk-cta min-h-[48px] flex-1 rounded-xl px-7 text-sm font-semibold text-white transition hover:bg-slate-800 active:translate-y-px cursor-pointer sm:flex-none"
                  >
                    {hasExtraInput ? 'Enviar comentario' : 'Finalizar'}
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
              <div className="kiosk-ripple absolute inset-0 rounded-full border border-amber-400/50" />
              <div className="kiosk-ripple absolute inset-0 rounded-full border border-amber-400/30 [animation-delay:650ms]" />
              <svg viewBox="0 0 52 52" className="relative h-full w-full drop-shadow-[0_14px_30px_rgba(180,123,17,0.18)]">
                <circle
                  cx="26"
                  cy="26"
                  r="24"
                  fill="#ffffff"
                  stroke="#D4A843"
                  strokeWidth="1.6"
                  className="kiosk-check-circle"
                />
                <path
                  d="M15 27 l7 7 l15 -16"
                  fill="none"
                  stroke="#B47B11"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="kiosk-check-path"
                />
              </svg>
            </div>
            <h2 className="mt-8 text-balance font-display text-3xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
              {branch.thankYouTitle}
            </h2>
            <p className="mt-3.5 max-w-lg text-base text-slate-500 sm:text-xl">
              {branch.thankYouSubtitle}
            </p>
            <div className="mt-10 h-1 w-48 overflow-hidden rounded-full bg-slate-200">
              <div
                className="kiosk-progress h-full rounded-full bg-gradient-to-r from-amber-500 to-slate-900"
                style={{ animationDuration: `${DONE_SECONDS}s` }}
              />
            </div>
            <span className="mt-3 text-xs text-slate-400">Tocá para iniciar una nueva encuesta</span>
          </button>
        )}
      </div>

      {/* Pie minimalista */}
      <footer className="relative z-10 flex items-center justify-between gap-4 px-5 pb-5 text-[11px] text-slate-400 sm:px-10 sm:pb-7 sm:text-xs">
        <span className="inline-flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          Encuesta anónima · {branch.name}
        </span>
        <div className="flex items-center gap-1.5" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === stepIndex ? 'w-6 bg-slate-900' : 'w-1.5 bg-slate-300'
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm"
        >
          <form
            onSubmit={handleUnlockSubmit}
            className="kiosk-enter w-full max-w-xs rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-2xl"
          >
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
              <Lock className="h-5 w-5 text-slate-700" aria-hidden="true" />
            </div>
            <h3 id="unlock-title" className="mt-4 font-display text-lg font-semibold text-slate-950">
              Acceso de personal
            </h3>
            <p className="mt-1 text-xs text-slate-500">Ingresá el PIN para salir del modo tablet</p>
            <input
              type="password"
              inputMode="numeric"
              autoFocus
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              aria-label="PIN"
              className="mt-5 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-center font-mono text-2xl tracking-[0.5em] text-slate-950 focus:border-slate-900 focus:bg-white focus:outline-none"
              placeholder="••••"
            />
            {pinError && (
              <p role="alert" className="mt-2 text-xs font-medium text-rose-600">
                {pinError}
              </p>
            )}
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setShowUnlock(false)}
                className="min-h-[44px] rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="kiosk-cta min-h-[44px] rounded-xl text-sm font-semibold text-white hover:bg-slate-800 cursor-pointer"
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
