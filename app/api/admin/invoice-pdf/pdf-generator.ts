/**
 * Pure Node.js PDF generation for invoices
 * Creates a professional PDF invoice without external dependencies
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

// Simple PDF primitives
class SimplePDF {
  private content: string[] = []
  private width: number = 595 // A4 width in points (8.27 inches)
  private height: number = 842 // A4 height in points (11.69 inches)
  private currentY: number = 40
  private currentX: number = 40
  private margin: number = 40
  private lineHeight: number = 15

  constructor() {
    this.initPdf()
  }

  private initPdf() {
    this.content.push('%PDF-1.4')
    this.content.push('1 0 obj')
    this.content.push('<< /Type /Catalog /Pages 2 0 R >>')
    this.content.push('endobj')
    this.content.push('2 0 obj')
    this.content.push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>')
    this.content.push('endobj')
  }

  text(str: string, x?: number, y?: number, options?: any) {
    if (x !== undefined) this.currentX = x
    if (y !== undefined) this.currentY = y

    const fontSize = options?.fontSize || 12
    const color = options?.color || '0 0 0' // RGB
    const bold = options?.bold || false

    // Simple text positioning
    const textStr = `BT /F${bold ? '2' : '1'} ${fontSize} Tf ${this.currentX} ${
      this.height - this.currentY
    } Td (${this.escapeString(str)}) Tj ET`
    this.content.push(textStr)

    if (!y) {
      this.currentY += this.lineHeight
    }

    return this
  }

  line(x1: number, y1: number, x2: number, y2: number, color?: string) {
    const lineColor = color || '0.8 0.8 0.8'
    const cmd = `${lineColor} RG\n${x1} ${this.height - y1} m\n${x2} ${
      this.height - y2
    } l\nS`
    this.content.push(cmd)
    return this
  }

  rect(x: number, y: number, width: number, height: number, color?: string, fill?: boolean) {
    const fillColor = color || '0.95 0.95 0.95'
    const operator = fill ? 'rg' : 'RG'
    const cmd = `${fillColor} ${operator}\n${x} ${this.height - y} ${width} ${-height} re\n${
      fill ? 'f' : 'S'
    }`
    this.content.push(cmd)
    return this
  }

  newLine(count: number = 1) {
    this.currentY += this.lineHeight * count
    return this
  }

  getBuffer(): Buffer {
    // Build PDF structure
    const pages = this.buildPdfStructure()
    const pdfContent = pages.join('\n')

    // Create byte array
    return Buffer.from(pdfContent, 'latin1')
  }

  private buildPdfStructure(): string[] {
    const result: string[] = []
    const objects: string[] = [''] // Index 0 unused

    // Catalog
    objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj')

    // Pages
    objects.push('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj')

    // Page
    const contentStr = this.content.join('\n')
    const contentObj = `4 0 obj\n<< /Length ${contentStr.length} >>\nstream\n${contentStr}\nendstream\nendobj`
    objects.push(contentObj)

    const pageObj = `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${this.width} ${this.height}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>\nendobj`
    objects.splice(3, 0, pageObj)

    // Font F1 (Helvetica)
    objects.push(
      '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj'
    )

    // Font F2 (Helvetica Bold)
    objects.push(
      '6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj'
    )

    // Build final PDF
    result.push('%PDF-1.4')

    let offset = 0
    const offsets: number[] = []

    objects.forEach((obj, idx) => {
      if (idx === 0) return
      offsets[idx] = offset
      offset += obj.length + 1
      result.push(obj)
    })

    // Xref
    const xrefOffset = offset
    result.push('xref')
    result.push(`0 ${objects.length}`)
    result.push('0000000000 65535 f ')
    offsets.forEach((off, idx) => {
      if (idx > 0) {
        result.push(`${String(off).padStart(10, '0')} 00000 n `)
      }
    })

    // Trailer
    result.push('trailer')
    result.push(`<< /Size ${objects.length} /Root 1 0 R >>`)
    result.push('startxref')
    result.push(String(xrefOffset))
    result.push('%%EOF')

    return result
  }

  private escapeString(str: string): string {
    return str
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)')
      .slice(0, 255)
  }
}

/**
 * Generate a complete invoice PDF from invoice data
 */
