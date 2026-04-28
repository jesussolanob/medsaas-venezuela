'use client'

/**
 * /patient/seguimiento — RONDA 40 + RONDA 41
 *
 * Vista del paciente del modulo "Seguimiento del Paciente" (Shared Health Space).
 * Reemplaza la vieja /patient/prescriptions y consolida en una sola pestaña:
 *   - Tareas pendientes (instrucciones del doctor sin archivo aun)
 *   - Archivos compartidos (subidos por el doctor o el paciente)
 *   - Recetas (legacy, mostradas como un tipo de archivo)
 *   - Boton grande para "Adjuntar resultado/documento"
 *
 * RONDA 41:
 *   - Soporte multi-doctor: si el paciente esta con varios doctores, selector
 *     "Todos / Dr. X / Dr. Y" para filtrar el feed
 *   - Permitir respuesta SOLO con comentario (sin archivo obligatorio)
 *   - Header dinamico segun el doctor seleccionado
 */

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  FolderHeart, FileText, Image as ImageIcon, Pill, Clock,
  Upload, ExternalLink, Loader2, MessageSquare, Send, Check, Stethoscope,
  Pencil, Trash2, Save
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import UploadDropZone from '@/components/shared/UploadDropZone'
import {
  uploadSharedFile,
  replyWithComment,
  markAllReadByPatient,
  updateSharedFile,
  deleteSharedFile,
  attachFileToExisting,
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

type DoctorOption = {
  id: string
  patient_id: string  // el patient_id del paciente con ESE doctor
  full_name: string
  professional_title: string | null
  specialty: string | null
}

export default function PatientSeguimientoPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  // RONDA 41: ahora trabajamos con N doctores
  const [doctors, setDoctors] = useState<DoctorOption[]>([])
  const [selectedDoctorId, setSelectedDoctorId] = useState<string | 'all'>('all')
  const [files, setFiles] = useState<SharedFile[]>([])
  const [legacyPrescriptions, setLegacyPrescriptions] = useState<LegacyPrescription[]>([])
  const [uploadModal, setUploadModal] = useState<{ open: boolean; replyTo?: SharedFile | null }>({ open: false })
  const [uploadTitle, setUploadTitle] = useState('')
  const [uploadDescription, setUploadDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  // RONDA 44: estado de edicion de items propios del paciente
  const [editingFile, setEditingFile] = useState<SharedFile | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/patient/login')
        return
      }

      // RONDA 41: traer TODOS los patient rows del paciente (uno por doctor)
      const { data: patientRows } = await supabase
        .from('patients')
        .select('id, doctor_id')
        .eq('auth_user_id', user.id)
      if (!patientRows || patientRows.length === 0) {
        setLoading(false)
        return
      }

      // Enriquecer con info de cada doctor
      const doctorIds = [...new Set(patientRows.map(p => p.doctor_id))]
      const { data: docsData } = await supabase
        .from('profiles')
        .select('id, full_name, professional_title, specialty')
        .in('id', doctorIds)
      const docsMap = new Map((docsData || []).map(d => [d.id, d]))

      const docOptions: DoctorOption[] = patientRows.map(pr => {
        const d = docsMap.get(pr.doctor_id)
        return {
          id: pr.doctor_id,
          patient_id: pr.id,
          full_name: d?.full_name || 'Doctor',
          professional_title: (d as any)?.professional_title || null,
          specialty: (d as any)?.specialty || null,
        }
      })
      setDoctors(docOptions)

      // Trae shared_files de TODOS los patient_ids del usuario (multi-doctor)
      const patientIds = patientRows.map(pr => pr.id)
      const { data: sharedRows } = await supabase
        .from('shared_files')
        .select('*')
        .in('patient_id', patientIds)
        .order('created_at', { ascending: false })
      setFiles((sharedRows || []) as SharedFile[])

      // Trae prescriptions legacy (recetas viejas)
      const { data: rxRows } = await supabase
        .from('prescriptions')
        .select('id, doctor_id, medications, notes, created_at')
        .in('patient_id', patientIds)
        .order('created_at', { ascending: false })
      setLegacyPrescriptions((rxRows || []) as LegacyPrescription[])

      // Marcar como leidos TODOS los patient_ids del paciente
      for (const pid of patientIds) {
        await markAllReadByPatient(supabase, { patientId: pid })
      }
    } catch (err) {
      console.error('[seguimiento] error:', err)
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => { loadData() }, [loadData])

  // Realtime: si CUALQUIERA de los doctores sube algo, refrescar
  useEffect(() => {
    if (doctors.length === 0) return
    const supabase = createClient()
    const patientIds = doctors.map(d => d.patient_id)
    const channel = supabase
      .channel(`patient-seguimiento-multi-${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'shared_files' },
        (payload: any) => {
          const pid = payload.new?.patient_id || payload.old?.patient_id
          if (pid && patientIds.includes(pid)) loadData()
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [doctors, loadData])

  // ── DERIVADOS ────────────────────────────────────────────────────────────

  // Filtrar por doctor seleccionado (o "Todos")
  const visibleFiles = useMemo(() => {
    if (selectedDoctorId === 'all') return files
    return files.filter(f => f.doctor_id === selectedDoctorId)
  }, [files, selectedDoctorId])

  const visibleLegacyRx = useMemo(() => {
    if (selectedDoctorId === 'all') return legacyPrescriptions
    return legacyPrescriptions.filter(rx => rx.doctor_id === selectedDoctorId)
  }, [legacyPrescriptions, selectedDoctorId])

  // RONDA 42: filtros corregidos.
  // Pendientes = solo tareas del doctor en estado 'pending' (NO completadas)
  const pendingTasks = visibleFiles.filter(f =>
    f.category === 'instruction' && f.status === 'pending' && f.created_by === 'doctor'
  )
  // Historial = TODO lo que no sea una tarea pendiente. Incluye:
  // - archivos (con file_url)
  // - comentarios sueltos (category='comment')
  // - tareas YA completadas (category='instruction' && status='completed')
  const completedFiles = visibleFiles.filter(f =>
    f.file_url || f.category === 'comment' ||
    (f.category === 'instruction' && f.status === 'completed')
  )

  // Mapa rápido para mostrar a qué doctor pertenece cada archivo
  const doctorById = useMemo(() => {
    const m = new Map<string, DoctorOption>()
    for (const d of doctors) m.set(d.id, d)
    return m
  }, [doctors])

  function getDoctorName(doctorId: string): string {
    const d = doctorById.get(doctorId)
    if (!d) return 'doctor'
    return `${d.professional_title || ''} ${d.full_name}`.trim()
  }

  // ── HANDLERS ─────────────────────────────────────────────────────────────

  // Determina a QUÉ doctor va dirigida la respuesta del paciente
  function resolveTargetDoctor(replyTo: SharedFile | null | undefined): { doctorId: string; patientId: string } | null {
    if (replyTo) {
      // Si es respuesta a una tarea, ir al doctor de la tarea
      const d = doctors.find(d => d.id === replyTo.doctor_id)
      if (d) return { doctorId: d.id, patientId: d.patient_id }
    }
    // Si NO es respuesta y solo hay 1 doctor, usarlo
    if (doctors.length === 1) return { doctorId: doctors[0].id, patientId: doctors[0].patient_id }
    // Si hay filtro por doctor, usar ese
    if (selectedDoctorId !== 'all') {
      const d = doctors.find(d => d.id === selectedDoctorId)
      if (d) return { doctorId: d.id, patientId: d.patient_id }
    }
    return null  // ambiguo: el usuario debe elegir
  }

  async function handleSubmit(file: File | null) {
    const target = resolveTargetDoctor(uploadModal.replyTo)
    if (!target) {
      alert('Selecciona un doctor primero (filtro arriba) o responde directamente a una tarea.')
      return
    }
    setSubmitting(true)
    try {
      const supabase = createClient()
      if (file) {
        // Upload con archivo
        const { error } = await uploadSharedFile(supabase, {
          file,
          doctorId: target.doctorId,
          patientId: target.patientId,
          title: uploadTitle.trim() || file.name,
          description: uploadDescription.trim() || null,
          createdBy: 'patient',
          parentTaskId: uploadModal.replyTo?.id || null,
        })
        if (error) throw new Error(error)
      } else {
        // Solo comentario
        const { error } = await replyWithComment(supabase, {
          doctorId: target.doctorId,
          patientId: target.patientId,
          title: uploadTitle.trim() || (uploadModal.replyTo ? `Re: ${uploadModal.replyTo.title}` : 'Comentario'),
          description: uploadDescription.trim(),
          createdBy: 'patient',
          parentTaskId: uploadModal.replyTo?.id || null,
        })
        if (error) throw new Error(error)
      }
      setUploadTitle('')
      setUploadDescription('')
      setUploadModal({ open: false })
      await loadData()
    } catch (err: any) {
      alert(`Error: ${err?.message || 'no se pudo enviar'}`)
    } finally {
      setSubmitting(false)
    }
  }

  // RONDA 44: handlers para editar/eliminar items propios del paciente
  async function handleDeleteFile(file: SharedFile) {
    if (!confirm(`¿Eliminar "${file.title}"?`)) return
    const supabase = createClient()
    const { error } = await deleteSharedFile(supabase, { id: file.id, fileUrl: file.file_url })
    if (error) alert(`Error: ${error}`)
    else await loadData()
  }

  async function handleSaveEdit() {
    if (!editingFile) return
    setSavingEdit(true)
    try {
      const supabase = createClient()
      const { error } = await updateSharedFile(supabase, {
        id: editingFile.id,
        title: editTitle.trim() || editingFile.title,
        description: editDesc.trim() || null,
      })
      if (error) alert(`Error: ${error}`)
      else {
        setEditingFile(null)
        await loadData()
      }
    } finally {
      setSavingEdit(false)
    }
  }

  async function handleAttachToExisting(file: File) {
    if (!editingFile) throw new Error('No hay item seleccionado')
    const target = doctors.find(d => d.id === editingFile.doctor_id)
    if (!target) throw new Error('No se encontró el paciente vinculado al doctor')
    const supabase = createClient()
    const { error } = await attachFileToExisting(supabase, {
      id: editingFile.id,
      file,
      patientId: target.patient_id,
    })
    if (error) throw new Error(error)
    setEditingFile(null)
    await loadData()
  }

  // ── RENDER ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-teal-500" />
      </div>
    )
  }

  if (doctors.length === 0) {
    return (
      <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
        <FolderHeart className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <p className="text-slate-500 font-medium">Aún no tienes consultas con ningún médico</p>
        <p className="text-sm text-slate-400 mt-1">Tu seguimiento aparecerá aquí cuando agendes con un doctor.</p>
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
            {doctors.length === 1
              ? `Tareas y archivos compartidos con ${getDoctorName(doctors[0].id)}.`
              : `Tareas y archivos con tus ${doctors.length} médicos.`}
          </p>
        </div>
        <button
          onClick={() => setUploadModal({ open: true })}
          className="hidden sm:flex items-center gap-2 px-4 py-2.5 bg-teal-500 hover:bg-teal-600 text-white text-sm font-bold rounded-xl shadow-sm transition-colors"
        >
          <Upload className="w-4 h-4" /> Adjuntar archivo
        </button>
      </div>

      {/* RONDA 41: Selector de doctor (solo si hay >1) */}
      {doctors.length > 1 && (
        <div className="bg-white border border-slate-200 rounded-xl p-2 flex items-center gap-1 overflow-x-auto">
          <button
            onClick={() => setSelectedDoctorId('all')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors ${
              selectedDoctorId === 'all'
                ? 'bg-teal-500 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Stethoscope className="w-3.5 h-3.5" /> Todos
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
              selectedDoctorId === 'all' ? 'bg-white/20' : 'bg-slate-100'
            }`}>{files.length}</span>
          </button>
          {doctors.map(d => {
            const count = files.filter(f => f.doctor_id === d.id).length
            const isActive = selectedDoctorId === d.id
            return (
              <button
                key={d.id}
                onClick={() => setSelectedDoctorId(d.id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors ${
                  isActive
                    ? 'bg-teal-500 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {getDoctorName(d.id)}
                {count > 0 && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                    isActive ? 'bg-white/20' : 'bg-slate-100'
                  }`}>{count}</span>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* CTA grande mobile */}
      <button
        onClick={() => setUploadModal({ open: true })}
        className="sm:hidden w-full flex items-center justify-center gap-2 px-4 py-3.5 bg-teal-500 hover:bg-teal-600 text-white text-base font-bold rounded-xl shadow-sm transition-colors"
      >
        <Upload className="w-5 h-5" /> Adjuntar / Comentar
      </button>

      {/* Tareas pendientes */}
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
                      {doctors.length > 1 && <span className="font-semibold">{getDoctorName(task.doctor_id)} · </span>}
                      Solicitado el {new Date(task.created_at).toLocaleDateString('es-VE')}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setUploadModal({ open: true, replyTo: task })
                      setUploadTitle(`Re: ${task.title}`)
                    }}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-lg transition-colors"
                  >
                    <Send className="w-3.5 h-3.5" /> Responder
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Archivos / comentarios compartidos */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 sm:px-5 py-3 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900">
            Historial compartido ({completedFiles.length})
          </h2>
        </div>

        {completedFiles.length === 0 ? (
          <div className="text-center py-12 px-4">
            <FolderHeart className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-500 font-medium">Sin actividad aún</p>
            <p className="text-xs text-slate-400 mt-1">
              Tus archivos y mensajes con el médico aparecerán aquí.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {completedFiles.map(f => (
              <FileRow
                key={f.id}
                file={f}
                doctorName={getDoctorName(f.doctor_id)}
                showDoctor={doctors.length > 1}
                onEdit={(file) => {
                  setEditingFile(file)
                  setEditTitle(file.title)
                  setEditDesc(file.description || '')
                }}
                onDelete={handleDeleteFile}
              />
            ))}
          </div>
        )}
      </div>

      {/* Recetas legacy */}
      {visibleLegacyRx.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 sm:px-5 py-3 border-b border-slate-100 flex items-center gap-2">
            <Pill className="w-4 h-4 text-teal-500" />
            <h2 className="text-sm font-bold text-slate-900">
              Recetas previas ({visibleLegacyRx.length})
            </h2>
          </div>
          <div className="divide-y divide-slate-100">
            {visibleLegacyRx.map(rx => {
              const meds = (Array.isArray(rx.medications) ? rx.medications : []).filter(m => m.name)
              if (meds.length === 0) return null
              return (
                <div key={rx.id} className="p-4 sm:p-5">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs text-slate-500">
                      {doctors.length > 1 && <span className="font-semibold">{getDoctorName(rx.doctor_id)} · </span>}
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

      {/* RONDA 44: Modal de edicion de items propios */}
      {editingFile && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-3" onClick={() => !savingEdit && setEditingFile(null)}>
          <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-3.5 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Pencil className="w-4 h-4" /> Editar
              </h3>
              <button onClick={() => !savingEdit && setEditingFile(null)} className="text-slate-400 hover:text-slate-600 p-1">✕</button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Título</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:border-teal-400 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Descripción</label>
                <textarea
                  value={editDesc}
                  onChange={e => setEditDesc(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm resize-none focus:border-teal-400 outline-none"
                />
              </div>
              <button
                onClick={handleSaveEdit}
                disabled={savingEdit || !editTitle.trim()}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-teal-500 hover:bg-teal-600 text-white text-sm font-bold rounded-xl disabled:opacity-50 transition-colors"
              >
                {savingEdit ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Guardar cambios
              </button>

              {!editingFile.file_url && (
                <>
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <div className="flex-1 border-t border-slate-200"></div>
                    <span>o adjuntar un archivo</span>
                    <div className="flex-1 border-t border-slate-200"></div>
                  </div>
                  <UploadDropZone
                    onUpload={handleAttachToExisting}
                    label="Adjuntar archivo a este item"
                  />
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal de subida / comentario */}
      {uploadModal.open && (
        <UploadOrCommentModal
          replyTo={uploadModal.replyTo || null}
          doctors={doctors}
          selectedDoctorId={selectedDoctorId !== 'all' ? selectedDoctorId : null}
          uploadTitle={uploadTitle}
          uploadDescription={uploadDescription}
          submitting={submitting}
          onTitleChange={setUploadTitle}
          onDescriptionChange={setUploadDescription}
          onClose={() => setUploadModal({ open: false })}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  )
}

// ─── COMPONENTES ──────────────────────────────────────────────────────────

function FileRow({
  file, doctorName, showDoctor, onEdit, onDelete,
}: {
  file: SharedFile; doctorName: string; showDoctor: boolean
  onEdit?: (f: SharedFile) => void
  onDelete?: (f: SharedFile) => void
}) {
  const isImage = file.file_type && ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(file.file_type)
  const hasFile = !!file.file_url
  // RONDA 42: distinguir tipos correctamente
  const isComment = file.category === 'comment'
  const isCompletedTask = file.category === 'instruction' && file.status === 'completed'
  // RONDA 44: solo el paciente puede editar/eliminar SUS propios items (created_by='patient')
  const isOwnItem = file.created_by === 'patient'
  const Icon = !hasFile ? MessageSquare : (isImage ? ImageIcon : FileText)

  return (
    <div className="p-4 sm:p-5 flex items-start gap-3">
      <div className={`shrink-0 p-2.5 rounded-lg ${
        isCompletedTask ? 'bg-emerald-50 text-emerald-600' :
        !hasFile ? 'bg-slate-100 text-slate-600' :
        isImage ? 'bg-teal-50 text-teal-600' : 'bg-red-50 text-red-600'
      }`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-bold text-slate-900 truncate">{file.title}</p>
          <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
            file.created_by === 'doctor' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'
          }`}>
            {file.created_by === 'doctor' ? `De ${doctorName || 'doctor'}` : 'Tú'}
          </span>
          {/* RONDA 42: chips correctos por tipo */}
          {isCompletedTask && (
            <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">
              Respondida
            </span>
          )}
          {isComment && (
            <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
              Comentario
            </span>
          )}
        </div>
        {file.description && (
          <p className="text-xs text-slate-600 mt-1 whitespace-pre-wrap">{file.description}</p>
        )}
        <p className="text-[10px] text-slate-400 mt-1">
          {showDoctor && <span className="font-semibold">{doctorName} · </span>}
          {new Date(file.created_at).toLocaleString('es-VE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
          {file.file_size_bytes && <> · {(file.file_size_bytes / 1024).toFixed(0)} KB</>}
        </p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {hasFile && (
          <a
            href={file.file_url!}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
            title="Abrir archivo"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
        )}
        {/* RONDA 44: lapiz + papelera SOLO si el item es del paciente */}
        {isOwnItem && onEdit && (
          <button
            onClick={() => onEdit(file)}
            className="p-2 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
            title="Editar"
          >
            <Pencil className="w-4 h-4" />
          </button>
        )}
        {isOwnItem && onDelete && (
          <button
            onClick={() => onDelete(file)}
            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            title="Eliminar"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  )
}

function UploadOrCommentModal({
  replyTo, doctors, selectedDoctorId, uploadTitle, uploadDescription, submitting,
  onTitleChange, onDescriptionChange, onClose, onSubmit,
}: {
  replyTo: SharedFile | null
  doctors: DoctorOption[]
  selectedDoctorId: string | null
  uploadTitle: string
  uploadDescription: string
  submitting: boolean
  onTitleChange: (v: string) => void
  onDescriptionChange: (v: string) => void
  onClose: () => void
  onSubmit: (file: File | null) => Promise<void>
}) {
  // Doctor preview (a quien va dirigido)
  const targetDoctor: DoctorOption | undefined = replyTo
    ? doctors.find(d => d.id === replyTo.doctor_id)
    : (doctors.length === 1 ? doctors[0] : (selectedDoctorId ? doctors.find(d => d.id === selectedDoctorId) : undefined))

  const ambiguousDoctor = !targetDoctor && doctors.length > 1

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-3" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-3.5 flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900">
            {replyTo ? `Responder: ${replyTo.title}` : 'Adjuntar o comentar'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">✕</button>
        </div>

        <div className="p-5 space-y-4">
          {targetDoctor && (
            <div className="bg-teal-50 border border-teal-200 rounded-lg px-3 py-2 text-xs text-teal-800 flex items-center gap-2">
              <Stethoscope className="w-3.5 h-3.5" />
              <span>Para: <b>{`${targetDoctor.professional_title || ''} ${targetDoctor.full_name}`.trim()}</b></span>
            </div>
          )}

          {ambiguousDoctor && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
              Tienes varios médicos. Cierra este modal y selecciona uno arriba antes de continuar.
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Título</label>
            <input
              type="text"
              value={uploadTitle}
              onChange={e => onTitleChange(e.target.value)}
              placeholder="Ej: Hematología, Pregunta sobre la dosis…"
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:border-teal-400 outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Comentario {/* RONDA 41: ahora puede ir solo */}
            </label>
            <textarea
              value={uploadDescription}
              onChange={e => onDescriptionChange(e.target.value)}
              placeholder="Escribe aquí. Si solo quieres responder al doctor, puedes enviar sin adjuntar archivo."
              rows={3}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm resize-none focus:border-teal-400 outline-none"
            />
          </div>

          {/* Botón para enviar SOLO comentario */}
          <button
            onClick={() => onSubmit(null)}
            disabled={submitting || ambiguousDoctor || !uploadDescription.trim()}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white text-sm font-bold rounded-xl disabled:opacity-50 transition-colors"
          >
            {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Enviando...</> : <><MessageSquare className="w-4 h-4" /> Enviar solo comentario</>}
          </button>

          <div className="flex items-center gap-2 text-xs text-slate-400">
            <div className="flex-1 border-t border-slate-200"></div>
            <span>o adjuntar archivo</span>
            <div className="flex-1 border-t border-slate-200"></div>
          </div>

          <UploadDropZone
            onUpload={async file => { await onSubmit(file) }}
            label="Suelta o selecciona el archivo"
            helperText="PDF, JPG o PNG. Máximo 20MB."
            disabled={ambiguousDoctor}
          />
        </div>
      </div>
    </div>
  )
}
