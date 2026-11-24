import type {
  Branch,
  BranchStats,
  DealershipGroup,
  SurveyArea,
  SurveyEntry,
  SurveyFilterOptions,
} from '../types/survey';

export const DEFAULT_QUESTION = '¿Cómo fue tu experiencia hoy en tu visita?';
export const DEFAULT_THANK_YOU_TITLE = '¡Muchas gracias por tu opinión!';
export const DEFAULT_THANK_YOU_SUBTITLE =
  'Tu calificación nos ayuda a seguir brindando una atención de excelencia.';

export const DEFAULT_BRANCHES: Branch[] = [
  {
    id: 'autosol-jujuy',
    name: 'Autosol Jujuy',
    group: 'Autosol',
    city: 'San Salvador de Jujuy',
    question: DEFAULT_QUESTION,
    thankYouTitle: DEFAULT_THANK_YOU_TITLE,
    thankYouSubtitle: DEFAULT_THANK_YOU_SUBTITLE,
  },
  {
    id: 'autosol-salta',
    name: 'Autosol Salta',
    group: 'Autosol',
    city: 'Salta Capital',
    question: DEFAULT_QUESTION,
    thankYouTitle: DEFAULT_THANK_YOU_TITLE,
    thankYouSubtitle: DEFAULT_THANK_YOU_SUBTITLE,
  },
  {
    id: 'autolux-jujuy',
    name: 'Autolux Jujuy',
    group: 'Autolux',
    city: 'San Salvador de Jujuy',
    question: DEFAULT_QUESTION,
    thankYouTitle: DEFAULT_THANK_YOU_TITLE,
    thankYouSubtitle: DEFAULT_THANK_YOU_SUBTITLE,
  },
  {
    id: 'autolux-salta',
    name: 'Autolux Salta',
    group: 'Autolux',
    city: 'Salta Capital',
    question: DEFAULT_QUESTION,
    thankYouTitle: DEFAULT_THANK_YOU_TITLE,
    thankYouSubtitle: DEFAULT_THANK_YOU_SUBTITLE,
  },
  {
    id: 'autociel',
    name: 'Autociel',
    group: 'Autociel',
    city: 'Casa Central',
    question: DEFAULT_QUESTION,
    thankYouTitle: DEFAULT_THANK_YOU_TITLE,
    thankYouSubtitle: DEFAULT_THANK_YOU_SUBTITLE,
  },
];

export const SURVEY_AREAS: SurveyArea[] = [
  'Ventas',
  'Postventa / Taller',
  'Repuestos',
  'Administración',
];

/** Motivos rápidos según la calificación (positivo vs. a mejorar). */
export const POSITIVE_TAGS = [
  'Amabilidad',
  'Rapidez',
  'Asesoramiento',
  'Claridad en la información',
  'Instalaciones',
  'Cumplimiento de plazos',
];

export const IMPROVE_TAGS = [
  'Tiempo de espera',
  'Atención recibida',
  'Información poco clara',
  'Precio / Presupuesto',
  'Demora en la entrega',
  'Seguimiento posterior',
];

export function getTagsForRating(rating: number): string[] {
  return rating >= 4 ? POSITIVE_TAGS : IMPROVE_TAGS;
}

export const RATING_LABELS: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: 'Muy insatisfecho',
  2: 'Insatisfecho',
  3: 'Regular',
  4: 'Muy buena',
  5: 'Excelente',
};

export function getRatingLabel(rating: number): string {
  if (rating >= 1 && rating <= 5) {
    return RATING_LABELS[rating as 1 | 2 | 3 | 4 | 5];
  }
  return 'Sin calificar';
}

export function inferDealershipGroup(name: string): DealershipGroup {
  const normalized = name.trim().toLowerCase();
  if (normalized.includes('autosol')) return 'Autosol';
  if (normalized.includes('autolux')) return 'Autolux';
  if (normalized.includes('autociel')) return 'Autociel';
  return 'Otro';
}

