'use client'

/**
 * ConsultationRecorder — graba la consulta con el micrófono y la transcribe.
 *
 * Pattern: Google Meet "Minutas" / Otter.ai
 * - El doctor presiona REC → micrófono activo → ve waveform + timer
 * - Pausa / reanuda en cualquier momento
 * - Detiene → manda audio a /api/doctor/consultations/transcribe
 * - Recibe transcript + sugerencias por bloque (opcional)
 * - El doctor decide:
 *     a) Pegar todo el texto en un bloque que elija
 *     b) Aplicar las sugerencias automáticas (1 click por bloque)
 *     c) Copiar el texto crudo y editarlo manualmente
 *
 * Privacidad: el audio NO se guarda en el servidor. Se envía a Gemini
 * para transcribir, y descartamos el blob. Solo persiste el TEXTO en
 * blocks_data si el doctor lo decide.
 */

import { useEffect, useRef, useState } from 'react'
import {
  Mic, Square, Pause, Play, Loader2, Trash2, Sparkles,
  CheckCircle2, AlertCircle, X, FileText, Copy,
} from 'lucide-react'

type AvailableBlock = {
  key: string
  label: string
}

type Suggestion = {
  block_key: string
  content: string
}

type Props = {
  /** Bloques disponibles en la plantilla del doctor (para sugerencias) */
  availableBlocks: AvailableBlock[]
  /** Callback cuando el doctor aplica el texto a un bloque */
  onApplyToBlock: (blockKey: string, content: string, mode: 'replace' | 'append') => void
  /** Locale del audio — default 'es-VE' */
  language?: string
}

type RecorderState = 'idle' | 'recording' | 'paused' | 'processing' | 'review' | 'error'

