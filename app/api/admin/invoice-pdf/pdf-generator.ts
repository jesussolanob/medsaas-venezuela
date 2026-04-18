/**
 * Pure Node.js PDF generation for Venezuelan fiscal invoices
 * Format modeled after PagoDirecto / SENIAT fiscal invoices
 * Emisor: Delta Medical CRM  |  Destinatario: Doctor/Clínica
 */

interface InvoiceData {
  id: string
  invoice_number: string
  amount: number
  currency: string
  description: string | null
  status: string
  issued_at: string | null
  sent_at: string | null
  paid_at: string | null
  created_at: string
  doctor_id: string
  profiles: {
    id: string
    full_name: string
    email: string
    specialty: string | null
  }
}

interface BillingConfig {
  razon_social: string
  rif: string
  domicilio_fiscal: string
  telefono: string
  codigo_actividad: string
  iva_percent: number
  igtf_percent: number
  control_number: string
  bcv_rate: number | null
}

const DEFAULT_BILLING: BillingConfig = {
  razon_social: 'Delta Medical CRM, C.A.',
  rif: 'J-50000000-0',
  domicilio_fiscal: 'Av. Francisco de Miranda, Torre Delta, Piso 5, Of. 5-A, Urb. El Rosal, Caracas (Chacao), Miranda, Zona Postal 1060',
  telefono: '+58 212 000 0000',
  codigo_actividad: '6201',
  iva_percent: 16,
  igtf_percent: 3,
  control_number: '00-00000001',
  bcv_rate: null,
}

export async function generatePdfBuffer(
  invoice: InvoiceData,
  billingConfig?: Partial<BillingConfig>
): Promise<Buffer> {
  const billing = { ...DEFAULT_BILLING, ...billingConfig }
  const content = buildFiscalInvoice(invoice, billing)
  const contentLength = content.length

  const lines: string[] = []
  lines.push('%PDF-1.4')

  const obj1Offset = lines.join('\n').length + 1
  lines.push('1 0 obj')
  lines.push('<< /Type /Catalog /Pages 2 0 R >>')
  lines.push('endobj')

  const obj2Offset = lines.join('\n').length + 1
  lines.push('2 0 obj')
  lines.push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>')
  lines.push('endobj')

  const obj4Offset = lines.join('\n').length + 1
  lines.push('4 0 obj')
  lines.push(`<< /Length ${contentLength} >>`)
  lines.push('stream')
  lines.push(content)
  lines.push('endstream')
  lines.push('endobj')

  const obj3Offset = lines.join('\n').length + 1
  lines.push('3 0 obj')
  lines.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>')
  lines.push('endobj')

  const obj5Offset = lines.join('\n').length + 1
  lines.push('5 0 obj')
  lines.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
  lines.push('endobj')

  const obj6Offset = lines.join('\n').length + 1
  lines.push('6 0 obj')
  lines.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>')
  lines.push('endobj')

  const xrefOffset = lines.join('\n').length + 1
  lines.push('xref')
  lines.push('0 7')
  lines.push('0000000000 65535 f ')
  lines.push(`${String(obj1Offset).padStart(10, '0')} 00000 n `)
  lines.push(`${String(obj2Offset).padStart(10, '0')} 00000 n `)
  lines.push(`${String(obj3Offset).padStart(10, '0')} 00000 n `)
  lines.push(`${String(obj4Offset).padStart(10, '0')} 00000 n `)
  lines.push(`${String(obj5Offset).padStart(10, '0')} 00000 n `)
  lines.push(`${String(obj6Offset).padStart(10, '0')} 00000 n `)

  lines.push('trailer')
  lines.push('<< /Size 7 /Root 1 0 R >>')
  lines.push('startxref')
  lines.push(String(xrefOffset))
  lines.push('%%EOF')

  return Buffer.from(lines.join('\n'), 'latin1')
}

// ─── Build fiscal invoice content stream ────────────────────────────────────

