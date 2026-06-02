'use client'

/**
 * UploadDropZone — RONDA 40
 *
 * Componente reusable de subida de archivos con:
 *  - Drag & drop con feedback visual
 *  - Click para abrir selector de archivos
 *  - Preview de imagen antes de subir (PNG/JPG/WEBP/GIF)
 *  - Icono PDF para archivos no-imagen
 *  - Validacion de tipo y tamaño en cliente
 *  - Indicador de progreso (spinner)
 *
 * Uso:
 *   <UploadDropZone
 *     onUpload={async (file) => { ... }}
 *     accept="image/*,application/pdf"
 *     maxSizeMb={20}
 *     label="Adjuntar resultado / documento"
 *   />
 *
 * No hace el upload directamente: llama a la callback `onUpload(file)` que el
 * padre implementa para subir a Storage + insertar en shared_files.
 */

import { useState, useRef, useCallback, DragEvent, ChangeEvent } from 'react'
import { Upload, FileText, ImageIcon, X, Loader2, CheckCircle, AlertCircle } from 'lucide-react'

export type UploadDropZoneProps = {
  onUpload: (file: File) => Promise<void>
  accept?: string                    // ej "image/*,application/pdf"
  maxSizeMb?: number                 // default 20
  label?: string                     // CTA principal
  helperText?: string                // texto secundario
  disabled?: boolean
  className?: string
  variant?: 'default' | 'compact'
}

