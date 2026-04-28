'use client'

/**
 * /patient/seguimiento — RONDA 40
 *
 * Vista del paciente del modulo "Seguimiento del Paciente" (Shared Health Space).
 * Reemplaza la vieja /patient/prescriptions y consolida en una sola pestaña:
 *   - Tareas pendientes (instrucciones del doctor sin archivo aun)
 *   - Archivos compartidos (subidos por el doctor o el paciente)
 *   - Recetas (legacy, mostradas como un tipo de archivo)
 *   - Boton grande para "Adjuntar resultado/documento"
 */

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  FolderHeart, FileText, Image as ImageIcon, Pill, Clock, CheckCircle,
  Upload, ExternalLink, Loader2, Download, AlertCircle
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import UploadDropZone from '@/components/shared/UploadDropZone'
import {
  uploadSharedFile,
  markAllReadByPatient,
  type SharedFile,
} from '@/lib/shared-files'

type LegacyPrescription = {
  id: string
  doctor_id: string
  doctor_name?: string
  medications: Array<{ name?: string; dose?: string; frequency?: string; duration?: string; indications?: string }>
  notes: string | null
  created_at: string
}

export default function PatientSeguimientoPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [patientId, setPatientId] = useState<string | null>(null)
  const [doctorId, setDoctorId] = useState<string | null>(null)
  const [doctorName, setDoctorName] = useState<string>('')
  const [files, setFiles] = useState<SharedFile[]>([])
  const [legacyPrescriptions, setLegacyPrescriptions] = useState<LegacyPrescription[]>([])
  const [uploadModal, setUploadModal] = useState<{ open: boolean; replyTo?: SharedFile | null }>({ open: false })
  const [uploadTitle, setUploadTitle] = useState('')
  const [uploadDescription, setUploadDescription] = useState('')

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/patient/login')
        return
      }

      // Trae el paciente (puede haber 1+ filas si el paciente esta con varios doctores;
      // en MVP tomamos el primero)
      const { data: patientRows } = await supabase
        .from('patients')
        .select('id, doctor_id')
        .eq('auth_user_id', user.id)
      if (!patientRows || patientRows.length === 0) {
        setLoading(false)
        return
      }
      const p = patientRows[0]
      setPatientId(p.id)
      setDoctorId(p.doctor_id)

      // Nombre del doctor
      const { data: doc } = await supabase
        .from('profiles').select('full_name, professional_title').eq('id', p.doctor_id).single()
      if (doc) setDoctorName(`${(doc as any).professional_title || ''} ${doc.full_name}`.trim())

      // Trae shared_files de TODOS los patient ids del usuario (multi-doctor support)
      const patientIds = patientRows.map(pr => pr.id)
      const { data: sharedRows } = await supabase
        .from('shared_files')
        .select('*')
        .in('patient_id', patientIds)
        .order('created_at', { ascending: false })
      setFiles((sharedRows || []) as SharedFile[])

      // Trae prescriptions legacy (recetas viejas que aun no estan migradas)
      const { data: rxRows } = await supabase
        .from('prescriptions')
        .select('id, doctor_id, medications, notes, created_at')
        .in('patient_id', patientIds)
        .order('created_at', { ascending: false })
      setLegacyPrescriptions((rxRows || []) as LegacyPrescription[])

      // Marcar como leido todo lo que el paciente abrio en esta vista
      await markAllReadByPatient(supabase, { patientId: p.id })
    } catch (err) {
      console.error('[seguimiento] error:', err)
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => { loadData() }, [loadData])

  // Realtime: si el doctor sube algo o crea instruccion, refrescar
  useEffect(() => {
    if (!patientId) return
    const supabase = createClient()
    const channel = supabase
      .channel(`patient-seguimiento-${patientId}-${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'shared_files', filter: `patient_id=eq.${patientId}` },
        () => loadData()
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [patientId, loadData])

  async function handleUpload(file: File) {
    if (!patientId || !doctorId) throw new Error('Sin paciente cargado')
    const supabase = createClient()
    const { error } = await uploadSharedFile(supabase, {
      file,
      doctorId,
      patientId,
      title: uploadTitle.trim() || file.name,
      description: uploadDescription.trim() || null,
      createdBy: 'patient',
      parentTaskId: uploadModal.replyTo?.id || null,
    })
    if (error) throw new Error(error)
    setUploadTitle('')
    setUploadDescription('')
    setUploadModal({ open: false })
    await loadData()
  }

  // ── DERIVADOS ────────────────────────────────────────────────────────────
  const pendingTasks = files.filter(f => f.category === 'instruction' && f.status === 'pending')
  const completedFiles = files.filter(f => f.file_url)

  // ── RENDER ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-teal-500" />
      </div>
    )
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <FolderHeart className="w-6 h-6 text-teal-600" /> Mi Seguimiento
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Tareas y archivos compartidos con {doctorName || 'tu médico'}.
          </p>
        </div>
        <button
          onClick={() => setUploadModal({ open: true })}
          className="hidden sm:flex items-center gap-2 px-4 py-2.5 bg-teal-500 hover:bg-teal-600 text-white text-sm font-bold rounded-xl shadow-sm transition-colors"
        >
          <Upload className="w-4 h-4" /> Adjuntar archivo
        </button>
      </div>

      {/* CTA grande: subir archivo (mobile) */}
      <button
        onClick={() => setUploadModal({ open: true })}
        className="sm:hidden w-full flex items-center justify-center gap-2 px-4 py-3.5 bg-teal-500 hover:bg-teal-600 text-white text-base font-bold rounded-xl shadow-sm transition-colors"
      >
        <Upload className="w-5 h-5" /> Adjuntar resultado / documento
      </button>

      {/* Tareas pendientes del doctor */}
      {pendingTasks.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 sm:p-5">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-5 h-5 text-amber-600" />
            <h2 className="text-sm font-bold text-amber-900">
              Tareas solicitadas por tu médico ({pendingTasks.length})
            </h2>
          </div>
          <div className="space-y-2">
            {pendingTasks.map(task => (
              <div key={task.id} className="bg-white border border-amber-200 rounded-lg p-3 sm:p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-900">{task.title}</p>
                    {task.description && (
                      <p className="text-xs text-slate-600 mt-1 whitespace-pre-wrap">{task.description}</p>
                    )}
                    <p className="text-[10px] text-slate-400 mt-2">
                      Solicitado el {new Date(task.created_at).toLocaleDateString('es-VE')}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setUploadModal({ open: true, replyTo: task })
                      setUploadTitle(task.title)
                    }}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-lg transition-colors"
                  >
                    <Upload className="w-3.5 h-3.5" /> Subir
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Archivos compartidos */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 sm:px-5 py-3 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900">
            Archivos compartidos ({completedFiles.length})
          </h2>
        </div>

        {completedFiles.length === 0 ? (
          <div className="text-center py-12 px-4">
            <FolderHeart className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-500 font-medium">No hay archivos aún</p>
            <p className="text-xs text-slate-400 mt-1">
              Tus exámenes, fotos y documentos compartidos aparecerán aquí.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {completedFiles.map(f => (
              <FileRow key={f.id} file={f} doctorName={doctorName} />
            ))}
          </div>
        )}
      </div>

      {/* Recetas legacy (compatibilidad con datos antes del seguimiento) */}
      {legacyPrescriptions.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 sm:px-5 py-3 border-b border-slate-100 flex items-center gap-2">
            <Pill className="w-4 h-4 text-teal-500" />
            <h2 className="text-sm font-bold text-slate-900">
              Recetas previas ({legacyPrescriptions.length})
            </h2>
          </div>
          <div className="divide-y divide-slate-100">
            {legacyPrescriptions.map(rx => {
              const meds = (Array.isArray(rx.medications) ? rx.medications : []).filter(m => m.name)
              if (meds.length === 0) return null
              return (
                <div key={rx.id} className="p-4 sm:p-5">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs text-slate-500">
                      {new Date(rx.created_at).toLocaleDateString('es-VE')}
                    </p>
                  </div>
                  <div className="space-y-2">
                    {meds.map((m, i) => (
                      <div key={i} className="bg-teal-50 border border-teal-200 rounded-lg p-3">
                        <p className="text-sm font-bold text-teal-900">{m.name}</p>
                        <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-xs text-teal-800">
                          {m.dose && <span><strong>Dosis:</strong> {m.dose}</span>}
                          {m.frequency && <span><strong>Frecuencia:</strong> {m.frequency}</span>}
                          {m.duration && <span><strong>Duración:</strong> {m.duration}</span>}
                        </div>
                        {m.indications && (
                          <p className="text-xs text-teal-700 italic mt-1">{m.indications}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Modal de subida */}
      {uploadModal.open && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-3"
          onClick={() => setUploadModal({ open: false })}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-3.5 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">
                {uploadModal.replyTo ? `Responder: ${uploadModal.replyTo.title}` : 'Adjuntar archivo'}
              </h3>
              <button
                onClick={() => setUploadModal({ open: false })}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                ✕
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Título
                </label>
                <input
                  type="text"
                  value={uploadTitle}
                  onChange={e => setUploadTitle(e.target.value)}
                  placeholder="Ej: Hematología completa, Foto del ejercicio..."
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:border-teal-400 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Comentario (opcional)
                </label>
                <textarea
                  value={uploadDescription}
                  onChange={e => setUploadDescription(e.target.value)}
                  placeholder="Notas para tu médico..."
                  rows={3}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm resize-none focus:border-teal-400 outline-none"
                />
              </div>
              <UploadDropZone
                onUpload={handleUpload}
                label="Suelta o selecciona el archivo"
                helperText="PDF, JPG o PNG. Máximo 20MB."
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function FileRow({ file, doctorName }: { file: SharedFile; doctorName: string }) {
  const isImage = file.file_type && ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(file.file_type)
  const Icon = isImage ? ImageIcon : FileText

  return (
    <div className="p-4 sm:p-5 flex items-start gap-3">
      <div className={`shrink-0 p-2.5 rounded-lg ${isImage ? 'bg-teal-50 text-teal-600' : 'bg-red-50 text-red-600'}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-bold text-slate-900 truncate">{file.title}</p>
          <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
            file.created_by === 'doctor' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'
          }`}>
            {file.created_by === 'doctor' ? `De ${doctorName || 'doctor'}` : 'Tú lo subiste'}
          </span>
        </div>
        {file.description && (
          <p className="text-xs text-slate-600 mt-1 line-clamp-2">{file.description}</p>
        )}
        <p className="text-[10px] text-slate-400 mt-1">
          {new Date(file.created_at).toLocaleDateString('es-VE', { day: 'numeric', month: 'short', year: 'numeric' })}
          {file.file_size_bytes && <> · {(file.file_size_bytes / 1024).toFixed(0)} KB</>}
        </p>
      </div>
      {file.file_url && (
        <a
          href={file.file_url}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 p-2 text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
          title="Abrir archivo"
        >
          <ExternalLink className="w-4 h-4" />
        </a>
      )}
    </div>
  )
}
