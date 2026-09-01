'use client';

/**
 * ProductPhotoUploader
 *
 * Canvas-based photo uploader for inventory products.
 * Pattern: canvas → blob → POST /api/storage/upload (kind: 'product')
 *
 * CRITICAL: we persist photo_path (the GCS path), NOT the signed URL.
 *   - The backend validates the path starts with product/<userId>/.
 *   - Signed URLs expire; paths are permanent.
 *   - Do NOT append ?t= cache-busters — a second ? invalidates GCS signatures.
 */

import { useState, useRef, useEffect } from 'react';
import { ImageIcon, Camera, Loader2, Check, X, ZoomIn, ZoomOut } from 'lucide-react';
import { showToast } from '@/components/ui/Toaster';

type Props = {
  /** Current photo URL for preview (signed URL from backend). */
  currentUrl: string | null;
  /** Called with the GCS path (not the signed URL) after a successful upload. */
  onUploaded: (path: string) => void;
};

const BOX = 200; // px — crop preview canvas size
const OUTPUT_SIZE = 400; // px — exported JPEG resolution
const MAX_SOURCE_BYTES = 15 * 1024 * 1024; // 15 MB — guard before base64 decoding

export default function ProductPhotoUploader({ currentUrl, onUploaded }: Props) {
  const [sourceImg, setSourceImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [minZoom, setMinZoom] = useState(0.1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0, ox: 0, oy: 0 });
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const fileRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // readAsDataURL base64-encodes the whole file in memory: a very large image
    // freezes the tab before the canvas ever downsizes it. Reject it up front.
    if (file.size > MAX_SOURCE_BYTES) {
      setError('La imagen es muy pesada. Elegí una de menos de 15 MB.');
      return;
    }
    setError('');
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      const img = new Image();
      img.onload = () => {
        setSourceImg(img);
        const fitScale = Math.min(BOX / img.width, BOX / img.height);
        setMinZoom(fitScale);
        setZoom(fitScale);
        setOffset({ x: 0, y: 0 });
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }

  useEffect(() => {
    if (!sourceImg || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, BOX, BOX);
    ctx.fillStyle = '#f1f5f9';
    ctx.fillRect(0, 0, BOX, BOX);
    const w = sourceImg.width * zoom;
    const h = sourceImg.height * zoom;
    const cx = BOX / 2 - w / 2 + offset.x;
    const cy = BOX / 2 - h / 2 + offset.y;
    ctx.drawImage(sourceImg, cx, cy, w, h);
  }, [sourceImg, zoom, offset]);

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!sourceImg) return;
    setDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y });
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!dragging || !sourceImg) return;
    setOffset({
      x: dragStart.ox + (e.clientX - dragStart.x),
      y: dragStart.oy + (e.clientY - dragStart.y),
    });
  }

  function onPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    setDragging(false);
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
  }

  async function saveCrop() {
    if (!sourceImg) return;
    setUploading(true);
    setError('');
    try {
      const out = document.createElement('canvas');
      out.width = OUTPUT_SIZE;
      out.height = OUTPUT_SIZE;
      const ctx = out.getContext('2d');
      if (!ctx) throw new Error('Canvas no disponible');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
      const scale = OUTPUT_SIZE / BOX;
      ctx.drawImage(
        sourceImg,
        OUTPUT_SIZE / 2 - (sourceImg.width * zoom * scale) / 2 + offset.x * scale,
        OUTPUT_SIZE / 2 - (sourceImg.height * zoom * scale) / 2 + offset.y * scale,
        sourceImg.width * zoom * scale,
        sourceImg.height * zoom * scale,
      );

      const blob: Blob = await new Promise((res, rej) => {
        out.toBlob((b) => (b ? res(b) : rej(new Error('blob failed'))), 'image/jpeg', 0.9);
      });

      const fd = new FormData();
      fd.append('file', new File([blob], 'product.jpg', { type: 'image/jpeg' }));
      fd.append('kind', 'product');

      const uploadRes = await fetch('/api/storage/upload', { method: 'POST', body: fd });
      const uploadJson = (await uploadRes.json()) as {
        success?: boolean;
        data?: { url?: string; path?: string };
        error?: { message?: string };
      };

      if (!uploadRes.ok || !uploadJson?.data?.path) {
        throw new Error(uploadJson?.error?.message ?? 'Error al subir la foto');
      }

      // Persist the GCS path — NOT the signed URL.
      // Do NOT append ?t= — it breaks signed URLs (second ? invalidates the signature).
      showToast({ type: 'success', message: 'Foto actualizada' });
      onUploaded(uploadJson.data.path);
      cancelCrop();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'error desconocido';
      setError('No se pudo subir: ' + msg);
    } finally {
      setUploading(false);
    }
  }

  function cancelCrop() {
    setSourceImg(null);
    setZoom(1);
    setMinZoom(0.1);
    setOffset({ x: 0, y: 0 });
    setError('');
    if (fileRef.current) fileRef.current.value = '';
  }

  return (
    <div className="space-y-3">
      {/* Current photo preview */}
      <div className="flex items-start gap-4">
        <div className="w-20 h-20 rounded-xl overflow-hidden bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
          {currentUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={currentUrl} alt="Foto del producto" className="w-full h-full object-cover" />
          ) : (
            <ImageIcon className="w-8 h-8 text-slate-300" />
          )}
        </div>

        {!sourceImg && (
          <div className="space-y-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={onFileChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <Camera className="w-3.5 h-3.5" />
              {currentUrl ? 'Cambiar foto' : 'Subir foto'}
            </button>
            <p className="text-[10px] text-slate-400">JPG, PNG o WEBP · Máx 10 MB</p>
          </div>
        )}
      </div>

      {/* Crop editor */}
      {sourceImg && (
        <div className="flex flex-col sm:flex-row gap-4 items-start">
          <div
            className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-100 shrink-0"
            style={{ width: BOX, height: BOX }}
          >
            <canvas
              ref={canvasRef}
              width={BOX}
              height={BOX}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              className={`block ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
            />
          </div>

          <div className="flex-1 space-y-3">
            <div>
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 mb-1">
                <ZoomOut className="w-3 h-3" /> Zoom <ZoomIn className="w-3 h-3" />
              </label>
              <input
                type="range"
                min={minZoom}
                max="4"
                step="0.01"
                value={zoom}
                onChange={(e) => setZoom(parseFloat(e.target.value))}
                className="w-full accent-teal-500"
              />
            </div>
            <p className="text-[11px] text-slate-400">
              Arrastra para encuadrar. Zoom para ajustar.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={cancelCrop}
                disabled={uploading}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                <X className="w-3.5 h-3.5" /> Cancelar
              </button>
              <button
                type="button"
                onClick={saveCrop}
                disabled={uploading}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-white disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg,#00C4CC 0%,#0891b2 100%)' }}
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Subiendo…
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" /> Guardar foto
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}
    </div>
  );
}
