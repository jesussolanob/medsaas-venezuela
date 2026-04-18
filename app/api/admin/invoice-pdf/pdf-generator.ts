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
  domicilio_fiscal: 'Av. Francisco de Miranda, Torre Delta, Piso 5, Of. 5-A, Urb. El Rosal, Caracas, Miranda, Zona Postal 1060',
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

  // Build a proper PDF with correct byte offsets
  const parts: string[] = []

  parts.push('%PDF-1.4')
  parts.push('')

  // We need to track byte offsets precisely
  const objects: { num: number; content: string }[] = []

  // Object 1: Catalog
  objects.push({ num: 1, content: '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj' })

  // Object 2: Pages
  objects.push({ num: 2, content: '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj' })

  // Object 3: Page
  objects.push({
    num: 3,
    content: '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>\nendobj'
  })

  // Object 4: Content stream
  const streamContent = content
  objects.push({
    num: 4,
    content: `4 0 obj\n<< /Length ${streamContent.length} >>\nstream\n${streamContent}\nendstream\nendobj`
  })

  // Object 5: Helvetica font
  objects.push({ num: 5, content: '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj' })

  // Object 6: Helvetica-Bold font
  objects.push({ num: 6, content: '6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj' })

  // Build the PDF body and track offsets
  let body = '%PDF-1.4\n'
  const offsets: number[] = []

  for (const obj of objects) {
    offsets[obj.num] = body.length
    body += obj.content + '\n'
  }

  // Cross-reference table
  const xrefOffset = body.length
  body += 'xref\n'
  body += `0 ${objects.length + 1}\n`
  body += '0000000000 65535 f \n'
  for (let i = 1; i <= objects.length; i++) {
    body += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`
  }

  // Trailer
  body += 'trailer\n'
  body += `<< /Size ${objects.length + 1} /Root 1 0 R >>\n`
  body += 'startxref\n'
  body += `${xrefOffset}\n`
  body += '%%EOF'

  return Buffer.from(body, 'latin1')
}

// ─── Build fiscal invoice content stream ────────────────────────────────────

function buildFiscalInvoice(invoice: InvoiceData, billing: BillingConfig): string {
  const L: string[] = []
  const doctor = invoice.profiles
  const issueDateObj = invoice.issued_at ? new Date(invoice.issued_at) : new Date(invoice.created_at)
  const issueDate = issueDateObj.toLocaleDateString('es-VE')
  const issueTime = issueDateObj.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })

  // Page dimensions: 595 x 842 (A4)
  const PW = 595
  const PH = 842
  const ML = 40  // margin left
  const MR = 555 // margin right

  // ─────────────────────────────────────────────────────
  // TOP ACCENT BAR (teal)
  // ─────────────────────────────────────────────────────
  fill(L, TEAL)
  rect(L, 0, 0, PW, 6)

  // ─────────────────────────────────────────────────────
  // HEADER: EMISOR section
  // ─────────────────────────────────────────────────────

  // Company brand — left
  text(L, 'Delta', ML + 10, 30, 22, true, TEAL_RGB)
  text(L, 'MEDICAL CRM', ML + 10, 50, 7, true, GRAY_RGB)

  // Separator line
  stroke(L, LGRAY_RGB)
  line(L, ML, 62, MR, 62)

  // Company details — left column
  text(L, esc(billing.razon_social), ML + 10, 78, 9, true, BLACK_RGB)
  text(L, `RIF: ${billing.rif}`, ML + 10, 92, 8, false, BLACK_RGB)

  const domLines = wordWrap(esc(billing.domicilio_fiscal), 60)
  let yPos = 106
  for (const dl of domLines) {
    text(L, dl, ML + 10, yPos, 7, false, GRAY_RGB)
    yPos += 10
  }
  text(L, `Tel: ${esc(billing.telefono)}`, ML + 10, yPos, 7, false, GRAY_RGB)

  // ─── FACTURA BOX — right side ─────────────────────
  const fbX = 340
  const fbY = 72
  const fbW = MR - fbX
  const fbH = 80

  // Box background
  fill(L, '0.96 0.96 0.96')
  rect(L, fbX, fbY, fbW, fbH)
  // Box border
  stroke(L, TEAL_RGB)
  lineW(L, 1)
  rectStroke(L, fbX, fbY, fbW, fbH)
  lineW(L, 0.5)

  // "FACTURA" title centered in box
  text(L, 'FACTURA', fbX + (fbW / 2) - 30, fbY + 16, 14, true, TEAL_RGB)

  // Invoice details
  const fx = fbX + 12
  let fy = fbY + 34
  text(L, `No. ${esc(invoice.invoice_number)}`, fx, fy, 8, true, BLACK_RGB); fy += 13
  text(L, `Fecha: ${issueDate}  ${issueTime}`, fx, fy, 7, false, BLACK_RGB); fy += 11
  text(L, `N Control: ${esc(billing.control_number)}`, fx, fy, 7, true, BLACK_RGB); fy += 11
  const tasaStr = billing.bcv_rate ? `Bs ${billing.bcv_rate.toFixed(4)}` : '---'
  text(L, `Tasa BCV: ${tasaStr}`, fx, fy, 7, false, GRAY_RGB)

  // ─────────────────────────────────────────────────────
  // DESTINATARIO section
  // ─────────────────────────────────────────────────────
  const destY = 170

  // Label
  fill(L, '0.94 0.97 0.96')
  rect(L, ML, destY, MR - ML, 20)
  text(L, 'DATOS DEL CLIENTE', ML + 10, destY + 14, 7, true, TEAL_RGB)

  // Client data
  const cy = destY + 32
  text(L, esc(doctor.full_name), ML + 10, cy, 10, true, BLACK_RGB)
  text(L, doctor.email, ML + 10, cy + 14, 8, false, GRAY_RGB)
  if (doctor.specialty) {
    text(L, `Especialidad: ${esc(doctor.specialty)}`, ML + 10, cy + 28, 8, false, GRAY_RGB)
  }

  // ─────────────────────────────────────────────────────
  // TABLE HEADER
  // ─────────────────────────────────────────────────────
  const tblY = 245

  // Teal header bar
  fill(L, TEAL)
  rect(L, ML, tblY, MR - ML, 22)

  // Column headers
  text(L, 'Cod.', ML + 8, tblY + 15, 8, true, WHITE_RGB)
  text(L, 'Descripcion', ML + 60, tblY + 15, 8, true, WHITE_RGB)
  text(L, 'Cant.', 340, tblY + 15, 8, true, WHITE_RGB)
  text(L, 'P. Unitario', 400, tblY + 15, 8, true, WHITE_RGB)
  text(L, 'Monto', 500, tblY + 15, 8, true, WHITE_RGB)

  // ─────────────────────────────────────────────────────
  // TABLE ROW
  // ─────────────────────────────────────────────────────
  const rowY = tblY + 28
  const description = invoice.description || 'Suscripcion Plan Professional - Delta Medical CRM'
  const amt = invoice.amount
  const bsAmt = billing.bcv_rate ? amt * billing.bcv_rate : null

  // Alternate row background
  fill(L, '0.98 0.98 0.98')
  rect(L, ML, rowY, MR - ML, 28)

  text(L, '001', ML + 12, rowY + 18, 8, false, BLACK_RGB)

  const descLines = wordWrap(esc(description), 50)
  descLines.forEach((dl, i) => {
    text(L, dl, ML + 60, rowY + 18 + i * 11, 8, false, BLACK_RGB)
  })

  text(L, '1,00', 348, rowY + 18, 8, false, BLACK_RGB)

  const priceStr = bsAmt !== null ? `Bs. ${fmtBs(bsAmt)}` : `$${amt.toFixed(2)}`
  const totalStr = priceStr
  text(L, priceStr, 400, rowY + 18, 8, false, BLACK_RGB)
  text(L, totalStr, 495, rowY + 18, 8, false, BLACK_RGB)

  // Table bottom line
  const afterRow = rowY + 28 + Math.max((descLines.length - 1) * 11, 0) + 8
  stroke(L, LGRAY_RGB)
  line(L, ML, afterRow, MR, afterRow)

  // ─────────────────────────────────────────────────────
  // TAX BREAKDOWN — right aligned box
  // ─────────────────────────────────────────────────────
  const taxBoxX = 300
  const taxBoxY = afterRow + 15
  const taxBoxW = MR - taxBoxX
  const taxBoxH = 145

  // Light background
  fill(L, '0.97 0.97 0.97')
  rect(L, taxBoxX, taxBoxY, taxBoxW, taxBoxH)
  stroke(L, LGRAY_RGB)
  rectStroke(L, taxBoxX, taxBoxY, taxBoxW, taxBoxH)

  const baseUSD = amt
  const bsBase = bsAmt ?? 0
  const ivaRate = billing.iva_percent / 100
  const igtfRate = billing.igtf_percent / 100
  const bsIVA = bsBase * ivaRate
  const bsSubtotal = bsBase + bsIVA
  const bsIGTF = bsBase * igtfRate
  const bsTotalPagar = bsSubtotal + bsIGTF

  let ty = taxBoxY + 18
  const txL = taxBoxX + 10
  const txR = MR - 12

  taxLine(L, 'Base Exenta:', 'Bs. 0,00', txL, txR, ty); ty += 16
  taxLine(L, 'Base Imponible:', `Bs. ${fmtBs(bsBase)}`, txL, txR, ty); ty += 16
  taxLine(L, `IVA ${billing.iva_percent.toFixed(0)}%:`, `Bs. ${fmtBs(bsIVA)}`, txL, txR, ty); ty += 16

  // Separator
  stroke(L, LGRAY_RGB)
  line(L, taxBoxX + 8, ty - 4, MR - 8, ty - 4)
  ty += 4

  taxLine(L, 'Subtotal:', `Bs. ${fmtBs(bsSubtotal)}`, txL, txR, ty, true); ty += 18
  taxLine(L, `IGTF ${billing.igtf_percent.toFixed(0)}%:`, `Bs. ${fmtBs(bsIGTF)}`, txL, txR, ty); ty += 20

  // TOTAL BAR — teal
  fill(L, TEAL)
  rect(L, taxBoxX, ty - 6, taxBoxW, 26)

  text(L, 'TOTAL A PAGAR:', taxBoxX + 10, ty + 12, 9, true, WHITE_RGB)
  text(L, `Bs. ${fmtBs(bsTotalPagar)}`, txR - 5, ty + 12, 9, true, WHITE_RGB)

  // USD equivalent below the box
  if (billing.bcv_rate) {
    const usdTotal = baseUSD * (1 + ivaRate + igtfRate)
    text(L, `Equivalente USD: $${usdTotal.toFixed(2)}`, taxBoxX + 10, ty + 36, 8, false, GRAY_RGB)
    text(L, `Tasa BCV: ${billing.bcv_rate.toFixed(4)} Bs/$`, taxBoxX + 10, ty + 48, 7, false, GRAY_RGB)
  }

  // ─────────────────────────────────────────────────────
  // PAYMENT INFO — left side
  // ─────────────────────────────────────────────────────
  const payY = afterRow + 20
  text(L, 'Condiciones:', ML + 10, payY, 7, true, BLACK_RGB)
  text(L, 'Pago inmediato', ML + 10, payY + 12, 7, false, GRAY_RGB)
  text(L, `Moneda: ${billing.bcv_rate ? 'Bs (ref. BCV)' : 'USD'}`, ML + 10, payY + 24, 7, false, GRAY_RGB)

  // ─────────────────────────────────────────────────────
  // FOOTER
  // ─────────────────────────────────────────────────────
  // Footer line
  stroke(L, LGRAY_RGB)
  line(L, ML, PH - 50, MR, PH - 50)

  text(L, 'Delta Medical CRM', ML + 10, PH - 38, 7, true, GRAY_RGB)
  text(L, 'Sistema para Medicos Especialistas | deltamedical.ve', ML + 10, PH - 26, 6, false, GRAY_RGB)

  // Page indicator
  text(L, 'Pagina 1 de 1', MR - 55, PH - 38, 6, false, GRAY_RGB)

  return L.join('\n')
}

// ─── Color constants ────────────────────────────────────────────────────────

const TEAL = '0.08 0.73 0.65'
const TEAL_RGB = '0.08 0.73 0.65'
const BLACK_RGB = '0 0 0'
const GRAY_RGB = '0.45 0.45 0.45'
const LGRAY_RGB = '0.82 0.82 0.82'
const WHITE_RGB = '1 1 1'

// ─── PDF Primitives ─────────────────────────────────────────────────────────

function text(L: string[], t: string, x: number, y: number, size: number, bold: boolean, color: string) {
  if (!t) return
  L.push('BT')
  L.push(`/F${bold ? '2' : '1'} ${size} Tf`)
  L.push(`${color} rg`)
  L.push(`${x} ${842 - y} Td`)
  L.push(`(${escPdf(t)}) Tj`)
  L.push('ET')
}

function fill(L: string[], color: string) {
  L.push(`${color} rg`)
}

function stroke(L: string[], color: string) {
  L.push(`${color} RG`)
}

function lineW(L: string[], w: number) {
  L.push(`${w} w`)
}

function rect(L: string[], x: number, y: number, w: number, h: number) {
  L.push(`${x} ${842 - y} ${w} ${-h} re f`)
}

function rectStroke(L: string[], x: number, y: number, w: number, h: number) {
  L.push(`${x} ${842 - y} ${w} ${-h} re S`)
}

function line(L: string[], x1: number, y1: number, x2: number, y2: number) {
  L.push(`${x1} ${842 - y1} m ${x2} ${842 - y2} l S`)
}

function taxLine(L: string[], label: string, value: string, xL: number, xR: number, y: number, bold = false) {
  text(L, label, xL, y, 8, bold, bold ? BLACK_RGB : '0.3 0.3 0.3')
  // Right-align value approximately
  text(L, value, xR - value.length * 4, y, 8, bold, BLACK_RGB)
}

// ─── Text utilities ─────────────────────────────────────────────────────────

function escPdf(t: string): string {
  if (!t) return ''
  return t
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[áàäâ]/g, 'a').replace(/[éèëê]/g, 'e').replace(/[íìïî]/g, 'i')
    .replace(/[óòöô]/g, 'o').replace(/[úùüû]/g, 'u').replace(/[ñ]/g, 'n')
    .replace(/[ÁÀÄÂ]/g, 'A').replace(/[ÉÈËÊ]/g, 'E').replace(/[ÍÌÏÎ]/g, 'I')
    .replace(/[ÓÒÖÔ]/g, 'O').replace(/[ÚÙÜÛ]/g, 'U').replace(/[Ñ]/g, 'N')
    .replace(/°/g, '').replace(/[^\x20-\x7E]/g, '')
    .slice(0, 255)
}

function esc(t: string): string { return escPdf(t) }

function wordWrap(t: string, maxChars: number): string[] {
  if (!t || t.length <= maxChars) return [t || '']
  const words = t.split(' ')
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
  return lines.length ? lines : [t.slice(0, maxChars)]
}

function fmtBs(n: number): string {
  // Venezuelan format: 1.234,56
  const parts = Math.abs(n).toFixed(2).split('.')
  const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${n < 0 ? '-' : ''}${intPart},${parts[1]}`
}