export default function UploadDropZone({
  onUpload,
  accept = 'image/png,image/jpeg,image/jpg,image/webp,image/gif,application/pdf',
  maxSizeMb = 20,
  label = 'Adjuntar archivo',
  helperText = 'Arrastra aquí o haz clic para seleccionar (PDF, PNG, JPG hasta 20MB)',
  disabled = false,
  className = '',
  variant = 'default',
}: UploadDropZoneProps) {
  const [dragActive, setDragActive] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewFile, setPreviewFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const isImage = (file: File) => file.type.startsWith('image/')

  const validate = useCallback((file: File): string | null => {
    const sizeMb = file.size / (1024 * 1024)
    if (sizeMb > maxSizeMb) {
      return `El archivo pesa ${sizeMb.toFixed(1)}MB. Máximo permitido: ${maxSizeMb}MB.`
    }
    // Validacion de tipo basica desde el accept prop
    const allowed = accept.split(',').map(t => t.trim())
    const matches = allowed.some(pattern => {
      if (pattern.endsWith('/*')) {
        return file.type.startsWith(pattern.replace('/*', '/'))
      }
      return file.type === pattern
    })
    if (!matches) {
      return `Tipo de archivo no permitido: ${file.type || 'desconocido'}.`
    }
    return null
  }, [accept, maxSizeMb])

  const handleFile = useCallback((file: File) => {
    setError(null)
    setSuccess(false)
    const validationErr = validate(file)
    if (validationErr) {
      setError(validationErr)
      return
    }
    setPreviewFile(file)
    if (isImage(file)) {
      const reader = new FileReader()
      reader.onloadend = () => setPreviewUrl(reader.result as string)
      reader.readAsDataURL(file)
    } else {
      setPreviewUrl(null)
    }
  }, [validate])

  const handleDrag = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    if (disabled) return
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    if (disabled) return
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    // Reset para permitir subir el mismo archivo despues
    e.target.value = ''
  }

  const handleUpload = async () => {
    if (!previewFile) return
    setUploading(true)
    setError(null)
    try {
      await onUpload(previewFile)
      setSuccess(true)
      setTimeout(() => {
        setPreviewFile(null)
        setPreviewUrl(null)
        setSuccess(false)
      }, 1500)
    } catch (err: any) {
      setError(err?.message || 'Error al subir el archivo')
    } finally {
      setUploading(false)
    }
  }

  const handleCancel = () => {
    setPreviewFile(null)
    setPreviewUrl(null)
    setError(null)
    setSuccess(false)
  }

  // ── PREVIEW MODE ─────────────────────────────────────────────────────────
  if (previewFile) {
    return (
      <div className={`bg-white border-2 border-teal-300 rounded-xl p-4 ${className}`}>
        <div className="flex items-start gap-4">
          {previewUrl ? (
            <div className="relative shrink-0">
              <img
                src={previewUrl}
                alt="Preview"
                className="w-24 h-24 sm:w-32 sm:h-32 object-cover rounded-lg border border-slate-200"
              />
            </div>
          ) : (
            <div className="w-24 h-24 sm:w-32 sm:h-32 shrink-0 bg-red-50 rounded-lg border border-slate-200 flex flex-col items-center justify-center">
              <FileText className="w-10 h-10 text-red-500 mb-1" />
              <span className="text-[10px] font-bold text-red-600">PDF</span>
            </div>
          )}

          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-900 truncate">{previewFile.name}</p>
            <p className="text-xs text-slate-500 mt-0.5">
              {(previewFile.size / 1024).toFixed(1)} KB · {previewFile.type || 'desconocido'}
            </p>

            {error && (
              <div className="flex items-start gap-1.5 mt-2 text-xs text-red-600">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {success && (
              <div className="flex items-center gap-1.5 mt-2 text-xs text-emerald-600 font-semibold">
                <CheckCircle className="w-3.5 h-3.5" />
                <span>Subido correctamente</span>
              </div>
            )}

            <div className="flex gap-2 mt-3">
              <button
                onClick={handleUpload}
                disabled={uploading || success}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-teal-500 hover:bg-teal-600 text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors"
              >
                {uploading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Subiendo...</>
                ) : success ? (
                  <><CheckCircle className="w-4 h-4" /> Listo</>
                ) : (
                  <><Upload className="w-4 h-4" /> Subir archivo</>
                )}
              </button>
              <button
                onClick={handleCancel}
                disabled={uploading}
                className="px-3 py-2 border border-slate-300 text-slate-600 text-sm font-semibold rounded-lg hover:bg-slate-50 disabled:opacity-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── DROP ZONE MODE ──────────────────────────────────────────────────────
  const sizes = variant === 'compact'
    ? { padding: 'p-4', icon: 'w-6 h-6', title: 'text-sm', helper: 'text-xs' }
    : { padding: 'p-8', icon: 'w-10 h-10', title: 'text-base', helper: 'text-xs' }

  return (
    <div
      onDragEnter={handleDrag}
      onDragOver={handleDrag}
      onDragLeave={handleDrag}
      onDrop={handleDrop}
      onClick={() => !disabled && inputRef.current?.click()}
      className={`relative cursor-pointer rounded-xl border-2 border-dashed transition-all ${
        disabled ? 'opacity-50 cursor-not-allowed border-slate-200' :
        dragActive
          ? 'border-teal-500 bg-teal-50 scale-[1.01]'
          : 'border-slate-300 bg-slate-50 hover:border-teal-400 hover:bg-teal-50/50'
      } ${sizes.padding} ${className}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleChange}
        disabled={disabled}
        className="hidden"
      />

      <div className="flex flex-col items-center justify-center text-center gap-2">
        <div className={`rounded-full bg-white p-3 shadow-sm ${dragActive ? 'bg-teal-100' : ''}`}>
          {dragActive ? (
            <Upload className={`${sizes.icon} text-teal-600`} />
          ) : (
            <ImageIcon className={`${sizes.icon} text-slate-400`} />
          )}
        </div>
        <p className={`${sizes.title} font-semibold text-slate-900`}>
          {dragActive ? 'Suelta aquí el archivo' : label}
        </p>
        <p className={`${sizes.helper} text-slate-500 max-w-xs`}>
          {helperText}
        </p>

        {error && (
          <div className="flex items-start gap-1.5 mt-1 text-xs text-red-600">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
      </div>
    </div>
  )
}