function buildFiscalInvoice(invoice: InvoiceData, billing: BillingConfig): string {
  const L: string[] = []
  const doctor = invoice.profiles
  const issueDateObj = invoice.issued_at ? new Date(invoice.issued_at) : new Date(invoice.created_at)
  const issueDate = issueDateObj.toLocaleDateString('es-VE')
  const issueTime = issueDateObj.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  // Colors
  const TEAL = '0.08 0.73 0.65'
  const BLACK = '0 0 0'
  const GRAY = '0.5 0.5 0.5'
  const LGRAY = '0.85 0.85 0.85'
  const WHITE = '1 1 1'

  // ─────────────────────────────────────────────────────
  // TOP ACCENT LINE (teal)
  // ─────────────────────────────────────────────────────
  L.push(`${TEAL} rg`)
  L.push('0 842 595 -5 re f')

  // ─────────────────────────────────────────────────────
  // EMISOR — Left: logo/name  |  Right: company details
  // ─────────────────────────────────────────────────────
  txt(L, 'Delta', 50, 48, 26, true, TEAL)
  txt(L, 'MEDICAL CRM', 50, 66, 8, true, GRAY)

  // Right side — company data
  txt(L, esc(billing.razon_social), 350, 48, 9, true, BLACK)
  txt(L, billing.rif, 350, 60, 9, false, BLACK)
  const domLines = wordWrap(billing.domicilio_fiscal, 48)
  let dy = 72
  for (const dl of domLines) {
    txt(L, esc(dl), 350, dy, 7, false, GRAY)
    dy += 9
  }
  txt(L, `Codigo de Actividad: ${billing.codigo_actividad}`, 350, dy, 7, false, GRAY)

  // ─────────────────────────────────────────────────────
  // DESTINATARIO — Client (Doctor / Clínica)
  // ─────────────────────────────────────────────────────
  const clientY = 105
  txt(L, `Razon Social: ${esc(doctor.full_name)}`, 50, clientY, 9, true, BLACK)
  txt(L, `Email: ${esc(doctor.email)}`, 50, clientY + 13, 8, false, BLACK)
  if (doctor.specialty) {
    txt(L, `Especialidad: ${esc(doctor.specialty)}`, 50, clientY + 25, 8, false, BLACK)
  }
  txt(L, `Telefono: ---`, 50, clientY + 37, 8, false, GRAY)

  // ─────────────────────────────────────────────────────
  // FACTURA BOX — Right side details
  // ─────────────────────────────────────────────────────
  const boxX = 330; const boxY = 97; const boxW = 225; const boxH = 95

  // Box border
  L.push(`${LGRAY} RG`)
  L.push('0.5 w')
  L.push(`${boxX} ${842 - boxY} ${boxW} ${-boxH} re S`)

  // "Factura" title
  txt(L, 'Factura', boxX + 70, boxY + 6, 16, true, BLACK)

  // Details inside box
  const bx = boxX + 10; let by = boxY + 28
  txt(L, `N de Documento: ${esc(invoice.invoice_number)}`, bx, by, 8, false, BLACK); by += 12
  txt(L, `Fecha de Emision: ${issueDate}`, bx, by, 8, false, BLACK); by += 12
  txt(L, `Hora de Emision: ${issueTime}`, bx, by, 8, false, BLACK); by += 12
  txt(L, `N DE CONTROL ${billing.control_number}`, bx, by, 8, true, BLACK); by += 12

  // Tasa / Moneda
  const tasaStr = billing.bcv_rate ? billing.bcv_rate.toFixed(4) : '---'
  txt(L, `Condiciones de pago: Pago inmediato`, bx, by, 7, false, GRAY); by += 10
  txt(L, `Tasa de cambio: ${tasaStr}    Moneda: Bs`, bx, by, 7, false, GRAY)

  // ─────────────────────────────────────────────────────
  // TABLE HEADER (teal bar)
  // ─────────────────────────────────────────────────────
  const tblY = 215
  L.push(`${TEAL} rg`)
  L.push(`40 ${842 - tblY} 515 -18 re f`)

  txt(L, 'Codigo', 50, tblY + 4, 8, true, WHITE)
  txt(L, 'Descripcion', 120, tblY + 4, 8, true, WHITE)
  txt(L, 'Cantidad', 345, tblY + 4, 8, true, WHITE)
  txt(L, 'Precio Unitario', 410, tblY + 4, 8, true, WHITE)
  txt(L, 'Monto', 510, tblY + 4, 8, true, WHITE)

  // ─────────────────────────────────────────────────────
  // TABLE ROW — Line item
  // ─────────────────────────────────────────────────────
  const rowY = tblY + 24
  const description = invoice.description || 'Suscripcion Plan - Delta Medical CRM'
  const amt = invoice.amount
  const bsAmt = billing.bcv_rate ? amt * billing.bcv_rate : null

  txt(L, '000001', 50, rowY, 8, false, BLACK)
  // Wrap description if long
  const descLines = wordWrap(esc(description), 45)
  descLines.forEach((line, i) => {
    txt(L, line, 120, rowY + i * 11, 8, false, BLACK)
  })
  txt(L, '1,00', 360, rowY, 8, false, BLACK)

  if (bsAmt !== null) {
    txt(L, `Bs ${fmtBs(bsAmt)}`, 405, rowY, 8, false, BLACK)
    txt(L, `Bs ${fmtBs(bsAmt)}`, 500, rowY, 8, false, BLACK)
  } else {
    txt(L, `$${amt.toFixed(2)}`, 420, rowY, 8, false, BLACK)
    txt(L, `$${amt.toFixed(2)}`, 510, rowY, 8, false, BLACK)
  }

  // Bottom table line
  const afterRow = rowY + Math.max(descLines.length * 11, 14) + 4
  L.push(`${LGRAY} RG`)
  L.push(`40 ${842 - afterRow} m 555 ${842 - afterRow} l S`)

  // ─────────────────────────────────────────────────────
  // TAX BREAKDOWN BOX — right side
  // ─────────────────────────────────────────────────────
  const taxY = afterRow + 25

  // Tax box background
  L.push('0.97 0.97 0.97 rg')
  L.push(`310 ${842 - taxY + 8} 245 -155 re f`)
  L.push(`${LGRAY} RG`)
  L.push('0.5 w')
  L.push(`310 ${842 - taxY + 8} 245 -155 re S`)

  // Column header
  txt(L, 'Bs', 520, taxY - 5, 7, true, GRAY)

  const baseUSD = amt
  const bsBase = bsAmt ?? 0
  const ivaRate = billing.iva_percent / 100
  const igtfRate = billing.igtf_percent / 100

  const bsIVA = bsBase * ivaRate
  const bsTotalVentas = bsBase + bsIVA
  const bsIGTF = bsBase * igtfRate
  const bsTotalPagar = bsTotalVentas + bsIGTF

  let ty = taxY + 10
  taxRow(L, 'Base Exenta:', '0,00', 320, ty); ty += 13
  taxRow(L, 'Base Imponible:', fmtBs(bsBase), 320, ty); ty += 13
  taxRow(L, `IVA ${billing.iva_percent.toFixed(2)}% Sobre Base Imponible:`, fmtBs(bsIVA), 320, ty); ty += 13

  // Line
  L.push(`${LGRAY} RG`)
  L.push(`315 ${842 - ty + 3} m 550 ${842 - ty + 3} l S`)
  ty += 4
  taxRow(L, 'Total Ventas:', fmtBs(bsTotalVentas), 320, ty, true); ty += 16
  taxRow(L, `IGTF ${billing.igtf_percent.toFixed(2)}% (pago en divisas):`, fmtBs(bsIGTF), 320, ty); ty += 16

  // TOTAL bar
  L.push(`${TEAL} rg`)
  L.push(`310 ${842 - ty + 5} 245 -22 re f`)

  txt(L, 'Total a Pagar:', 320, ty, 10, true, WHITE)
  txt(L, fmtBs(bsTotalPagar), 490, ty, 10, true, WHITE)

  ty += 28
  // USD equivalent
  if (billing.bcv_rate) {
    const usdTotal = baseUSD * (1 + ivaRate + igtfRate)
    txt(L, `Equivalente USD: $${usdTotal.toFixed(2)}`, 320, ty, 7, false, GRAY)
  }

  // ─────────────────────────────────────────────────────
  // FOOTER
  // ─────────────────────────────────────────────────────
  L.push(`${LGRAY} RG`)
  L.push(`40 52 m 555 52 l S`)

  txt(L, 'Delta Medical CRM - Sistema para Medicos Especialistas | deltamedical.ve', 50, 796, 7, false, GRAY)

  return L.join('\n')
}

