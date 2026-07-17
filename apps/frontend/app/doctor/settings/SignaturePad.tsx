'use client';

/**
 * SignaturePad — permite al doctor dibujar su firma en un canvas y guardarla
 * con el mismo flujo que el upload de imagen: POST /api/storage/upload (kind=signature)
 * → saveSignatureUrl(url).
 *
 * Dimensiones internas: 400×160 px (trazo negro sobre transparente, PNG).
 * El canvas se escala visualmente para adaptarse al contenedor con CSS.
 */

import { useRef, useState, useEffect, useCallback } from 'react';
import { Eraser, Check, Loader2 } from 'lucide-react';
import { saveSignatureUrl } from './actions';

interface SignaturePadProps {
  /** Callback que recibe la URL guardada en el backend para actualizar el preview externo. */
  onSaved: (url: string) => void;
  /** Callback opcional para mostrar errores externos. */
  onError?: (msg: string) => void;
}

const PAD_WIDTH = 400;
const PAD_HEIGHT = 160;

export default function SignaturePad({ onSaved, onError }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isEmpty, setIsEmpty] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Último punto para trazar líneas continuas (no puntos aislados)
  const lastPoint = useRef<{ x: number; y: number } | null>(null);

  // Inicializa el contexto del canvas con estilo de trazo
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.strokeStyle = '#0f172a'; // slate-900: trazo oscuro visible
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

  /** Convierte coordenadas de un evento (mouse o touch) al espacio interno del canvas. */
  function getCanvasPoint(
    clientX: number,
    clientY: number,
    canvas: HTMLCanvasElement,
  ): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    const scaleX = PAD_WIDTH / rect.width;
    const scaleY = PAD_HEIGHT / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }

  function startDraw(e: React.MouseEvent<HTMLCanvasElement>) {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    setIsDrawing(true);
    const pt = getCanvasPoint(e.clientX, e.clientY, canvas);
    lastPoint.current = pt;
    // Dibuja un punto inicial para que un clic simple sea visible
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.fillStyle = '#0f172a';
    ctx.fill();
    setIsEmpty(false);
  }

  function draw(e: React.MouseEvent<HTMLCanvasElement>) {
    e.preventDefault();
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const pt = getCanvasPoint(e.clientX, e.clientY, canvas);
    if (lastPoint.current) {
      ctx.beginPath();
      ctx.moveTo(lastPoint.current.x, lastPoint.current.y);
      ctx.lineTo(pt.x, pt.y);
      ctx.stroke();
    }
    lastPoint.current = pt;
    setIsEmpty(false);
  }

  function endDraw() {
    setIsDrawing(false);
    lastPoint.current = null;
  }

  // --- Touch events ---

  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const touch = e.touches[0];
    if (!touch) return;
    setIsDrawing(true);
    const pt = getCanvasPoint(touch.clientX, touch.clientY, canvas);
    lastPoint.current = pt;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.fillStyle = '#0f172a';
    ctx.fill();
    setIsEmpty(false);
  }, []);

  const handleTouchMove = useCallback(
    (e: React.TouchEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      if (!isDrawing) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const touch = e.touches[0];
      if (!touch) return;
      const pt = getCanvasPoint(touch.clientX, touch.clientY, canvas);
      if (lastPoint.current) {
        ctx.beginPath();
        ctx.moveTo(lastPoint.current.x, lastPoint.current.y);
        ctx.lineTo(pt.x, pt.y);
        ctx.stroke();
      }
      lastPoint.current = pt;
    },
    [isDrawing],
  );

  const handleTouchEnd = useCallback(() => {
    setIsDrawing(false);
    lastPoint.current = null;
  }, []);

  function clearPad() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, PAD_WIDTH, PAD_HEIGHT);
    setIsEmpty(true);
    setError('');
  }

  async function handleSave() {
    const canvas = canvasRef.current;
    if (!canvas || isEmpty) return;
    setSaving(true);
    setError('');
    try {
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), 'image/png');
      });
      if (!blob) throw new Error('No se pudo exportar la firma como imagen.');

      const fd = new FormData();
      fd.append('file', blob, 'firma.png');
      fd.append('kind', 'signature');

      const res = await fetch('/api/storage/upload', { method: 'POST', body: fd });
      const json = (await res.json()) as { data?: { url?: string }; error?: { message?: string } };
      if (!res.ok || !json?.data?.url) {
        throw new Error(json?.error?.message ?? 'Error al subir la firma');
      }
      const url = json.data.url;

      const saved = await saveSignatureUrl(url);
      if (!saved.ok) {
        throw new Error(saved.error ?? 'Error al guardar la URL de la firma');
      }

      onSaved(url);
      clearPad();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      setError(msg);
      onError?.(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2">
      {/* Canvas */}
      <div
        className="rounded-xl overflow-hidden border-2 border-dashed border-slate-200 bg-slate-50 w-full"
        style={{ aspectRatio: `${PAD_WIDTH} / ${PAD_HEIGHT}` }}
      >
        <canvas
          ref={canvasRef}
          width={PAD_WIDTH}
          height={PAD_HEIGHT}
          className="w-full h-full cursor-crosshair touch-none select-none"
          style={{ display: 'block' }}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          aria-label="Área para dibujar la firma"
          role="img"
        />
      </div>

      {/* Línea guía visual */}
      <p className="text-[10px] text-slate-400 text-center">
        Dibuja tu firma con el mouse o con el dedo en pantallas táctiles
      </p>

      {error && <p className="text-xs text-red-600">{error}</p>}

      {/* Botones */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={clearPad}
          disabled={isEmpty || saving}
          className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Eraser className="w-3.5 h-3.5" />
          Limpiar
        </button>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={isEmpty || saving}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: 'linear-gradient(135deg, #00C4CC 0%, #0891b2 100%)' }}
        >
          {saving ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Check className="w-3.5 h-3.5" />
          )}
          {saving ? 'Guardando…' : 'Guardar firma'}
        </button>
      </div>
    </div>
  );
}
