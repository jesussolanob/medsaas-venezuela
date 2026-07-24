'use client';

/**
 * ReviewerLoginBlock.tsx
 *
 * Discrete "Acceso para revisión" form. Only rendered when ?review=1 is present
 * in the URL — never visible to the public on /login without that param.
 *
 * On success: does a full-page navigation to /doctor so the middleware runs
 * with the reviewer_token cookie already set by the BFF route handler.
 */

import { useState } from 'react';
import { AlertCircle, Loader2, Mail, Lock, Eye, EyeOff, ArrowRight } from 'lucide-react';

interface ReviewerLoginResult {
  success: boolean;
  error?: string;
}

export function ReviewerLoginBlock() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError('Ingresa tu email y contraseña');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/reviewer-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      const data = (await res.json()) as ReviewerLoginResult;

      if (!data.success) {
        setError(data.error ?? 'Credenciales inválidas');
        setLoading(false);
        return;
      }

      // Full navigation so the middleware evaluates the new reviewer_token cookie.
      window.location.href = '/doctor';
    } catch {
      setError('No se pudo conectar con el servidor. Intenta de nuevo.');
      setLoading(false);
    }
  }

  return (
    <div className="mt-4">
      {/* Divider */}
      <div className="flex items-center gap-3 my-2">
        <div className="flex-1 h-px" style={{ background: 'var(--dh-gray-100)' }} />
        <span
          className="text-[10px] font-medium uppercase tracking-wider"
          style={{ color: 'var(--dh-gray-400)' }}
        >
          acceso para revisión
        </span>
        <div className="flex-1 h-px" style={{ background: 'var(--dh-gray-100)' }} />
      </div>

      {/* Card */}
      <div
        className="rounded-xl p-5 border mt-3"
        style={{
          background: 'var(--dh-gray-50)',
          borderColor: 'var(--dh-gray-100)',
        }}
      >
        <p className="text-xs font-semibold mb-4" style={{ color: 'var(--dh-gray-600)' }}>
          Acceso para revisión
        </p>

        {error && (
          <div
            className="mb-4 rounded-lg px-3 py-2.5 flex items-start gap-2"
            style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}
          >
            <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
            <p className="text-red-700 text-xs">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Email */}
          <div>
            <label
              htmlFor="reviewer-email"
              className="block text-xs font-medium mb-1"
              style={{ color: 'var(--dh-gray-600)' }}
            >
              Correo electrónico
            </label>
            <div className="relative">
              <Mail
                className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5"
                style={{ color: 'var(--dh-gray-400)' }}
              />
              <input
                id="reviewer-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
                placeholder="reviewer@ejemplo.com"
                autoComplete="username"
                className="input-dh w-full pl-9 pr-3 py-2.5 border rounded-lg text-xs transition-all disabled:opacity-60"
                style={{
                  borderColor: 'var(--dh-gray-100)',
                  color: 'var(--dh-ink)',
                  background: '#fff',
                }}
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label
              htmlFor="reviewer-password"
              className="block text-xs font-medium mb-1"
              style={{ color: 'var(--dh-gray-600)' }}
            >
              Contraseña
            </label>
            <div className="relative">
              <Lock
                className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5"
                style={{ color: 'var(--dh-gray-400)' }}
              />
              <input
                id="reviewer-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
                placeholder="••••••••"
                autoComplete="current-password"
                className="input-dh w-full pl-9 pr-9 py-2.5 border rounded-lg text-xs transition-all disabled:opacity-60"
                style={{
                  borderColor: 'var(--dh-gray-100)',
                  color: 'var(--dh-ink)',
                  background: '#fff',
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2"
                style={{ color: 'var(--dh-gray-400)' }}
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {showPassword ? (
                  <EyeOff className="w-3.5 h-3.5" />
                ) : (
                  <Eye className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            style={{
              background: '#0d9488',
              color: '#fff',
            }}
          >
            {loading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Verificando...
              </>
            ) : (
              <>
                Entrar
                <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
