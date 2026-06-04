'use client';

/**
 * /admin/roles — Editor de la matriz de capacidades por rol (RBAC en BD).
 *
 * ETAPA 1 — consume el backend NestJS módulo `capabilities` vía route handlers
 * thin-proxy (`/api/admin/role-capabilities` GET/PUT + `/refresh` POST). Cada
 * toggle hace upsert e invalida la caché Redis del rol → aplica al instante sin
 * re-login. Sin Supabase. Reemplaza la antigua página de admin-users (rol ficticio
 * `vendedor` + permisos inventados que no existían en el backend).
 */

import { useState, useEffect } from 'react';
import { Shield, RefreshCw, Loader2, Check } from 'lucide-react';

type Action = 'view' | 'create' | 'edit' | 'delete';

type CapabilityRow = {
  id: string;
  role: string;
  module_key: string;
  action: string;
  allowed: boolean;
};

const ROLES: { key: string; label: string }[] = [
  { key: 'super_admin', label: 'Super Admin' },
  { key: 'admin', label: 'Admin' },
  { key: 'doctor', label: 'Especialista' },
  { key: 'assistant', label: 'Asistente' },
  { key: 'patient', label: 'Paciente' },
];

const ACTIONS: { key: Action; label: string }[] = [
  { key: 'view', label: 'Ver' },
  { key: 'create', label: 'Crear' },
  { key: 'edit', label: 'Editar' },
  { key: 'delete', label: 'Eliminar' },
];

/** key helper for the (module, action) lookup within a role. */
function cellKey(moduleKey: string, action: string): string {
  return `${moduleKey}:${action}`;
}

function readError(data: unknown, fallback: string): string {
  if (typeof data === 'object' && data && 'error' in data) {
    return String((data as { error: unknown }).error);
  }
  return fallback;
}

