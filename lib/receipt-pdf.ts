/**
 * lib/receipt-pdf.ts — generador de HTML para recibos de pago.
 *
 * Reutiliza el mismo branding que los informes medicos:
 * - logo_url y signature_url del profile del doctor
 * - color institucional turquesa Delta
 * - fuente Inter
 * - layout consistente con buildPdfHtml de consultations
 *
 * Devuelve HTML listo para abrir en window.open() y disparar window.print().
 */

import { formatPaymentMethod } from './payment-methods'

export type ReceiptData = {
  // Datos del recibo
  paymentCode: string                     // P3000XXX o appointment_code como fallback
  consultationCode?: string | null        // C2000XXX si esta vinculada
  patientName: string
  patientCedula?: string | null
  patientEmail?: string | null
  patientPhone?: string | null
  amountUsd: number
  amountBs?: number | null
  bcvRate?: number | null
  paymentMethod: string | null
  paymentReference?: string | null
  paidAt: string                          // ISO
  scheduledAt: string                     // ISO de la cita
  planName?: string | null
  // Items adicionales (RONDA 34: agregar paquete/servicio extra)
  extraItems?: Array<{ name: string; amount: number }>
  // Branding del doctor
  doctorName: string
  doctorTitle?: string | null
  doctorSpecialty?: string | null
  doctorLicense?: string | null
  doctorEmail?: string | null
  doctorPhone?: string | null
  logoUrl?: string | null
  signatureUrl?: string | null
  primaryColor?: string                    // default #0891b2
}

const fmtUsd = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n || 0)
const fmtBs = (n: number) => `Bs ${new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2 }).format(n || 0)}`

