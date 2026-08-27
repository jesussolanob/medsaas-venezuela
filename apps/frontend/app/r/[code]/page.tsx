'use client';

/**
 * /r/<CODIGO> — enlace público que comparte el vendedor.
 *
 * Es la mitad que faltaba del mecanismo de atribución: hasta ahora el vendedor
 * solo podía dictar su código y el especialista tipearlo a mano en el onboarding.
 * Un error de una letra dejaba la venta sin acreditar y el vendedor se enteraba
 * semanas después.
 *
 * Qué hace:
 *   1. Valida el código contra el endpoint público y muestra a quién se le va a
 *      acreditar — para que la persona confirme que abrió el enlace correcto.
 *   2. Lo guarda en localStorage. Esto es lo importante: entre esta página y el
 *      onboarding está el login de Auth0, que se lleva puesto el parámetro de la
 *      URL. Sin persistirlo, el código no sobrevive el viaje.
 *   3. Manda a /login, que con Auth0 es también el registro.
 *
 * Si el código no existe, NO se bloquea el registro: se avisa y se deja seguir
 * sin atribución. Perder un lead por un código mal escrito sería peor.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { use } from 'react';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { guardarReferido, esCodigoValido } from '@/lib/seller-referral';

type Estado = { paso: 'validando' } | { paso: 'valido'; vendedor: string } | { paso: 'invalido' };

export default function ReferralPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const router = useRouter();
  const [estado, setEstado] = useState<Estado>({ paso: 'validando' });

  useEffect(() => {
    let vivo = true;
    void (async () => {
      const codigo = decodeURIComponent(code || '')
        .trim()
        .toUpperCase();

      if (!esCodigoValido(codigo)) {
        if (vivo) setEstado({ paso: 'invalido' });
        return;
      }

      try {
        const res = await fetch(`/api/public/seller-code/${encodeURIComponent(codigo)}`, {
          cache: 'no-store',
        });
        const json = (await res.json().catch(() => ({}))) as {
          valid?: boolean;
          sellerName?: string | null;
        };
        if (!vivo) return;

        if (json.valid) {
          // Se guarda ACÁ, no en el onboarding: es el único momento en que
          // tenemos el código con certeza.
          guardarReferido(codigo);
          setEstado({ paso: 'valido', vendedor: json.sellerName ?? 'tu vendedor' });
        } else {
          setEstado({ paso: 'invalido' });
        }
      } catch {
        if (vivo) setEstado({ paso: 'invalido' });
      }
    })();
    return () => {
      vivo = false;
    };
  }, [code]);

  // Un respiro para que se alcance a leer quién refirió, y sigue solo.
  useEffect(() => {
    if (estado.paso === 'validando') return;
    const t = setTimeout(() => router.replace('/login'), estado.paso === 'valido' ? 2200 : 3200);
    return () => clearTimeout(t);
  }, [estado.paso, router]);

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-xl p-8 max-w-md w-full text-center">
        {estado.paso === 'validando' && (
          <>
            <Loader2 className="w-8 h-8 animate-spin text-teal-500 mx-auto mb-4" />
            <p className="text-sm text-slate-500">Verificando el enlace…</p>
          </>
        )}

        {estado.paso === 'valido' && (
          <>
            <div className="w-12 h-12 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h1 className="text-lg font-bold text-slate-900">
              Te está invitando {estado.vendedor}
            </h1>
            <p className="text-sm text-slate-500 mt-2">
              Vamos a llevarte al registro. Tu cuenta va a quedar asociada a{' '}
              <strong>{estado.vendedor}</strong>.
            </p>
            <button
              type="button"
              onClick={() => router.replace('/login')}
              className="mt-6 w-full bg-teal-500 hover:bg-teal-600 text-white text-sm font-semibold rounded-lg py-2.5 transition-colors"
            >
              Continuar
            </button>
          </>
        )}

        {estado.paso === 'invalido' && (
          <>
            <div className="w-12 h-12 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h1 className="text-lg font-bold text-slate-900">Ese enlace no es válido</h1>
            <p className="text-sm text-slate-500 mt-2">
              Podés registrarte igual y escribir el código del vendedor durante el alta.
            </p>
            <button
              type="button"
              onClick={() => router.replace('/login')}
              className="mt-6 w-full bg-teal-500 hover:bg-teal-600 text-white text-sm font-semibold rounded-lg py-2.5 transition-colors"
            >
              Ir al registro
            </button>
          </>
        )}
      </div>
    </main>
  );
}
