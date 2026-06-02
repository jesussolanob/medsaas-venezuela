'use client'

// AUDIT FIX 2026-04-28 (FASE 5D): página de error dedicada para fallos de OAuth
// y problemas de autenticación. Reemplaza redirects con query params crípticos
// (`?error=auth`, `?google=error`) por mensajes claros en español.

import Link from 'next/link'
import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { AlertTriangle, ArrowLeft, RefreshCw } from 'lucide-react'

const ERROR_MESSAGES: Record<string, { title: string; description: string }> = {
  auth: {
    title: 'No pudimos iniciar tu sesión',
    description:
      'Hubo un problema verificando tu identidad. Intenta de nuevo o usa email + contraseña.',
  },
  suspended: {
    title: 'Tu cuenta está suspendida',
    description:
      'Por favor contacta al administrador para reactivarla.',
  },
  google_config_missing: {
    title: 'Integración con Google no configurada',
    description:
      'El servidor no tiene las credenciales de Google. Avisa al administrador del sistema.',
  },
  google_oauth_denied: {
    title: 'Conexión con Google cancelada',
    description:
      'No autorizaste el acceso. Si quieres conectar tu Google Calendar, intenta de nuevo y acepta los permisos.',
  },
  google_token_failed: {
    title: 'No pudimos conectar con Google',
    description:
      'Google rechazó la conexión. Verifica que tu cuenta tenga Calendar activo e intenta de nuevo.',
  },
  role_missing: {
    title: 'Falta configurar tu cuenta',
    description:
      'No encontramos tu rol asignado. Completa el onboarding para continuar.',
  },
  default: {
    title: 'Algo salió mal',
    description:
      'Ocurrió un error inesperado durante la autenticación. Intenta de nuevo.',
  },
}

function ErrorContent() {
  const searchParams = useSearchParams()
  const code = searchParams.get('type') ?? searchParams.get('error') ?? 'default'
  const meta = ERROR_MESSAGES[code] ?? ERROR_MESSAGES.default

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm max-w-md w-full p-6 sm:p-8 space-y-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-red-500" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-slate-900">{meta.title}</h1>
            <p className="text-sm text-slate-600 mt-1">{meta.description}</p>
            <p className="text-[11px] text-slate-400 mt-3 font-mono">code: {code}</p>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 pt-2">
          <Link
            href="/login"
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 g-bg text-white rounded-lg text-sm font-bold hover:opacity-90"
          >
            <RefreshCw className="w-4 h-4" />
            Intentar de nuevo
          </Link>
          <Link
            href="/"
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 border border-slate-200 text-slate-600 rounded-lg text-sm font-semibold hover:bg-slate-50"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver al inicio
          </Link>
        </div>
      </div>
      <style>{`.g-bg{background:linear-gradient(135deg,#00C4CC 0%,#0891b2 100%)}`}</style>
    </div>
  )
}

export default function AuthErrorPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
      <ErrorContent />
    </Suspense>
  )
}