export default function RolesPage() {
  const [grouped, setGrouped] = useState<Record<string, CapabilityRow[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectedRole, setSelectedRole] = useState<string>('doctor');
  const [refreshing, setRefreshing] = useState(false);
  const [pending, setPending] = useState<Record<string, boolean>>({});

  // Initial load. The fetch awaits before any setState so this effect does not
  // call setState synchronously (state starts as loading=true / error='').
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/role-capabilities', { cache: 'no-store' });
        const data: unknown = await res.json();
        if (!res.ok) throw new Error(readError(data, 'No se pudieron cargar las capacidades'));
        if (!cancelled) setGrouped((data ?? {}) as Record<string, CapabilityRow[]>);
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Error al cargar capacidades');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Union of every module_key across all roles, so an admin can grant any module
  // to any role (the backend PUT upserts rows that don't exist yet).
  const allModules: string[] = Array.from(
    new Set(
      Object.values(grouped)
        .flat()
        .map((r) => r.module_key),
    ),
  ).sort();

  // Lookup of allowed cells for the selected role.
  const roleRows = grouped[selectedRole] ?? [];
  const allowedByCell = new Map<string, boolean>();
  for (const row of roleRows) {
    allowedByCell.set(cellKey(row.module_key, row.action), row.allowed);
  }

  function isAllowed(moduleKey: string, action: Action): boolean {
    return allowedByCell.get(cellKey(moduleKey, action)) ?? false;
  }

  async function toggle(moduleKey: string, action: Action) {
    const current = isAllowed(moduleKey, action);
    const next = !current;
    const pendingKey = `${selectedRole}:${cellKey(moduleKey, action)}`;
    setError('');
    setSuccess('');
    setPending((p) => ({ ...p, [pendingKey]: true }));

    // Optimistic update (snapshot for rollback).
    const snapshot = grouped;
    setGrouped((prev) => {
      const rows = [...(prev[selectedRole] ?? [])];
      const idx = rows.findIndex((r) => r.module_key === moduleKey && r.action === action);
      if (idx >= 0) {
        rows[idx] = { ...rows[idx], allowed: next };
      } else {
        rows.push({
          id: `temp-${pendingKey}`,
          role: selectedRole,
          module_key: moduleKey,
          action,
          allowed: next,
        });
      }
      return { ...prev, [selectedRole]: rows };
    });

    try {
      const res = await fetch('/api/admin/role-capabilities', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: selectedRole, module_key: moduleKey, action, allowed: next }),
      });
      const data: unknown = await res.json();
      if (!res.ok) throw new Error(readError(data, 'No se pudo guardar el cambio'));
      // Reconcile the saved row (real id) into state.
      const saved = data as CapabilityRow;
      setGrouped((prev) => {
        const rows = [...(prev[selectedRole] ?? [])];
        const idx = rows.findIndex((r) => r.module_key === moduleKey && r.action === action);
        if (idx >= 0) rows[idx] = saved;
        return { ...prev, [selectedRole]: rows };
      });
      setSuccess(`${moduleKey} · ${action} → ${next ? 'permitido' : 'denegado'}`);
    } catch (e: unknown) {
      setGrouped(snapshot); // rollback
      setError(e instanceof Error ? e.message : 'Error al guardar');
    } finally {
      setPending((p) => {
        const copy = { ...p };
        delete copy[pendingKey];
        return copy;
      });
    }
  }

  async function handleRefreshCache() {
    setRefreshing(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch('/api/admin/role-capabilities/refresh', { method: 'POST' });
      const data: unknown = await res.json();
      if (!res.ok) throw new Error(readError(data, 'No se pudo refrescar la caché'));
      const keysDeleted =
        typeof data === 'object' && data && 'keysDeleted' in data
          ? Number((data as { keysDeleted: unknown }).keysDeleted)
          : 0;
      setSuccess(
        `Caché refrescada — ${keysDeleted} ${keysDeleted === 1 ? 'entrada borrada' : 'entradas borradas'}`,
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al refrescar la caché');
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-teal-50 text-teal-600">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Roles y permisos</h1>
            <p className="text-sm text-slate-500 mt-0.5 max-w-xl">
              Define qué módulos y acciones puede usar cada rol. Los cambios se aplican al instante
              (sin necesidad de volver a iniciar sesión).
            </p>
          </div>
        </div>
        <button
          onClick={handleRefreshCache}
          disabled={refreshing}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 transition-colors disabled:opacity-50"
        >
          {refreshing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          Refrescar caché
        </button>
      </div>

      {/* Feedback */}
      {error && (
        <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="px-4 py-3 rounded-lg bg-teal-50 border border-teal-200 text-sm text-teal-700 flex items-center gap-2">
          <Check className="w-4 h-4 shrink-0" />
          {success}
        </div>
      )}

      {/* Role selector */}
      <div className="flex flex-wrap gap-2">
        {ROLES.map((r) => {
          const active = r.key === selectedRole;
          return (
            <button
              key={r.key}
              onClick={() => {
                setSelectedRole(r.key);
                setError('');
                setSuccess('');
              }}
              className={
                active
                  ? 'px-4 py-2 rounded-lg text-sm font-semibold bg-teal-500 text-white shadow-sm'
                  : 'px-4 py-2 rounded-lg text-sm font-medium text-slate-600 bg-white border border-slate-200 hover:border-teal-300 hover:text-teal-700 transition-colors'
              }
            >
              {r.label}
            </button>
          );
        })}
      </div>

      {/* Matrix */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Cargando capacidades…</span>
          </div>
        ) : allModules.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-400">
            No hay capacidades configuradas.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left font-semibold text-slate-600 px-5 py-3">Módulo</th>
                  {ACTIONS.map((a) => (
                    <th
                      key={a.key}
                      className="text-center font-semibold text-slate-600 px-4 py-3 w-24"
                    >
                      {a.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allModules.map((moduleKey) => (
                  <tr
                    key={moduleKey}
                    className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60 transition-colors"
                  >
                    <td className="px-5 py-3 font-medium text-slate-800 font-mono text-[13px]">
                      {moduleKey}
                    </td>
                    {ACTIONS.map((a) => {
                      const checked = isAllowed(moduleKey, a.key);
                      const pendingKey = `${selectedRole}:${cellKey(moduleKey, a.key)}`;
                      const isPending = pending[pendingKey] ?? false;
                      return (
                        <td key={a.key} className="text-center px-4 py-3">
                          <button
                            role="switch"
                            aria-checked={checked}
                            aria-label={`${a.label} ${moduleKey}`}
                            disabled={isPending}
                            onClick={() => void toggle(moduleKey, a.key)}
                            className={
                              checked
                                ? 'inline-flex items-center justify-center w-9 h-6 rounded-full bg-teal-500 transition-colors disabled:opacity-50'
                                : 'inline-flex items-center justify-center w-9 h-6 rounded-full bg-slate-200 transition-colors disabled:opacity-50'
                            }
                          >
                            {isPending ? (
                              <Loader2 className="w-3 h-3 animate-spin text-white" />
                            ) : (
                              <span
                                className={
                                  checked
                                    ? 'block w-4 h-4 rounded-full bg-white translate-x-[7px] transition-transform'
                                    : 'block w-4 h-4 rounded-full bg-white -translate-x-[7px] transition-transform'
                                }
                              />
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
