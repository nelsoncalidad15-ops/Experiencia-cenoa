import { Building2 } from 'lucide-react';
import type { Branch } from '../types/survey';

interface BranchSelectorBarProps {
  branches: Branch[];
  activeBranchId: string;
  onSelectBranch: (branchId: string) => void;
  allowAllOption?: boolean;
  isAllSelected?: boolean;
  onSelectAll?: () => void;
  contextLabel: string;
}

export function BranchSelectorBar({
  branches,
  activeBranchId,
  onSelectBranch,
  allowAllOption = false,
  isAllSelected = false,
  onSelectAll,
  contextLabel,
}: BranchSelectorBarProps) {
  return (
    <div className="border-b border-slate-200/80 bg-slate-50/70">
      <div className="mx-auto flex max-w-7xl flex-col gap-2.5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <div className="flex items-center gap-2 text-xs font-medium text-slate-600 shrink-0">
          <Building2 className="h-4 w-4 text-amber-700" aria-hidden="true" />
          <span>{contextLabel}</span>
        </div>

        <div
          role="group"
          aria-label="Selector persistente de sucursal"
          className="flex flex-wrap items-center gap-1.5"
        >
          {allowAllOption && onSelectAll && (
            <button
              type="button"
              onClick={onSelectAll}
              className={`min-h-[38px] rounded-lg border px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 ${
                isAllSelected
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
              }`}
            >
              Todas las sucursales
            </button>
          )}

          {branches.map((branch) => {
            const selected = !isAllSelected && activeBranchId === branch.id;
            return (
              <button
                key={branch.id}
                type="button"
                onClick={() => onSelectBranch(branch.id)}
                aria-pressed={selected}
                className={`min-h-[38px] rounded-lg border px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 ${
                  selected
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                }`}
              >
                {branch.name}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
