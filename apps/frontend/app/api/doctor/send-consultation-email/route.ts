import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = await req.json()
  const { patientEmail, patientName, doctorName, consultationDate, reason, comments, consultationCode } = body

  if (!patientEmail) {
    return NextResponse.json({ error: 'Email del paciente requerido' }, { status: 400 })
  }

  try {
    const admin = createAdminClient()

    // Format the date nicely
    const dateObj = new Date(consultationDate)
    const formattedDate = dateObj.toLocaleDateString('es-VE', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
    const formattedTime = dateObj.toLocaleTimeString('es-VE', {
      hour: '2-digit',
      minute: '2-digit',
    })

    // Send email via Supabase Auth (using admin client to send a custom email)
    // We use the Supabase edge function or a simple SMTP approach
    // For now, we'll use Supabase's built-in email sending through the auth.admin API
    // by creating a magic link that also serves as notification

    // Alternative: Use a simple fetch to a Resend/SendGrid API or Supabase Edge Function
    // For MVP, we store the notification and use Supabase's built-in email

    // Store the email notification in a notifications table or send directly
    // Using Supabase's built-in email sending via the edge function pattern
    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 0; background: #f8fafc; }
    .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
    .card { background: white; border-radius: 12px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .header { text-align: center; margin-bottom: 24px; }
    .logo { color: #0891b2; font-size: 24px; font-weight: 800; }
    .subtitle { color: #64748b; font-size: 12px; margin-top: 4px; }
    h2 { color: #1e293b; font-size: 18px; margin: 0 0 16px 0; }
    .info-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #f1f5f9; }
    .info-label { color: #94a3b8; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; }
    .info-value { color: #1e293b; font-size: 14px; font-weight: 600; text-align: right; }
    .comments { background: #f8fafc; border-radius: 8px; padding: 16px; margin-top: 16px; }
    .comments p { color: #475569; font-size: 13px; margin: 0; }
    .footer { text-align: center; margin-top: 24px; }
    .footer p { color: #94a3b8; font-size: 11px; }
    .badge { display: inline-block; background: #f0fdfa; color: #0d9488; font-size: 11px; font-weight: 700; padding: 4px 12px; border-radius: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="logo">Delta</div>
        <div class="subtitle">Medical CRM</div>
      </div>

      <h2>Nueva consulta programada</h2>
      <p style="color:#64748b;font-size:14px;margin-bottom:20px;">
        Hola <strong>${patientName || 'Paciente'}</strong>, se ha programado una consulta con los siguientes detalles:
      </p>

      <div style="border:1px solid #e2e8f0;border-radius:8px;padding:16px;">
        <div class="info-row">
          <span class="info-label">Doctor</span>
          <span class="info-value">${doctorName || 'Doctor'}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Fecha</span>
          <span class="info-value">${formattedDate}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Hora</span>
          <span class="info-value">${formattedTime}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Motivo</span>
          <span class="info-value">${reason || 'Consulta médica'}</span>
        </div>
        ${consultationCode ? `
        <div class="info-row" style="border-bottom:none;">
          <span class="info-label">Código</span>
          <span class="info-value"><span class="badge">${consultationCode}</span></span>
        </div>
        ` : ''}
      </div>

      ${comments ? `
      <div class="comments">
        <p style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;margin-bottom:8px;">Comentarios del doctor</p>
        <p>${comments}</p>
      </div>
      ` : ''}

      <div class="footer">
        <p>Este correo fue enviado automáticamente por Delta Medical CRM</p>
      </div>
    </div>
  </div>
</body>
</html>`

    // Store as patient message notification
    // In production, this would integrate with an email service (Resend, SendGrid, etc.)
    // For now, we store it as a system message to the patient
    const { data: patient } = await admin
      .from('patients')
      .select('id')
      .eq('email', patientEmail)
      .eq('doctor_id', user.id)
      .maybeSingle()

    if (patient) {
      await admin.from('patient_messages').insert({
        patient_id: patient.id,
        body: `📋 Nueva consulta programada para el ${formattedDate} a las ${formattedTime}. Motivo: ${reason || 'Consulta médica'}. ${comments ? 'Comentarios: ' + comments : ''}`,
        direction: 'doctor_to_patient',
      })
    }

    // TODO: Integrate with email service (Resend/SendGrid) for actual email delivery
    // For now, the notification is stored in patient_messages
    console.log(`Email notification stored for patient ${patientEmail}`, { consultationCode })

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('Error sending consultation email:', err)
    return NextResponse.json({ error: err?.message || 'Error al enviar email' }, { status: 500 })
  }
}
