/**
 * lib/email.ts
 *
 * Single source of truth para envío de email transaccional.
 * Pattern: provider-agnostic — hoy Resend, mañana SendGrid sin cambiar callsites.
 *
 * Setup en Vercel:
 *   RESEND_API_KEY=re_xxx        ← obtener en https://resend.com/api-keys
 *   RESEND_FROM_EMAIL=Delta Medical CRM <hola@deltamedical.com>
 *   APP_URL=https://medsaas-venezuela.vercel.app  ← o tu dominio custom
 *
 * Si RESEND_API_KEY no está set, sendEmail() loggea y retorna ok:false
 * sin tirar error — no rompe el flow al doctor (degradación graceful).
 */

type EmailParams = {
  to: string | string[]
  subject: string
  html: string
  text?: string
  /** Reply-to para que el doctor pueda responder al support */
  replyTo?: string
  /** Tags para tracking en Resend dashboard */
  tags?: { name: string; value: string }[]
}

type SendResult = { ok: true; id: string } | { ok: false; error: string }

const FROM_DEFAULT = 'Delta Medical CRM <onboarding@resend.dev>'  // sandbox de Resend hasta que se configure dominio

export async function sendEmail(params: EmailParams): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM_EMAIL || FROM_DEFAULT

  if (!apiKey) {
    console.warn('[email] RESEND_API_KEY no configurada. Email NO enviado:', {
      to: params.to,
      subject: params.subject,
    })
    return { ok: false, error: 'RESEND_API_KEY no configurada (skip silencioso)' }
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: Array.isArray(params.to) ? params.to : [params.to],
        subject: params.subject,
        html: params.html,
        text: params.text,
        reply_to: params.replyTo,
        tags: params.tags,
      }),
    })

    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      console.error('[email] Resend API error:', { status: res.status, data })
      return { ok: false, error: data?.message || `Resend respondió ${res.status}` }
    }

    return { ok: true, id: data.id }
  } catch (err: any) {
    console.error('[email] network error:', err?.message)
    return { ok: false, error: err?.message || 'Error de red' }
  }
}

