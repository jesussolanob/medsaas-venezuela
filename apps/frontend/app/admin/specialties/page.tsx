'use client';

/**
 * /admin/specialties — Mantenedor CRUD de especialidades médicas (super_admin).
 *
 * ETAPA 1 — consume el BFF thin-proxy:
 *   GET  /api/admin/specialties        → lista completa (activas e inactivas)
 *   POST /api/admin/specialties        → crear
 *   PUT  /api/admin/specialties/:id    → editar nombre, orden y/o estado
 */

import { useState, useEffect, useRef } from 'react';
import {
  Stethoscope,
  Plus,
  Pencil,
  Check,
  X,
  ToggleLeft,
  ToggleRight,
  Loader2,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { showToast } from '@/components/ui/Toaster';
import { reportError } from '@/lib/report-error';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Specialty {
  id: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function readErrorMsg(data: unknown, fallback: string): string {
  if (typeof data === 'object' && data !== null && 'error' in data) {
    const msg = (data as { error: unknown }).error;
    return typeof msg === 'string' ? msg : fallback;
  }
  return fallback;
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function SpecialtiesPage() {
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [loading, setLoading] = useState(true);

  // Create form state
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newOrder, setNewOrder] = useState('');
  const [creating, setCreating] = useState(false);

  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editOrder, setEditOrder] = useState('');
  const [saving, setSaving] = useState(false);

  // Toggling state — track which id is pending
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const newNameRef = useRef<HTMLInputElement>(null);
  const editNameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void loadData();
  }, []);

  // Auto-focus create input when form opens
  useEffect(() => {
    if (showForm) {
      setTimeout(() => newNameRef.current?.focus(), 50);
    }
  }, [showForm]);

  // Auto-focus edit input when edit opens
  useEffect(() => {
    if (editingId) {
      setTimeout(() => editNameRef.current?.focus(), 50);
    }
  }, [editingId]);

  async function loadData() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/specialties');
      const json: unknown = await res.json();
      if (!res.ok) {
        showToast({ type: 'error', message: readErrorMsg(json, 'Error al cargar especialidades') });
        setSpecialties([]);
        return;
      }
      const envelope = json as { success: boolean; data: Specialty[] };
      setSpecialties(Array.isArray(envelope.data) ? envelope.data : []);
    } catch (err) {
      reportError('admin/specialties', 'loadData', err);
      showToast({ type: 'error', message: 'Error de conexión al cargar especialidades' });
    } finally {
      setLoading(false);
    }
  }

  function resetCreateForm() {
    setNewName('');
    setNewOrder('');
    setShowForm(false);
  }

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const body: Record<string, unknown> = { name };
      const order = parseInt(newOrder, 10);
      if (!isNaN(order)) body.sort_order = order;

      const res = await fetch('/api/admin/specialties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json: unknown = await res.json();
      if (!res.ok) {
        showToast({ type: 'error', message: readErrorMsg(json, 'Error al crear especialidad') });
        return;
      }
      showToast({ type: 'success', message: `Especialidad "${name}" creada` });
      resetCreateForm();
      void loadData();
    } catch (err) {
      reportError('admin/specialties', 'handleCreate', err);
      showToast({ type: 'error', message: 'Error de conexión al crear especialidad' });
    } finally {
      setCreating(false);
    }
  }

  function startEdit(sp: Specialty) {
    setEditingId(sp.id);
    setEditName(sp.name);
    setEditOrder(String(sp.sortOrder));
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName('');
    setEditOrder('');
  }

  async function handleSaveEdit(sp: Specialty) {
    const name = editName.trim();
    if (!name) return;
    setSaving(true);
    try {
      const update: Record<string, unknown> = {};
      if (name !== sp.name) update.name = name;
      const order = parseInt(editOrder, 10);
      if (!isNaN(order) && order !== sp.sortOrder) update.sort_order = order;

      if (Object.keys(update).length === 0) {
        cancelEdit();
        return;
      }

      const res = await fetch(`/api/admin/specialties/${sp.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(update),
      });
      const json: unknown = await res.json();
      if (!res.ok) {
        showToast({ type: 'error', message: readErrorMsg(json, 'Error al guardar cambios') });
        return;
      }
      showToast({ type: 'success', message: 'Especialidad actualizada' });
      cancelEdit();
      void loadData();
    } catch (err) {
      reportError('admin/specialties', 'handleSaveEdit', err);
      showToast({ type: 'error', message: 'Error de conexión al guardar cambios' });
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(sp: Specialty) {
    setTogglingId(sp.id);
    // Optimistic update
    setSpecialties((prev) =>
      prev.map((s) => (s.id === sp.id ? { ...s, isActive: !s.isActive } : s)),
    );
    try {
      const res = await fetch(`/api/admin/specialties/${sp.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !sp.isActive }),
      });
      const json: unknown = await res.json();
      if (!res.ok) {
        // Revert optimistic update
        setSpecialties((prev) =>
          prev.map((s) => (s.id === sp.id ? { ...s, isActive: sp.isActive } : s)),
        );
        showToast({ type: 'error', message: readErrorMsg(json, 'Error al cambiar estado') });
      } else {
        const label = !sp.isActive ? 'activada' : 'desactivada';
        showToast({ type: 'success', message: `"${sp.name}" ${label}` });
      }
    } catch (err) {
      // Revert optimistic update
      setSpecialties((prev) =>
        prev.map((s) => (s.id === sp.id ? { ...s, isActive: sp.isActive } : s)),
      );
      reportError('admin/specialties', 'handleToggle', err);
      showToast({ type: 'error', message: 'Error de conexión al cambiar estado' });
    } finally {
      setTogglingId(null);
    }
  }

  const activeCount = specialties.filter((s) => s.isActive).length;
  const inactiveCount = specialties.length - activeCount;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-semibold text-slate-900">Especialidades</h2>
          <p className="text-slate-500 text-xs sm:text-sm mt-1">
            Administra las especialidades médicas disponibles en la plataforma
          </p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-teal-500 text-white text-sm font-semibold rounded-lg hover:bg-teal-600 transition-colors shrink-0"
        >
          <Plus className="w-4 h-4" />
          Nueva Especialidad
        </button>
      </div>

      {/* Stats strip */}
      {!loading && specialties.length > 0 && (
        <div className="flex gap-3 flex-wrap">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-600">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            {activeCount} activa{activeCount !== 1 ? 's' : ''}
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-500">
            <span className="w-2 h-2 rounded-full bg-slate-300" />
            {inactiveCount} inactiva{inactiveCount !== 1 ? 's' : ''}
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-400">
            {specialties.length} en total
          </span>
        </div>
      )}

      {/* Create form */}
      {showForm && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-900">Nueva especialidad</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Nombre <span className="text-red-500">*</span>
              </label>
              <input
                ref={newNameRef}
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleCreate();
                  if (e.key === 'Escape') resetCreateForm();
                }}
                placeholder="Ej: Cardiología"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:border-teal-400 focus:ring-2 focus:ring-teal-500/10 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Orden de visualización
                <span className="text-slate-400 font-normal ml-1">(opcional)</span>
              </label>
              <input
                type="number"
                min={0}
                value={newOrder}
                onChange={(e) => setNewOrder(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleCreate();
                  if (e.key === 'Escape') resetCreateForm();
                }}
                placeholder="Ej: 10"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:border-teal-400 focus:ring-2 focus:ring-teal-500/10 outline-none"
              />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={resetCreateForm}
              className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={() => void handleCreate()}
              disabled={creating || !newName.trim()}
              className="px-4 py-2 text-sm font-semibold text-white bg-teal-500 rounded-lg hover:bg-teal-600 disabled:opacity-50 transition-colors inline-flex items-center gap-2"
            >
              {creating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {creating ? 'Creando...' : 'Crear Especialidad'}
            </button>
          </div>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 flex items-center justify-center">
          <Loader2 className="w-6 h-6 text-teal-500 animate-spin mr-3" />
          <span className="text-slate-400 text-sm">Cargando especialidades...</span>
        </div>
      ) : specialties.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <Stethoscope className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No hay especialidades registradas</p>
          <p className="text-sm text-slate-400 mt-1">
            Crea la primera especialidad con el botón de arriba
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {/* Table header */}
          <div className="hidden sm:grid grid-cols-[1fr_auto_auto_auto] gap-4 px-5 py-3 bg-slate-50 border-b border-slate-100 text-xs font-semibold text-slate-500 uppercase tracking-wide">
            <span>Nombre</span>
            <span className="text-center w-16">Orden</span>
            <span className="text-center w-24">Estado</span>
            <span className="w-20" />
          </div>

          {/* Rows */}
          <ul className="divide-y divide-slate-100">
            {specialties.map((sp) => {
              const isEditing = editingId === sp.id;
              const isToggling = togglingId === sp.id;

              return (
                <li
                  key={sp.id}
                  className={`px-4 sm:px-5 py-3.5 transition-colors ${
                    isEditing ? 'bg-teal-50/40' : 'hover:bg-slate-50/60'
                  }`}
                >
                  {isEditing ? (
                    /* ── Inline edit row ── */
                    <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto_auto] gap-3 sm:gap-4 items-center">
                      <input
                        ref={editNameRef}
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void handleSaveEdit(sp);
                          if (e.key === 'Escape') cancelEdit();
                        }}
                        className="px-3 py-1.5 text-sm border border-teal-300 rounded-lg focus:border-teal-400 focus:ring-2 focus:ring-teal-500/10 outline-none"
                      />
                      <input
                        type="number"
                        min={0}
                        value={editOrder}
                        onChange={(e) => setEditOrder(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void handleSaveEdit(sp);
                          if (e.key === 'Escape') cancelEdit();
                        }}
                        placeholder="Orden"
                        className="w-20 px-3 py-1.5 text-sm border border-teal-300 rounded-lg focus:border-teal-400 focus:ring-2 focus:ring-teal-500/10 outline-none text-center"
                      />
                      <div className="flex items-center gap-1.5 sm:col-span-2 justify-end">
                        <button
                          onClick={cancelEdit}
                          className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                          title="Cancelar"
                        >
                          <X className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => void handleSaveEdit(sp)}
                          disabled={saving || !editName.trim()}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-teal-500 rounded-lg hover:bg-teal-600 disabled:opacity-50 transition-colors"
                        >
                          {saving ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Check className="w-3.5 h-3.5" />
                          )}
                          Guardar
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* ── Display row ── */
                    <div className="flex flex-col sm:grid sm:grid-cols-[1fr_auto_auto_auto] gap-2 sm:gap-4 sm:items-center">
                      {/* Name */}
                      <div className="flex items-center gap-2 min-w-0">
                        <Stethoscope
                          className={`w-4 h-4 shrink-0 ${sp.isActive ? 'text-teal-500' : 'text-slate-300'}`}
                        />
                        <span
                          className={`text-sm font-medium truncate ${
                            sp.isActive ? 'text-slate-800' : 'text-slate-400'
                          }`}
                        >
                          {sp.name}
                        </span>
                      </div>

                      {/* Sort order */}
                      <div className="flex items-center gap-1 sm:justify-center sm:w-16">
                        <span className="text-xs text-slate-400 sm:hidden">Orden:</span>
                        <span className="inline-flex items-center gap-1 text-xs font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                          {sp.sortOrder > 0 ? (
                            <ArrowUp className="w-3 h-3 text-slate-400" />
                          ) : (
                            <ArrowDown className="w-3 h-3 text-slate-400" />
                          )}
                          {sp.sortOrder}
                        </span>
                      </div>

                      {/* Status badge */}
                      <div className="sm:w-24 sm:flex sm:justify-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                            sp.isActive
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              sp.isActive ? 'bg-emerald-500' : 'bg-slate-400'
                            }`}
                          />
                          {sp.isActive ? 'Activa' : 'Inactiva'}
                        </span>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1.5 sm:w-20 justify-end">
                        <button
                          onClick={() => handleToggle(sp)}
                          disabled={isToggling}
                          className={`p-1.5 rounded-lg transition-colors disabled:opacity-50 ${
                            sp.isActive
                              ? 'text-emerald-600 hover:bg-emerald-50'
                              : 'text-slate-400 hover:bg-slate-100'
                          }`}
                          title={sp.isActive ? 'Desactivar' : 'Activar'}
                        >
                          {isToggling ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : sp.isActive ? (
                            <ToggleRight className="w-4 h-4" />
                          ) : (
                            <ToggleLeft className="w-4 h-4" />
                          )}
                        </button>
                        <button
                          onClick={() => startEdit(sp)}
                          className="p-1.5 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                          title="Editar"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