// ─── Primitives ──────────────────────────────────────────────────────────────

function txt(L: string[], text: string, x: number, y: number, size: number, bold: boolean, color: string) {
  L.push('BT')
  L.push(`/F${bold ? '2' : '1'} ${size} Tf`)
  L.push(`${color} rg`)
  L.push(`${x} ${842 - y} Td`)
  L.push(`(${escPdf(text)}) Tj`)
  L.push('ET')
}

function taxRow(L: string[], label: string, value: string, x: number, y: number, bold = false) {
  txt(L, label, x, y, 8, bold, bold ? '0 0 0' : '0.3 0.3 0.3')
  txt(L, value, 490, y, 8, bold, '0 0 0')
}

function escPdf(text: string): string {
  if (!text) return ''
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[áàä]/g, 'a').replace(/[éèë]/g, 'e').replace(/[íìï]/g, 'i')
    .replace(/[óòö]/g, 'o').replace(/[úùü]/g, 'u').replace(/[ñ]/g, 'n')
    .replace(/[ÁÀÄÂ]/g, 'A').replace(/[ÉÈËÊ]/g, 'E').replace(/[ÍÌÏÎ]/g, 'I')
    .replace(/[ÓÒÖÔ]/g, 'O').replace(/[ÚÙÜÛ]/g, 'U').replace(/[Ñ]/g, 'N')
    .replace(/°/g, '').replace(/[^\x20-\x7E]/g, '')
    .slice(0, 255)
}

function esc(t: string): string { return escPdf(t) }

function wordWrap(text: string, maxChars: number): string[] {
  if (!text || text.length <= maxChars) return [text || '']
  const words = text.split(' ')
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    if ((current + ' ' + word).trim().length > maxChars) {
      if (current) lines.push(current.trim())
      current = word
    } else {
      current = current ? current + ' ' + word : word
    }
  }
  if (current) lines.push(current.trim())
  return lines.length ? lines : [text.slice(0, maxChars)]
}

function fmtBs(n: number): string {
  // Venezuelan format: 1.234,56
  const parts = n.toFixed(2).split('.')
  const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${intPart},${parts[1]}`
}
