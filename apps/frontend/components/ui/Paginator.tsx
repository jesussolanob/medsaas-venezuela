'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

/** Sentinel value for "show all" page size. */
export const PAGE_SIZE_ALL = 0;

export interface PaginatorProps {
  /** Current page (1-based). */
  page: number;
  /** Number of items per page. Use `PAGE_SIZE_ALL` (0) for "Todas". */
  pageSize: number;
  /** Total number of items (from the server). */
  total: number;
  /** Called when the user navigates to a different page. */
  onPageChange: (page: number) => void;
  /** Called when the user changes the page size. */
  onPageSizeChange: (size: number) => void;
  /**
   * Available page size options (default: [10, 15, 20]).
   * "Todas" is always appended automatically.
   */
  pageSizeOptions?: number[];
}

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 15, 20];

export default function Paginator({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
}: PaginatorProps) {
  const isAll = pageSize === PAGE_SIZE_ALL;
  const totalPages = isAll || pageSize <= 0 ? 1 : Math.max(1, Math.ceil(total / pageSize));
  const showingFrom = isAll ? 1 : Math.min((page - 1) * pageSize + 1, total);
  const showingTo = isAll ? total : Math.min(page * pageSize, total);

  if (total === 0) return null;

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-slate-100 bg-white">
      {/* Left: size selector + item count */}
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <span>Mostrar</span>
        <div className="flex items-center gap-0.5 bg-slate-100 p-0.5 rounded-lg">
          {pageSizeOptions.map((opt) => (
            <button
              key={opt}
              onClick={() => onPageSizeChange(opt)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                pageSize === opt
                  ? 'bg-white text-teal-600 shadow-sm font-semibold'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {opt}
            </button>
          ))}
          <button
            onClick={() => onPageSizeChange(PAGE_SIZE_ALL)}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
              isAll
                ? 'bg-white text-teal-600 shadow-sm font-semibold'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Todas
          </button>
        </div>
        <span>
          {isAll
            ? `${total} resultado${total !== 1 ? 's' : ''}`
            : `${showingFrom}–${showingTo} de ${total}`}
        </span>
      </div>

      {/* Right: page navigation (hidden when showing all or only 1 page) */}
      {!isAll && totalPages > 1 && (
        <div className="flex items-center gap-1">
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page === 1}
            className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            aria-label="Página anterior"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>

          {/* Page number buttons — show up to 5 around current page */}
          <div className="flex items-center gap-0.5">
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
              .reduce<(number | 'ellipsis')[]>((acc, p, idx, arr) => {
                if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push('ellipsis');
                acc.push(p);
                return acc;
              }, [])
              .map((item, idx) =>
                item === 'ellipsis' ? (
                  <span key={`e-${idx}`} className="px-1.5 text-xs text-slate-400">
                    …
                  </span>
                ) : (
                  <button
                    key={item}
                    onClick={() => onPageChange(item as number)}
                    className={`min-w-[28px] h-7 rounded-md text-xs font-medium transition-all ${
                      page === item
                        ? 'bg-teal-500 text-white font-semibold'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {item}
                  </button>
                ),
              )}
          </div>

          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page === totalPages}
            className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            aria-label="Página siguiente"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
