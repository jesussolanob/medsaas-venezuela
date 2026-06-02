'use client'

import { useState, useRef, useEffect } from 'react'
import { User, Camera, Loader2, Check, X, ZoomIn, ZoomOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type Props = {
  doctorId: string | null
  currentUrl: string | null
  onUploaded: (url: string) => void
}

/**
 * Avatar uploader with built-in crop and zoom.
 * - Square crop (200x200 exported at 400x400).
 * - Drag to pan, slider to zoom.
 * - No external dependencies (uses canvas).
 */
export default function AvatarUploader({ doctorId, currentUrl, onUploaded }: Props) {
  const [sourceImg, setSourceImg] = useState<HTMLImageElement | null>(null)
  const [sourceDataUrl, setSourceDataUrl] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0, ox: 0, oy: 0 })
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  const fileRef = useRef<HTMLInputElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const BOX = 220 // px of the crop preview

  // Load new file
  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    const reader = new FileReader()
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string
      const img = new Image()
      img.onload = () => {
        setSourceImg(img)
        setSourceDataUrl(dataUrl)
        // Initial zoom to cover the box
        const minScale = Math.max(BOX / img.width, BOX / img.height)
        setZoom(minScale * 1.05)
        setOffset({ x: 0, y: 0 })
      }
      img.src = dataUrl
    }
    reader.readAsDataURL(file)
  }

  // Draw to canvas whenever zoom/offset changes
  useEffect(() => {
    if (!sourceImg || !canvasRef.current) return
    const ctx = canvasRef.current.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, BOX, BOX)
    ctx.save()
    // fill background
    ctx.fillStyle = '#f1f5f9'
    ctx.fillRect(0, 0, BOX, BOX)
    // center + offset + zoom
    const w = sourceImg.width * zoom
    const h = sourceImg.height * zoom
    const cx = BOX / 2 - w / 2 + offset.x
    const cy = BOX / 2 - h / 2 + offset.y
    ctx.drawImage(sourceImg, cx, cy, w, h)
    ctx.restore()
  }, [sourceImg, zoom, offset])

  // Dragging
  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!sourceImg) return
    setDragging(true)
    setDragStart({ x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y })
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }
  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!dragging || !sourceImg) return
    const dx = e.clientX - dragStart.x
    const dy = e.clientY - dragStart.y
    setOffset({ x: dragStart.ox + dx, y: dragStart.oy + dy })
  }
  function onPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    setDragging(false)
    try { (e.target as HTMLElement).releasePointerCapture(e.pointerId) } catch {}
  }

  // Export and upload
  async function saveCrop() {
    if (!sourceImg || !doctorId) return
    setUploading(true); setError('')
    try {
      // Render at 2x resolution for quality
      const out = document.createElement('canvas')
      const SIZE = 400
      out.width = SIZE; out.height = SIZE
      const ctx = out.getContext('2d')
      if (!ctx) throw new Error('Canvas no disponible')
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, SIZE, SIZE)
      const scale = SIZE / BOX
      const w = sourceImg.width * zoom * scale
      const h = sourceImg.height * zoom * scale
      const cx = SIZE / 2 - w / 2 + offset.x * scale
      const cy = SIZE / 2 - h / 2 + offset.y * scale
      ctx.drawImage(sourceImg, cx, cy, w, h)

      // to blob
      const blob: Blob = await new Promise((res, rej) => {
        out.toBlob(b => b ? res(b) : rej(new Error('blob failed')), 'image/jpeg', 0.9)
      })

      const supabase = createClient()
      const path = `avatars/${doctorId}.jpg`
      let { error: upErr } = await supabase.storage.from('avatars').upload(path, blob, { upsert: true, contentType: 'image/jpeg' })
      if (upErr && upErr.message?.toLowerCase().includes('bucket')) {
        try {
          await supabase.storage.createBucket('avatars', { public: true })
          const retry = await supabase.storage.from('avatars').upload(path, blob, { upsert: true, contentType: 'image/jpeg' })
          upErr = retry.error
        } catch { upErr = { message: 'No se pudo crear el bucket' } as any }
      }
      if (upErr) throw upErr

      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path)
      const finalUrl = urlData.publicUrl + '?t=' + Date.now()
      await supabase.from('profiles').update({ avatar_url: finalUrl }).eq('id', doctorId)
      onUploaded(finalUrl)
      setSourceImg(null); setSourceDataUrl(null); setZoom(1); setOffset({ x: 0, y: 0 })
    } catch (e: any) {
      setError('No se pudo subir: ' + (e?.message ?? 'error desconocido'))
    } finally {
      setUploading(false)
    }
  }

  function cancelCrop() {
    setSourceImg(null); setSourceDataUrl(null); setZoom(1); setOffset({ x: 0, y: 0 }); setError('')
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="flex flex-col sm:flex-row items-start gap-5">
      {/* Current avatar preview */}
      <div className="relative shrink-0">
        <div className="w-24 h-24 rounded-2xl overflow-hidden bg-slate-100 border border-slate-200 flex items-center justify-center">
          {currentUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={currentUrl} alt="Avatar" className="w-full h-full object-cover" />
          ) : (
            <User className="w-10 h-10 text-slate-300" />
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="flex-1 w-full space-y-3">
        {!sourceDataUrl ? (
          <>
            <input ref={fileRef} type="file" accept="image/*" onChange={onFileChange} className="hidden" />
            <button
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <Camera className="w-3.5 h-3.5" />
              {currentUrl ? 'Cambiar foto' : 'Subir foto'}
            </button>
            <p className="text-[10px] text-slate-400">JPG, PNG o WEBP · Se recorta a 1:1 y se optimiza automáticamente</p>
          </>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-4 items-start">
              <div
                className="relative rounded-2xl overflow-hidden border border-slate-200 bg-slate-100 shrink-0"
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
                {/* Circular overlay mask */}
                <div
                  className="pointer-events-none absolute inset-0"
                  style={{
                    boxShadow: '0 0 0 9999px rgba(255,255,255,0.6)',
                    borderRadius: '50%',
                    clipPath: 'circle(50% at 50% 50%)',
                  }}
                />
              </div>
              <div className="flex-1 w-full space-y-3">
                <div>
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 mb-1">
                    <ZoomOut className="w-3 h-3" /> Zoom <ZoomIn className="w-3 h-3" />
                  </label>
                  <input
                    type="range"
                    min="0.3"
                    max="4"
                    step="0.01"
                    value={zoom}
                    onChange={e => setZoom(parseFloat(e.target.value))}
                    className="w-full accent-teal-500"
                  />
                </div>
                <p className="text-[11px] text-slate-400">Arrastra para mover la imagen. Usa el zoom para ajustar.</p>
                <div className="flex gap-2">
                  <button
                    onClick={cancelCrop}
                    disabled={uploading}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                  >
                    <X className="w-3.5 h-3.5" /> Cancelar
                  </button>
                  <button
                    onClick={saveCrop}
                    disabled={uploading}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-white disabled:opacity-60"
                    style={{ background: 'linear-gradient(135deg,#00C4CC 0%,#0891b2 100%)' }}
                  >
                    {uploading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Subiendo…</> : <><Check className="w-3.5 h-3.5" /> Guardar foto</>}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
      </div>
    </div>
  )
}