export function buildReceiptHtml(data: ReceiptData): string {
  const color = data.primaryColor || '#0891b2'
  const paid = new Date(data.paidAt).toLocaleString('es-VE', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
  const sched = new Date(data.scheduledAt).toLocaleDateString('es-VE', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  // Total = monto base + items extra
  const extraTotal = (data.extraItems || []).reduce((s, i) => s + (i.amount || 0), 0)
  const grandTotal = data.amountUsd + extraTotal

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<title>Recibo ${data.paymentCode}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Inter', sans-serif; }
  body { padding: 40px; color: #1e293b; line-height: 1.55; max-width: 800px; margin: 0 auto; }
  .header { display: flex; align-items: center; justify-content: space-between; padding-bottom: 20px; margin-bottom: 28px; border-bottom: 3px solid ${color}; }
  .header-left { display: flex; align-items: center; gap: 16px; }
  .header-logo img { max-height: 64px; max-width: 200px; object-fit: contain; }
  .header-title h1 { color: ${color}; font-size: 24px; font-weight: 700; letter-spacing: -0.5px; }
  .header-title p { color: #64748b; font-size: 13px; margin-top: 2px; }
  .badge-recibo { background: ${color}; color: white; padding: 6px 14px; border-radius: 999px; font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; }
  .meta { display: grid; grid-template-columns: repeat(2, 1fr); gap: 18px 32px; padding: 20px; background: #f8fafc; border-radius: 12px; margin-bottom: 28px; }
  .meta-item .label { font-size: 10px; color: #94a3b8; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px; }
  .meta-item .value { font-size: 14px; color: #1e293b; font-weight: 600; }
  .code { font-family: 'Courier New', monospace; background: white; padding: 3px 8px; border-radius: 4px; border: 1px solid #e2e8f0; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  th { text-align: left; font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 700; padding: 12px 14px; border-bottom: 2px solid ${color}; }
  th.right { text-align: right; }
  td { padding: 14px; font-size: 14px; color: #1e293b; border-bottom: 1px solid #e2e8f0; }
  td.right { text-align: right; }
  td.amount { font-weight: 700; color: ${color}; }
  tr.total td { padding-top: 18px; font-size: 16px; font-weight: 800; border-top: 2px solid #1e293b; border-bottom: none; }
  tr.total td.amount { color: ${color}; font-size: 20px; }
  .totals-bs { font-size: 11px; color: #94a3b8; font-weight: 500; }
  .signature-block { margin-top: 50px; display: flex; justify-content: flex-end; }
  .signature { text-align: center; }
  .signature img { max-height: 70px; margin-bottom: 6px; }
  .signature-line { border-top: 1px solid #1e293b; padding-top: 6px; min-width: 240px; }
  .signature .name { font-size: 13px; font-weight: 700; color: #1e293b; }
  .signature .title { font-size: 11px; color: #64748b; }
  .footer { margin-top: 48px; padding-top: 18px; border-top: 1px solid #e2e8f0; text-align: center; }
  .footer p { font-size: 10px; color: #94a3b8; }
  @media print { body { padding: 24px; } .no-print { display: none; } }
</style>
</head>
<body>

  <div class="header">
    <div class="header-left">
      ${data.logoUrl ? `<div class="header-logo"><img src="${data.logoUrl}" alt="Logo" crossorigin="anonymous" /></div>` : ''}
      <div class="header-title">
        <h1>${data.doctorTitle || ''} ${data.doctorName}</h1>
        <p>${data.doctorSpecialty || 'Médico especialista'}</p>
        ${data.doctorLicense ? `<p style="font-size:10px;color:#94a3b8">Mat. ${data.doctorLicense}</p>` : ''}
      </div>
    </div>
    <div class="badge-recibo">Recibo de pago</div>
  </div>

  <div class="meta">
    <div class="meta-item">
      <p class="label">Código de recibo</p>
      <p class="value"><span class="code">${data.paymentCode}</span></p>
    </div>
    ${data.consultationCode ? `<div class="meta-item">
      <p class="label">Consulta</p>
      <p class="value"><span class="code">${data.consultationCode}</span></p>
    </div>` : ''}
    <div class="meta-item">
      <p class="label">Paciente</p>
      <p class="value">${data.patientName}</p>
      ${data.patientCedula ? `<p style="font-size:11px;color:#64748b;margin-top:2px">CI: ${data.patientCedula}</p>` : ''}
    </div>
    <div class="meta-item">
      <p class="label">Fecha de la consulta</p>
      <p class="value">${sched}</p>
    </div>
    <div class="meta-item">
      <p class="label">Fecha de pago</p>
      <p class="value">${paid}</p>
    </div>
    <div class="meta-item">
      <p class="label">Método de pago</p>
      <p class="value">${formatPaymentMethod(data.paymentMethod)}</p>
      ${data.paymentReference ? `<p style="font-size:11px;color:#64748b;margin-top:2px">Ref: ${data.paymentReference}</p>` : ''}
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Concepto</th>
        <th class="right">Monto</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>${data.planName || 'Consulta médica'}</td>
        <td class="right amount">${fmtUsd(data.amountUsd)}</td>
      </tr>
      ${(data.extraItems || []).map(it => `<tr>
        <td>${it.name}</td>
        <td class="right amount">${fmtUsd(it.amount)}</td>
      </tr>`).join('')}
      <tr class="total">
        <td>TOTAL${data.bcvRate ? ` <span class="totals-bs">(tasa BCV ${data.bcvRate.toFixed(2)} Bs/USD)</span>` : ''}</td>
        <td class="right amount">${fmtUsd(grandTotal)}${data.bcvRate ? `<br><span class="totals-bs">${fmtBs(grandTotal * data.bcvRate)}</span>` : ''}</td>
      </tr>
    </tbody>
  </table>

  <div class="signature-block">
    <div class="signature">
      ${data.signatureUrl ? `<img src="${data.signatureUrl}" alt="Firma" crossorigin="anonymous" />` : '<div style="height:50px"></div>'}
      <div class="signature-line">
        <p class="name">${data.doctorTitle || ''} ${data.doctorName}</p>
        ${data.doctorLicense ? `<p class="title">Mat. ${data.doctorLicense}</p>` : ''}
      </div>
    </div>
  </div>

  <div class="footer">
    <p>Este recibo es válido como comprobante de pago.</p>
    <p>${data.paymentCode} · Generado el ${new Date().toLocaleDateString('es-VE')}</p>
  </div>

  <script>window.onload = function() { window.print(); }</script>
</body>
</html>`
}