export async function generatePdfBuffer(invoice: InvoiceData): Promise<Buffer> {
  // Simple text-based PDF generation
  // This is a lightweight alternative to jsPDF

  const lines: string[] = []

  // PDF Header
  lines.push('%PDF-1.4')

  // Object 1: Catalog
  let offset = lines.join('\n').length + 1
  const obj1Offset = offset
  lines.push('1 0 obj')
  lines.push('<< /Type /Catalog /Pages 2 0 R >>')
  lines.push('endobj')

  // Object 2: Pages
  offset = lines.join('\n').length + 1
  const obj2Offset = offset
  lines.push('2 0 obj')
  lines.push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>')
  lines.push('endobj')

  // Build page content
  const content = buildInvoiceContent(invoice)
  const contentLength = content.length

  // Object 4: Content stream
  offset = lines.join('\n').length + 1
  const obj4Offset = offset
  lines.push('4 0 obj')
  lines.push(`<< /Length ${contentLength} >>`)
  lines.push('stream')
  lines.push(content)
  lines.push('endstream')
  lines.push('endobj')

  // Object 3: Page
  offset = lines.join('\n').length + 1
  const obj3Offset = offset
  lines.push('3 0 obj')
  lines.push(
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>'
  )
  lines.push('endobj')

  // Object 5: Font Helvetica
  offset = lines.join('\n').length + 1
  const obj5Offset = offset
  lines.push('5 0 obj')
  lines.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
  lines.push('endobj')

  // Object 6: Font Helvetica-Bold
  offset = lines.join('\n').length + 1
  const obj6Offset = offset
  lines.push('6 0 obj')
  lines.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>')
  lines.push('endobj')

  // Xref table
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

  // Trailer
  lines.push('trailer')
  lines.push('<< /Size 7 /Root 1 0 R >>')
  lines.push('startxref')
  lines.push(String(xrefOffset))
  lines.push('%%EOF')

  const pdfContent = lines.join('\n')
  return Buffer.from(pdfContent, 'latin1')
}