export function slugifyBranchId(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function filterSurveys(
  surveys: SurveyEntry[],
  options: SurveyFilterOptions
): SurveyEntry[] {
  const query = options.searchQuery.trim().toLowerCase();

  return surveys.filter((entry) => {
    if (options.branchId !== 'all' && entry.branchId !== options.branchId) {
      return false;
    }
    if (options.ratingFilter !== 'all' && entry.rating !== options.ratingFilter) {
      return false;
    }
    if (query.length > 0) {
      const haystack = `${entry.branchName} ${entry.area} ${entry.comment} ${(entry.tags ?? []).join(' ')}`.toLowerCase();
      if (!haystack.includes(query)) {
        return false;
      }
    }
    return true;
  });
}

export function computeBranchStats(
  surveys: SurveyEntry[],
  branchId: string
): BranchStats {
  const scoped =
    branchId === 'all'
      ? surveys
      : surveys.filter((entry) => entry.branchId === branchId);

  const distribution: Record<1 | 2 | 3 | 4 | 5, number> = {
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0,
  };

  if (scoped.length === 0) {
    return {
      total: 0,
      average: 0,
      satisfactionRate: 0,
      distribution,
      lastCreatedAt: null,
    };
  }

  let sum = 0;
  let satisfied = 0;
  let latestIso: string | null = null;

  for (const item of scoped) {
    sum += item.rating;
    distribution[item.rating] += 1;
    if (item.rating >= 4) {
      satisfied += 1;
    }
    if (!latestIso || item.createdAt > latestIso) {
      latestIso = item.createdAt;
    }
  }

  return {
    total: scoped.length,
    average: Math.round((sum / scoped.length) * 10) / 10,
    satisfactionRate: Math.round((satisfied / scoped.length) * 100),
    distribution,
    lastCreatedAt: latestIso,
  };
}

function escapeCsvCell(value: string | number): string {
  const str = String(value ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function formatDateTimeEs(isoString: string): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return isoString;
  }
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export function formatCsv(surveys: SurveyEntry[]): string {
  const headers = [
    'ID',
    'Fecha y Hora',
    'Sucursal',
    'Estrellas',
    'Calificación',
    'Área',
    'Motivos',
    'Comentario',
  ];

  const rows = surveys.map((entry) => [
    escapeCsvCell(entry.id),
    escapeCsvCell(formatDateTimeEs(entry.createdAt)),
    escapeCsvCell(entry.branchName),
    escapeCsvCell(entry.rating),
    escapeCsvCell(getRatingLabel(entry.rating)),
    escapeCsvCell(entry.area),
    escapeCsvCell((entry.tags ?? []).join(', ')),
    escapeCsvCell(entry.comment),
  ]);

  const content = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
  return `\uFEFF${content}`;
}

export function formatTsvForSheets(surveys: SurveyEntry[]): string {
  const headers = [
    'Fecha y Hora',
    'Sucursal',
    'Estrellas',
    'Calificación',
    'Área',
    'Motivos',
    'Comentario',
  ];

  const sanitizeTsv = (value: string | number) =>
    String(value ?? '').replace(/[\t\r\n]+/g, ' ').trim();

  const rows = surveys.map((entry) =>
    [
      sanitizeTsv(formatDateTimeEs(entry.createdAt)),
      sanitizeTsv(entry.branchName),
      sanitizeTsv(entry.rating),
      sanitizeTsv(getRatingLabel(entry.rating)),
      sanitizeTsv(entry.area),
      sanitizeTsv((entry.tags ?? []).join(', ')),
      sanitizeTsv(entry.comment),
    ].join('\t')
  );

  return [headers.join('\t'), ...rows].join('\n');
}

export function validateSurveyVoteInput(input: {
  branchId?: unknown;
  rating?: unknown;
}): { ok: true; branchId: string; rating: 1 | 2 | 3 | 4 | 5 } | { ok: false; error: string } {
  if (typeof input.branchId !== 'string' || input.branchId.trim().length === 0) {
    return { ok: false, error: 'Debe seleccionar una sucursal válida.' };
  }
  const numericRating = Number(input.rating);
  if (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5) {
    return { ok: false, error: 'La calificación debe estar entre 1 y 5 estrellas.' };
  }
  return {
    ok: true,
    branchId: input.branchId.trim(),
    rating: numericRating as 1 | 2 | 3 | 4 | 5,
  };
}
