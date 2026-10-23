'use client';

/**
 * UseTemplateButton.tsx
 *
 * Small popover-style component that lists content templates filtered by type.
 * Used inside ConsultationsClient.tsx next to recipe/paraclinical/reposo blocks.
 *
 * Behavior:
 *  - Loads templates lazily on first open (avoids a fetch on every render).
 *  - Shows a search input to filter by name.
 *  - On select: if hasExistingContent, shows inline confirm "¿Agregar al contenido actual o
 *    reemplazarlo?" with three options (Agregar / Reemplazar / Cancelar).
 *  - Calls onApply(template, action) where action is 'append' or 'replace'.
 *
 * Accessibility:
 *  - Popover has role="dialog" and aria-label.
 *  - Escape closes the popover.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { BookMarked, Search, X, Loader2 } from 'lucide-react';
import { listContentTemplates } from '@/app/doctor/templates/content-actions';
import type { ContentTemplate, ContentTemplateType } from '@/app/doctor/templates/content-actions';

interface UseTemplateButtonProps {
  type: ContentTemplateType;
  hasExistingContent: boolean;
  onApply: (template: ContentTemplate, action: 'append' | 'replace') => void;
  /**
   * false cuando "agregar" no tiene sentido (reposo: un solo diagnóstico y un
   * solo período). Entonces la confirmación ofrece solo Reemplazar / Cancelar.
   */
  allowAppend?: boolean;
  className?: string;
}

export function UseTemplateButton({
  type,
  hasExistingContent,
  onApply,
  allowAppend = true,
  className = '',
}: UseTemplateButtonProps) {
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<ContentTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState('');
  const [confirmTemplate, setConfirmTemplate] = useState<ContentTemplate | null>(null);

  const buttonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Load templates once on first open
  useEffect(() => {
    if (!open || loaded) return;

    let cancelled = false;

    // Start loading via async callback to avoid synchronous setState in effect
    void (async () => {
      if (cancelled) return;
      setLoading(true);
      try {
        const data = await listContentTemplates(type);
        if (!cancelled) {
          setTemplates(data);
          setLoaded(true);
        }
      } catch {
        /* silently fail — list stays empty */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, loaded, type]);

  // Focus search when opening
  useEffect(() => {
    if (open) {
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  }, [open]);

  // Close on Escape
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        setOpen(false);
        setConfirmTemplate(null);
        buttonRef.current?.focus();
      }
    },
    [open],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
        setOpen(false);
        setConfirmTemplate(null);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const filtered = templates.filter((t) =>
    search ? t.name.toLowerCase().includes(search.toLowerCase()) : true,
  );

  function handleSelectTemplate(tpl: ContentTemplate) {
    if (hasExistingContent) {
      setConfirmTemplate(tpl);
    } else {
      onApply(tpl, 'append');
      setOpen(false);
      setSearch('');
    }
  }

  function handleConfirm(action: 'append' | 'replace') {
    if (!confirmTemplate) return;
    onApply(confirmTemplate, action);
    setConfirmTemplate(null);
    setOpen(false);
    setSearch('');
  }

  return (
    <div className={`relative ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
          setOpen((prev) => !prev);
          setConfirmTemplate(null);
        }}
        className="flex items-center gap-1.5 px-3 py-1.5 border border-teal-200 text-teal-700 rounded-lg text-xs font-semibold hover:bg-teal-50 transition-colors"
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <BookMarked className="w-3.5 h-3.5" />
        Usar plantilla
      </button>

      {open && (
        <div
          ref={dialogRef}
          role="dialog"
          aria-label="Seleccionar plantilla"
          className="absolute left-0 top-full mt-1.5 w-72 bg-white border border-slate-200 rounded-xl shadow-xl z-50"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-3 pt-3 pb-2 border-b border-slate-100">
            <p className="text-xs font-bold text-slate-700">Seleccionar plantilla</p>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setConfirmTemplate(null);
                buttonRef.current?.focus();
              }}
              className="text-slate-400 hover:text-slate-600"
              aria-label="Cerrar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Confirm screen */}
          {confirmTemplate && (
            <div className="p-3 space-y-3">
              <p className="text-xs text-slate-700">
                Ya tienes contenido en este bloque.
                <br />
                <strong className="text-slate-900">
                  {allowAppend
                    ? '¿Agregar al contenido actual o reemplazarlo?'
                    : '¿Reemplazar el contenido actual con la plantilla?'}
                </strong>
              </p>
              <p className="text-xs font-semibold text-teal-700 truncate">
                Plantilla: {confirmTemplate.name}
              </p>
              <div className="flex gap-2">
                {allowAppend && (
                  <button
                    type="button"
                    onClick={() => handleConfirm('append')}
                    className="flex-1 py-2 text-xs font-bold bg-teal-500 text-white rounded-lg hover:bg-teal-600 transition-colors"
                  >
                    Agregar
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleConfirm('replace')}
                  className="flex-1 py-2 text-xs font-bold border border-amber-300 text-amber-700 rounded-lg hover:bg-amber-50 transition-colors"
                >
                  Reemplazar
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmTemplate(null)}
                  className="flex-1 py-2 text-xs font-bold border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* Template list (only when not confirming) */}
          {!confirmTemplate && (
            <>
              {/* Search */}
              <div className="px-3 py-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <input
                    ref={searchRef}
                    type="text"
                    placeholder="Buscar plantilla..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg outline-none focus:border-teal-400 bg-white"
                  />
                </div>
              </div>

              {/* List */}
              <div className="max-h-48 overflow-y-auto px-1 pb-2">
                {loading && (
                  <div className="flex items-center justify-center gap-2 py-6 text-xs text-slate-500">
                    <Loader2 className="w-4 h-4 animate-spin text-teal-500" />
                    Cargando plantillas…
                  </div>
                )}
                {!loading && filtered.length === 0 && (
                  <p className="text-xs text-slate-400 text-center py-5 px-2">
                    {templates.length === 0
                      ? 'No tienes plantillas de este tipo todavía.'
                      : 'Sin resultados para tu búsqueda.'}
                  </p>
                )}
                {!loading &&
                  filtered.map((tpl) => (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => handleSelectTemplate(tpl)}
                      className="w-full text-left px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-teal-50 hover:text-teal-800 rounded-lg transition-colors"
                    >
                      {tpl.name}
                    </button>
                  ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
