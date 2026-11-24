export type DealershipGroup = 'Autosol' | 'Autolux' | 'Autociel' | 'Otro';

export interface Branch {
  id: string;
  name: string;
  group: DealershipGroup;
  city: string;
  question: string;
  thankYouTitle: string;
  thankYouSubtitle: string;
}

export type SurveyArea =
  | 'Ventas'
  | 'Postventa / Taller'
  | 'Repuestos'
  | 'Administración'
  | 'General';

export interface SurveyEntry {
  id: string;
  branchId: string;
  branchName: string;
  rating: 1 | 2 | 3 | 4 | 5;
  area: SurveyArea;
  comment: string;
  createdAt: string;
  /** Motivos rápidos elegidos por el cliente (opcional). */
  tags?: string[];
}

export interface BranchStats {
  total: number;
  average: number;
  satisfactionRate: number;
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
  lastCreatedAt: string | null;
}

export interface SurveyFilterOptions {
  branchId: string;
  ratingFilter: number | 'all';
  searchQuery: string;
}

export type SyncState = 'local' | 'synced' | 'syncing' | 'pending' | 'error';
