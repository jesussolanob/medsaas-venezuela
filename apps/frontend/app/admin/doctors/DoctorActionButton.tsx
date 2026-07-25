'use client';
import { useState } from 'react';
import { reportError } from '@/lib/report-error';
import { showToast } from '@/components/ui/Toaster';

interface DoctorActionButtonProps {
  doctorId: string;
  isActive: boolean;
  onSuccess?: () => void;
}

export default function DoctorActionButton({
  doctorId,
  isActive,
  onSuccess,
}: DoctorActionButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleToggle = async () => {
    const action = isActive ? 'suspend' : 'activate';
    const message = isActive
      ? '¿Estás seguro de que deseas suspender este médico?'
      : '¿Estás seguro de que deseas activar este médico?';

    if (!confirm(message)) return;

    try {
      setLoading(true);
      setError('');

      const response = await fetch('/api/admin/toggle-doctor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doctorId, action }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Error actualizando estado');
      }

      showToast({
        type: 'success',
        message: `Especialista ${action === 'activate' ? 'activado' : 'suspendido'}`,
      });
      onSuccess?.();
      // Refresh the page to show updated data
      window.location.reload();
    } catch (err: unknown) {
      reportError('DoctorActionButton', 'handleToggle', err);
      const errMsg = err instanceof Error ? err.message : 'Error al actualizar el estado';
      setError(errMsg);
      showToast({ type: 'error', message: errMsg });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={handleToggle}
        disabled={loading}
        className={`text-xs font-medium transition-colors disabled:opacity-60 ${
          isActive ? 'text-red-500 hover:text-red-700' : 'text-emerald-500 hover:text-emerald-700'
        }`}
      >
        {loading ? 'Actualizando...' : isActive ? 'Suspender' : 'Activar'}
      </button>
      {error && <div className="text-xs text-red-500 mt-1">{error}</div>}
    </>
  );
}