function buildInvoiceContent(invoice: InvoiceData): string {
  const lines: string[] = []
  const doctor = invoice.profiles
  const issueDate = invoice.issued_at
    ? new Date(invoice.issued_at).toLocaleDateString('es-VE')
    : new Date(invoice.created_at).toLocaleDateString('es-VE')

  // Colors
  const teal = '0.08 0.73 0.65' // teal-500 RGB equivalent
  const darkText = '0 0 0'
  const lightGray = '0.9 0.9 0.9'

  // Page setup
  lines.push('BT')
  lines.push('/F2 24 Tf')
  lines.push(teal + ' rg')
  lines.push('50 750 Td')
  lines.push('(DELTA MEDICAL CRM) Tj')
  lines.push('ET')

  // Invoice title
  lines.push('BT')
  lines.push('/F2 18 Tf')
  lines.push(darkText + ' rg')
  lines.push('50 700 Td')
  lines.push('(FACTURA) Tj')
  lines.push('ET')

  // Invoice number and date
  lines.push('BT')
  lines.push('/F1 10 Tf')
  lines.push(darkText + ' rg')
  lines.push('50 680 Td')
  lines.push('(Factura: ' + escapeForPdf(invoice.invoice_number) + ') Tj')
  lines.push('ET')

  lines.push('BT')
  lines.push('/F1 10 Tf')
  lines.push('50 665 Td')
  lines.push('(Fecha: ' + issueDate + ') Tj')
  lines.push('ET')

  // Status
  const statusText = getStatusLabel(invoice.status)
  lines.push('BT')
  lines.push('/F1 10 Tf')
  const statusColor = invoice.status === 'paid' ? '0 0.6 0' : '0.8 0 0'
  lines.push(statusColor + ' rg')
  lines.push('50 650 Td')
  lines.push('(Estado: ' + statusText + ') Tj')
  lines.push('ET')

  // Doctor info section
  lines.push('BT')
  lines.push('/F2 12 Tf')
  lines.push(darkText + ' rg')
  lines.push('50 610 Td')
  lines.push('(Informacion del Medico) Tj')
  lines.push('ET')

  // Horizontal line
  lines.push(lightGray + ' RG')
  lines.push('50 605 m')
  lines.push('545 605 l')
  lines.push('S')

  lines.push('BT')
  lines.push('/F1 10 Tf')
  lines.push(darkText + ' rg')
  lines.push('50 590 Td')
  lines.push('(Nombre: ' + escapeForPdf(doctor.full_name) + ') Tj')
  lines.push('ET')

  lines.push('BT')
  lines.push('/F1 10 Tf')
  lines.push('50 575 Td')
  lines.push('(Email: ' + escapeForPdf(doctor.email) + ') Tj')
  lines.push('ET')

  if (doctor.specialty) {
    lines.push('BT')
    lines.push('/F1 10 Tf')
    lines.push('50 560 Td')
    lines.push('(Especialidad: ' + escapeForPdf(doctor.specialty) + ') Tj')
    lines.push('ET')
  }

  // Company info
  lines.push('BT')
  lines.push('/F2 12 Tf')
  lines.push(darkText + ' rg')
  lines.push('50 520 Td')
  lines.push('(Delta Medical CRM) Tj')
  lines.push('ET')

  lines.push('BT')
  lines.push('/F1 10 Tf')
  lines.push('50 505 Td')
  lines.push('(Venezuela) Tj')
  lines.push('ET')

  // Invoice details section
  lines.push('BT')
  lines.push('/F2 12 Tf')
  lines.push(darkText + ' rg')
  lines.push('50 460 Td')
  lines.push('(Detalles de la Factura) Tj')
  lines.push('ET')

  // Line
  lines.push(lightGray + ' RG')
  lines.push('50 455 m')
  lines.push('545 455 l')
  lines.push('S')

  // Table headers
  lines.push('BT')
  lines.push('/F2 10 Tf')
  lines.push(teal + ' rg')
  lines.push('50 440 Td')
  lines.push('(Descripción) Tj')
  lines.push('ET')

  lines.push('BT')
  lines.push('/F2 10 Tf')
  lines.push('450 440 Td')
  lines.push('(Monto) Tj')
  lines.push('ET')

  // Content line
  lines.push(lightGray + ' RG')
  lines.push('50 435 m')
  lines.push('545 435 l')
  lines.push('S')

  // Description
  const description = invoice.description || 'Servicio de Suscripción Médica'
  lines.push('BT')
  lines.push('/F1 10 Tf')
  lines.push(darkText + ' rg')
  lines.push('50 420 Td')
  lines.push('(' + escapeForPdf(description) + ') Tj')
  lines.push('ET')

  // Amount
  const amount = formatCurrency(invoice.amount, invoice.currency)
  lines.push('BT')
  lines.push('/F1 10 Tf')
  lines.push('450 420 Td')
  lines.push('(' + amount + ') Tj')
  lines.push('ET')

  // Total line
  lines.push(lightGray + ' RG')
  lines.push('50 410 m')
  lines.push('545 410 l')
  lines.push('S')

  // Total
  lines.push('BT')
  lines.push('/F2 12 Tf')
  lines.push(darkText + ' rg')
  lines.push('50 390 Td')
  lines.push('(Total) Tj')
  lines.push('ET')

  lines.push('BT')
  lines.push('/F2 12 Tf')
  lines.push('450 390 Td')
  lines.push('(' + amount + ') Tj')
  lines.push('ET')

  // Payment instructions
  lines.push('BT')
  lines.push('/F2 11 Tf')
  lines.push(darkText + ' rg')
  lines.push('50 320 Td')
  lines.push('(Metodos de Pago) Tj')
  lines.push('ET')

  lines.push(lightGray + ' RG')
  lines.push('50 315 m')
  lines.push('545 315 l')
  lines.push('S')

  lines.push('BT')
  lines.push('/F1 9 Tf')
  lines.push('50 300 Td')
  lines.push('(Pago Movil) Tj')
  lines.push('ET')

  lines.push('BT')
  lines.push('/F1 9 Tf')
  lines.push('50 285 Td')
  lines.push('(Transferencia Bancaria) Tj')
  lines.push('ET')

  lines.push('BT')
  lines.push('/F1 9 Tf')
  lines.push('50 270 Td')
  lines.push('(Zelle) Tj')
  lines.push('ET')

  // Footer
  const footerY = 50
  lines.push(lightGray + ' RG')
  lines.push('50 60 m')
  lines.push('545 60 l')
  lines.push('S')

  lines.push('BT')
  lines.push('/F1 8 Tf')
  lines.push('0.5 0.5 0.5 rg')
  lines.push('50 ' + footerY + ' Td')
  lines.push('(Delta Medical CRM - Sistema Integral para Medicos) Tj')
  lines.push('ET')

  return lines.join('\n')
}

function escapeForPdf(text: string): string {
  if (!text) return ''
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .slice(0, 200)
}

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    issued: 'Emitida',
    sent: 'Enviada',
    paid: 'Pagada',
    overdue: 'Vencida',
    cancelled: 'Cancelada',
  }
  return labels[status] || status
}

function formatCurrency(amount: number, currency: string): string {
  const symbol = getCurrencySymbol(currency)
  return `${symbol}${amount.toFixed(2)}`
}

function getCurrencySymbol(currency: string): string {
  const symbols: Record<string, string> = {
    USD: '$',
    EUR: '€',
    VES: 'Bs.',
    VEF: 'Bs.',
  }
  return symbols[currency] || currency
}