function fmtTime(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0')
  const s = Math.floor(seconds % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

export default function ConsultationRecorder({ availableBlocks, onApplyToBlock, language = 'es-VE' }: Props) {
  const [state, setState] = useState<RecorderState>('idle')
  const [elapsed, setElapsed] = useState(0)
  const [transcript, setTranscript] = useState('')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [error, setError] = useState<string | null>(null)
  const [appliedKeys, setAppliedKeys] = useState<Set<string>>(new Set())
  const [showPanel, setShowPanel] = useState(false)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const tickerRef = useRef<NodeJS.Timeout | null>(null)

  // Cleanup al desmontar
  useEffect(() => {
    return () => {
      if (tickerRef.current) clearInterval(tickerRef.current)
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
    }
  }, [])

  function startTicker() {
    if (tickerRef.current) clearInterval(tickerRef.current)
    tickerRef.current = setInterval(() => setElapsed(e => e + 1), 1000)
  }
  function stopTicker() {
    if (tickerRef.current) { clearInterval(tickerRef.current); tickerRef.current = null }
  }

  async function startRecording() {
    setError(null)
    setTranscript('')
    setSuggestions([])
    setAppliedKeys(new Set())
    setElapsed(0)
    chunksRef.current = []

    try {
      // 1. Pedir permiso
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      streamRef.current = stream

      // 2. Detectar mimeType soportado (Safari prefiere mp4, Chrome webm)
      const mimeOptions = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']
      const mime = mimeOptions.find(m => MediaRecorder.isTypeSupported(m)) || ''
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      recorderRef.current = recorder

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = () => {
        // El stop dispara el flow de transcripción
        stopTicker()
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(t => t.stop())
          streamRef.current = null
        }
        finishAndTranscribe()
      }

      // 3. Empezar a grabar — chunks cada 1s para evitar pérdidas
      recorder.start(1000)
      setState('recording')
      setShowPanel(true)
      startTicker()
    } catch (err: any) {
      console.error('[recorder] getUserMedia error:', err)
      const isPermissionErr = err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError'
      setError(
        isPermissionErr
          ? 'Permite el acceso al micrófono para poder grabar.'
          : 'No pude acceder al micrófono. Verifica que esté conectado.',
      )
      setState('error')
    }
  }

  function pauseRecording() {
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.pause()
      stopTicker()
      setState('paused')
    }
  }

  function resumeRecording() {
    if (recorderRef.current?.state === 'paused') {
      recorderRef.current.resume()
      startTicker()
      setState('recording')
    }
  }

  function stopRecording() {
    if (recorderRef.current && (recorderRef.current.state === 'recording' || recorderRef.current.state === 'paused')) {
      recorderRef.current.stop()
      setState('processing')
    }
  }

  function discardRecording() {
    if (recorderRef.current) {
      try { recorderRef.current.stop() } catch {}
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    stopTicker()
    chunksRef.current = []
    setTranscript('')
    setSuggestions([])
    setAppliedKeys(new Set())
    setElapsed(0)
    setError(null)
    setState('idle')
    setShowPanel(false)
  }

  async function finishAndTranscribe() {
    if (chunksRef.current.length === 0) {
      setError('No se grabó audio.')
      setState('error')
      return
    }

    const mime = recorderRef.current?.mimeType || 'audio/webm'
    const blob = new Blob(chunksRef.current, { type: mime })
    if (blob.size < 1024) {
      setError('Grabación demasiado corta (menos de 1 segundo).')
      setState('error')
      return
    }

    try {
      const fd = new FormData()
      const ext = mime.includes('mp4') ? 'm4a' : mime.includes('ogg') ? 'ogg' : 'webm'
      fd.append('audio', blob, `consulta.${ext}`)
      fd.append('language', language)
      if (availableBlocks.length > 0) {
        fd.append('available_blocks', JSON.stringify(availableBlocks))
      }

      const res = await fetch('/api/doctor/consultations/transcribe', {
        method: 'POST',
        body: fd,
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `HTTP ${res.status}`)
      }
      setTranscript(data.transcript || '')
      setSuggestions(Array.isArray(data.suggestions) ? data.suggestions : [])
      setState('review')
    } catch (err: any) {
      console.error('[recorder] transcribe error:', err)
      setError(err?.message || 'No se pudo transcribir el audio')
      setState('error')
    }
  }

  function applySuggestion(s: Suggestion, mode: 'replace' | 'append' = 'append') {
    onApplyToBlock(s.block_key, s.content, mode)
    setAppliedKeys(prev => new Set(prev).add(s.block_key))
  }

  function applyAllSuggestions() {
    suggestions.forEach(s => applySuggestion(s, 'append'))
  }

  function copyTranscript() {
    navigator.clipboard?.writeText(transcript).catch(() => {})
  }

  // ── Render: botón compacto cuando está idle, panel expandido cuando active
  if (!showPanel && state === 'idle') {
    return (
      <button
        onClick={startRecording}
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-[13px] font-bold text-white transition-all hover:-translate-y-px"
        style={{
          background: 'var(--dh-coral)',
          boxShadow: '0 6px 18px rgba(255,138,101,0.25)',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--dh-coral-600)' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'var(--dh-coral)' }}
      >
        <Mic className="w-4 h-4" />
        Grabar consulta
      </button>
    )
  }

  return (
    <div
      className="bg-white p-5 sm:p-6 space-y-4"
      style={{
        border: '1px solid var(--dh-gray-100)',
        borderRadius: 'var(--dh-r-lg)',
        boxShadow: 'var(--dh-shadow-md)',
      }}
    >
      {/* Header del panel */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{
              background: state === 'recording' ? 'var(--dh-coral)' : 'var(--dh-coral-100)',
              color: state === 'recording' ? '#fff' : 'var(--dh-coral-600)',
            }}
          >
            <Mic className="w-4 h-4" />
          </div>
          <div>
            <p className="text-sm font-bold" style={{ color: 'var(--dh-ink)' }}>
              {state === 'recording'  && 'Grabando consulta…'}
              {state === 'paused'     && 'Grabación pausada'}
              {state === 'processing' && 'Transcribiendo audio…'}
              {state === 'review'     && 'Transcripción lista'}
              {state === 'error'      && 'Error en la grabación'}
              {state === 'idle'       && 'Grabador de consulta'}
            </p>
            <p className="text-xs" style={{ color: 'var(--dh-gray-400)', fontFamily: 'var(--dh-font-mono)' }}>
              {(state === 'recording' || state === 'paused') && `${fmtTime(elapsed)}`}
              {state === 'processing' && 'Esto puede tardar 10-30 segundos…'}
              {state === 'review' && `${fmtTime(elapsed)} grabados`}
              {state === 'error' && 'Reinicia para intentar otra vez'}
            </p>
          </div>
        </div>
        <button
          onClick={discardRecording}
          className="p-1.5 rounded-md transition-colors"
          style={{ color: 'var(--dh-gray-400)' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--dh-gray-50)'; e.currentTarget.style.color = 'var(--dh-ink)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--dh-gray-400)' }}
          aria-label="Cerrar grabador"
          title="Cerrar"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Visualización tipo "live" cuando graba */}
      {(state === 'recording' || state === 'paused') && (
        <div
          className="flex items-center gap-2 p-3"
          style={{
            background: state === 'recording' ? 'var(--dh-coral-100)' : 'var(--dh-gray-50)',
            borderRadius: 'var(--dh-r-md)',
          }}
        >
          {state === 'recording' && (
            <div className="flex items-center gap-1">
              {[...Array(5)].map((_, i) => (
                <span
                  key={i}
                  className="block w-1 rounded-full"
                  style={{
                    height: 12 + (i % 3) * 6,
                    background: 'var(--dh-coral)',
                    animation: `dh-pulse 1s ease-in-out ${i * 0.12}s infinite`,
                  }}
                />
              ))}
              <style>{`@keyframes dh-pulse{0%,100%{transform:scaleY(0.3);opacity:0.6}50%{transform:scaleY(1);opacity:1}}`}</style>
            </div>
          )}
          <span className="text-sm" style={{ color: 'var(--dh-coral-600)' }}>
            {state === 'recording' ? 'Tu micrófono está activo' : 'Pausado — clic en ▶ para reanudar'}
          </span>
        </div>
      )}

      {/* Botones de control */}
      {(state === 'recording' || state === 'paused') && (
        <div className="flex items-center gap-2 flex-wrap">
          {state === 'recording' ? (
            <button
              onClick={pauseRecording}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold transition-all"
              style={{
                background: 'var(--dh-gray-50)',
                color: 'var(--dh-ink)',
                border: '1.5px solid var(--dh-gray-200)',
              }}
            >
              <Pause className="w-3.5 h-3.5" /> Pausar
            </button>
          ) : (
            <button
              onClick={resumeRecording}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold text-white transition-all"
              style={{ background: 'var(--dh-turquoise)' }}
            >
              <Play className="w-3.5 h-3.5" /> Reanudar
            </button>
          )}
          <button
            onClick={stopRecording}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold text-white transition-all"
            style={{ background: 'var(--dh-ink)' }}
          >
            <Square className="w-3.5 h-3.5" /> Detener y transcribir
          </button>
          <button
            onClick={discardRecording}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-semibold transition-all"
            style={{ color: 'var(--dh-gray-600)' }}
          >
            <Trash2 className="w-3.5 h-3.5" /> Descartar
          </button>
        </div>
      )}

      {/* Processing */}
      {state === 'processing' && (
        <div className="flex items-center gap-3 py-4">
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--dh-turquoise)' }} />
          <p className="text-sm" style={{ color: 'var(--dh-gray-600)' }}>
            Procesando con IA — no cierres esta página…
          </p>
        </div>
      )}

      {/* Error */}
      {state === 'error' && error && (
        <div
          className="flex items-start gap-2 p-3"
          style={{
            background: '#FEF2F2',
            border: '1px solid #FEE2E2',
            borderRadius: 'var(--dh-r-md)',
          }}
        >
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: 'var(--dh-error)' }} />
          <div className="flex-1">
            <p className="text-sm font-semibold" style={{ color: '#991B1B' }}>
              {error}
            </p>
            <button
              onClick={discardRecording}
              className="text-xs font-semibold mt-2 underline"
              style={{ color: '#991B1B' }}
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      {/* Review — transcripción lista */}
      {state === 'review' && transcript && (
        <div className="space-y-4">
          {/* Transcripción raw */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p
                className="text-[11px] uppercase font-semibold tracking-wider"
                style={{ color: 'var(--dh-gray-400)', fontFamily: 'var(--dh-font-mono)' }}
              >
                Transcripción
              </p>
              <button
                onClick={copyTranscript}
                className="text-xs font-semibold inline-flex items-center gap-1"
                style={{ color: 'var(--dh-turquoise-700)' }}
              >
                <Copy className="w-3 h-3" /> Copiar texto
              </button>
            </div>
            <div
              className="text-sm whitespace-pre-wrap p-3 max-h-60 overflow-y-auto"
              style={{
                background: 'var(--dh-gray-50)',
                color: 'var(--dh-ink)',
                border: '1px solid var(--dh-gray-100)',
                borderRadius: 'var(--dh-r-md)',
                lineHeight: 1.55,
              }}
            >
              {transcript}
            </div>
          </div>

          {/* Sugerencias por bloque */}
          {suggestions.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                <p
                  className="text-[11px] uppercase font-semibold tracking-wider flex items-center gap-1.5"
                  style={{ color: 'var(--dh-turquoise-700)', fontFamily: 'var(--dh-font-mono)' }}
                >
                  <Sparkles className="w-3 h-3" /> Sugerencias por bloque
                </p>
                <button
                  onClick={applyAllSuggestions}
                  className="text-xs font-bold inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full"
                  style={{ background: 'var(--dh-turquoise)', color: '#fff' }}
                >
                  <CheckCircle2 className="w-3 h-3" /> Aplicar todas
                </button>
              </div>
              <div className="space-y-2">
                {suggestions.map((s) => {
                  const blockLabel = availableBlocks.find(b => b.key === s.block_key)?.label || s.block_key
                  const applied = appliedKeys.has(s.block_key)
                  return (
                    <div
                      key={s.block_key}
                      className="p-3"
                      style={{
                        background: applied ? '#D1FAE5' : 'var(--dh-turquoise-50)',
                        border: `1px solid ${applied ? '#A7F3D0' : 'var(--dh-turquoise-100)'}`,
                        borderRadius: 'var(--dh-r-md)',
                      }}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
                        <span className="text-xs font-bold" style={{ color: 'var(--dh-ink)' }}>
                          {blockLabel}
                        </span>
                        {applied ? (
                          <span
                            className="inline-flex items-center gap-1 text-[11px] font-bold"
                            style={{ color: '#047857' }}
                          >
                            <CheckCircle2 className="w-3 h-3" /> Aplicado
                          </span>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => applySuggestion(s, 'append')}
                              className="text-[11px] font-bold px-2.5 py-1 rounded-full transition-colors"
                              style={{ background: '#fff', color: 'var(--dh-turquoise-700)', border: '1px solid var(--dh-turquoise-100)' }}
                            >
                              + Agregar
                            </button>
                            <button
                              onClick={() => applySuggestion(s, 'replace')}
                              className="text-[11px] font-bold px-2.5 py-1 rounded-full text-white transition-colors"
                              style={{ background: 'var(--dh-turquoise)' }}
                            >
                              Reemplazar
                            </button>
                          </div>
                        )}
                      </div>
                      <p
                        className="text-xs whitespace-pre-wrap"
                        style={{ color: 'var(--dh-gray-800)', lineHeight: 1.5 }}
                      >
                        {s.content}
                      </p>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Asignación manual a un bloque */}
          {availableBlocks.length > 0 && (
            <div
              className="p-3"
              style={{
                background: 'var(--dh-gray-50)',
                border: '1px dashed var(--dh-gray-200)',
                borderRadius: 'var(--dh-r-md)',
              }}
            >
              <p
                className="text-[11px] uppercase font-semibold tracking-wider mb-2 flex items-center gap-1.5"
                style={{ color: 'var(--dh-gray-600)', fontFamily: 'var(--dh-font-mono)' }}
              >
                <FileText className="w-3 h-3" /> O pegar la transcripción completa en…
              </p>
              <div className="flex flex-wrap gap-1.5">
                {availableBlocks.map(b => (
                  <button
                    key={b.key}
                    onClick={() => onApplyToBlock(b.key, transcript, 'append')}
                    className="text-[11px] font-semibold px-2.5 py-1 rounded-full transition-colors"
                    style={{
                      background: '#fff',
                      color: 'var(--dh-gray-800)',
                      border: '1px solid var(--dh-gray-200)',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--dh-turquoise-50)'; e.currentTarget.style.color = 'var(--dh-turquoise-700)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.color = 'var(--dh-gray-800)' }}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Acciones finales */}
          <div className="flex items-center gap-2 pt-2" style={{ borderTop: '1px solid var(--dh-gray-100)' }}>
            <button
              onClick={discardRecording}
              className="text-xs font-semibold px-3 py-2 rounded-full"
              style={{ color: 'var(--dh-gray-600)' }}
            >
              Cerrar
            </button>
            <button
              onClick={startRecording}
              className="text-xs font-bold px-4 py-2 rounded-full inline-flex items-center gap-1.5 ml-auto"
              style={{ background: 'var(--dh-coral)', color: '#fff' }}
            >
              <Mic className="w-3 h-3" /> Grabar otra vez
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