// ─── Helper: layout HTML profesional reutilizable ──────────────────────────
export function emailLayout(opts: {
  preheader?: string  // texto que aparece en preview de Gmail/Apple Mail
  heading: string
  body: string  // HTML body content
  cta?: { label: string; url: string }
  footerNote?: string
}): string {
  const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_URL || 'https://medsaas-venezuela.vercel.app'
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${opts.heading}</title>
</head>
<body style="margin:0;padding:0;background:#FAFBFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  ${opts.preheader ? `<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:#FAFBFC">${opts.preheader}</div>` : ''}

  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FAFBFC;padding:24px 12px">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#FFFFFF;border-radius:16px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.04)">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#06B6D4 0%,#0891b2 100%);padding:28px 32px">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="color:#FFFFFF;font-size:20px;font-weight:800;letter-spacing:-0.02em">
                    Delta<span style="color:#FFE5DA">.</span>
                  </td>
                  <td style="color:rgba(255,255,255,0.7);font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px;text-align:right">
                    Medical CRM
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px">
              <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#0F1A2A;line-height:1.3">${opts.heading}</h1>
              <div style="font-size:15px;color:#475569;line-height:1.7">
                ${opts.body}
              </div>
              ${opts.cta ? `
                <div style="margin:28px 0 0">
                  <a href="${opts.cta.url}" style="display:inline-block;background:#0891B2;color:#FFFFFF;font-weight:700;font-size:14px;padding:12px 28px;border-radius:12px;text-decoration:none">
                    ${opts.cta.label}
                  </a>
                </div>
              ` : ''}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 32px;background:#F8FAFC;border-top:1px solid #E2E8F0">
              ${opts.footerNote ? `<p style="margin:0 0 12px;font-size:12px;color:#64748B;line-height:1.6">${opts.footerNote}</p>` : ''}
              <p style="margin:0;font-size:11px;color:#94A3B8;line-height:1.6">
                Este correo fue enviado por <strong>Delta Medical CRM</strong>.<br>
                Si tienes preguntas, escríbenos a <a href="mailto:soporte@deltamedical.com" style="color:#0891B2">soporte@deltamedical.com</a>.<br>
                <a href="${appUrl}" style="color:#94A3B8">${appUrl.replace(/^https?:\/\//, '')}</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

// ─── Templates predefinidos ────────────────────────────────────────────────

/**
 * Suscripción vence en N días.
 * Llamar desde Edge Function diaria que revisa subscription_expires_at.
 */
export async function sendSubscriptionExpiringEmail(args: {
  to: string
  doctor_name: string
  days_remaining: number
  expires_at: string  // ISO date
}): Promise<SendResult> {
  const appUrl = process.env.APP_URL || 'https://medsaas-venezuela.vercel.app'
  const expiresStr = new Date(args.expires_at).toLocaleDateString('es-VE', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
  const urgent = args.days_remaining <= 3

  const heading = urgent
    ? `⚠️ Tu suscripción vence en ${args.days_remaining} día${args.days_remaining === 1 ? '' : 's'}`
    : `Tu suscripción vence pronto`

  const body = `
    <p>Hola Dr/a. <strong>${escapeHtml(args.doctor_name)}</strong>,</p>
    <p>Tu suscripción a Delta Medical CRM vence el <strong>${expiresStr}</strong>
    (en ${args.days_remaining} día${args.days_remaining === 1 ? '' : 's'}).</p>
    <p>Para no perder acceso a tu agenda, pacientes y consultas, renueva tu plan ahora.
    Toma menos de 2 minutos.</p>
  `
  const html = emailLayout({
    preheader: `Vence en ${args.days_remaining} día${args.days_remaining === 1 ? '' : 's'} — renueva para no perder acceso`,
    heading,
    body,
    cta: { label: 'Renovar mi plan', url: `${appUrl}/doctor/settings?tab=subscription` },
    footerNote: 'Si renovaste recientemente, puede tomar unos minutos en reflejarse. Ignora este aviso.',
  })

  return sendEmail({
    to: args.to,
    subject: heading,
    html,
    tags: [
      { name: 'category', value: 'subscription_expiring' },
      { name: 'days_remaining', value: String(args.days_remaining) },
    ],
  })
}

/**
 * Bienvenida al registrarse como doctor.
 */
export async function sendWelcomeEmail(args: {
  to: string
  doctor_name: string
  beta_days: number
}): Promise<SendResult> {
  const appUrl = process.env.APP_URL || 'https://medsaas-venezuela.vercel.app'
  const body = `
    <p>Hola Dr/a. <strong>${escapeHtml(args.doctor_name)}</strong>,</p>
    <p>Tu cuenta en Delta Medical CRM está lista. Tienes <strong>${args.beta_days} días de prueba gratis</strong>
    con acceso completo a la plataforma.</p>
    <p><strong>Próximos pasos:</strong></p>
    <ol style="padding-left:18px;margin:12px 0">
      <li>Completa tu perfil profesional (foto, métodos de pago, especialidad)</li>
      <li>Configura tu agenda y disponibilidad</li>
      <li>Comparte tu link público de booking con tus pacientes</li>
    </ol>
  `
  const html = emailLayout({
    preheader: '¡Bienvenido a Delta Medical CRM! Aquí están tus primeros pasos',
    heading: '¡Bienvenido a Delta Medical CRM!',
    body,
    cta: { label: 'Ir a mi panel', url: `${appUrl}/doctor` },
  })

  return sendEmail({
    to: args.to,
    subject: '¡Bienvenido a Delta Medical CRM!',
    html,
    tags: [{ name: 'category', value: 'welcome' }],
  })
}

/**
 * Comprobante de pago aprobado.
 */
export async function sendPaymentApprovedEmail(args: {
  to: string
  doctor_name: string
  amount_usd: number
  duration_months: number
  new_expires_at: string
}): Promise<SendResult> {
  const appUrl = process.env.APP_URL || 'https://medsaas-venezuela.vercel.app'
  const expiresStr = new Date(args.new_expires_at).toLocaleDateString('es-VE', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
  const body = `
    <p>Hola Dr/a. <strong>${escapeHtml(args.doctor_name)}</strong>,</p>
    <p>Tu pago de <strong>$${args.amount_usd} USD</strong> por
    ${args.duration_months} mes${args.duration_months > 1 ? 'es' : ''} fue aprobado.</p>
    <p>Tu suscripción ahora está activa hasta el <strong>${expiresStr}</strong>.
    ¡Gracias por tu confianza!</p>
  `
  const html = emailLayout({
    preheader: `Pago aprobado — suscripción extendida hasta ${expiresStr}`,
    heading: '✅ Pago aprobado',
    body,
    cta: { label: 'Ver mi suscripción', url: `${appUrl}/doctor/settings?tab=subscription` },
  })
  return sendEmail({
    to: args.to,
    subject: '✅ Pago aprobado — Delta Medical CRM',
    html,
    tags: [{ name: 'category', value: 'payment_approved' }],
  })
}

/**
 * Comprobante de pago rechazado.
 */
export async function sendPaymentRejectedEmail(args: {
  to: string
  doctor_name: string
  reason: string
}): Promise<SendResult> {
  const appUrl = process.env.APP_URL || 'https://medsaas-venezuela.vercel.app'
  const body = `
    <p>Hola Dr/a. <strong>${escapeHtml(args.doctor_name)}</strong>,</p>
    <p>Tu comprobante de pago no pudo ser aprobado. Motivo:</p>
    <blockquote style="margin:12px 0;padding:12px 16px;background:#FEF2F2;border-left:3px solid #EF4444;color:#991B1B;font-style:italic">
      ${escapeHtml(args.reason)}
    </blockquote>
    <p>Puedes subir un nuevo comprobante desde tu panel.</p>
  `
  const html = emailLayout({
    preheader: 'Tu comprobante de pago necesita revisión',
    heading: '⚠️ Comprobante no aprobado',
    body,
    cta: { label: 'Subir nuevo comprobante', url: `${appUrl}/doctor/settings?tab=subscription` },
  })
  return sendEmail({
    to: args.to,
    subject: 'Comprobante no aprobado — Delta Medical CRM',
    html,
    tags: [{ name: 'category', value: 'payment_rejected' }],
  })
}

// ─── Util ───────────────────────────────────────────────────────────────────
function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
