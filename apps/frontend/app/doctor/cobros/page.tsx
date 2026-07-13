'use client';

// ETAPA 1: Supabase eliminado de este módulo.
// Migrado al backend:
//   - openAddItemModal → getServicesForModal() (GET /api/doctor/services)
//   - generateReceipt (profile) → getDoctorProfileForReceipt() (GET /api/doctor/profile)
//   - exportExcel → getPaymentsForExport() (GET /api/finances/payments)
//   - handleReceiptUpload → storage via /api/storage/upload + PATCH /api/finances/payments/:id/receipt
//   - Realtime refresh → removed (no WS in Etapa 1). fetchPayments() called after mutations.
import { useState, useEffect, useCallback } from 'react';
import { useBcvRate } from '@/lib/useBcvRate';
import { formatUsd, formatBs } from '@/lib/finances';
import { reportError } from '@/lib/report-error';
import { showToast } from '@/components/ui/Toaster';
import {
  getPayments,
  updatePaymentStatus as updatePaymentStatusAction,
  getPaymentItems,
  addPaymentItem,
  removePaymentItem,
} from '@/app/doctor/finances/payments-actions';
import { formatPaymentMethod } from '@/lib/payment-methods';
import { buildReceiptHtml } from '@/lib/receipt-pdf';
import { waLink } from '@/lib/phone-utils';
import { getDoctorProfile } from '@/app/doctor/actions';
import {
  getServicesForModal,
  getDoctorProfileForReceipt,
  getPaymentsForExport,
  saveReceiptUrl,
  updatePaymentDetails,
  getBcvRateForDate,
  getReceiptTemplateConfig,
} from './actions';
import {
  Receipt,
  Search,
  Download,
  DollarSign,
  CheckCircle,
  Clock,
  XCircle,
  Calendar,
  ArrowRight,
  Loader2,
  Filter,
  Banknote,
  X,
  CreditCard,
  FileText,
  ExternalLink,
  Upload,
  Plus,
  MessageSquare,
  Save,
} from 'lucide-react';

// TAREA 5: tercer tab "Todas"
type CobrosTab = 'pending' | 'approved' | 'all';

type Payment = {
  id: string;
  patient_name: string;
  plan_name: string | null;
  plan_price: number | null;
  payment_method: string | null;
  status: string;
  scheduled_at: string;
  appointment_code?: string;
  payment_receipt_url?: string | null;
  /** Texto plano desde el backend (7.10). NUNCA loguear. Puede ser null. */
  patient_phone?: string | null;
  _source?: 'appointment' | 'consultation';
};

// Opciones estándar de método de pago para el select de edición
const PAYMENT_METHOD_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'pago_movil', label: 'Pago Móvil' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'zelle', label: 'Zelle' },
  { value: 'binance', label: 'Binance' },
  { value: 'cash_usd', label: 'Efectivo USD' },
  { value: 'cash_bs', label: 'Efectivo Bs' },
  { value: 'pos', label: 'POS' },
];

export default function CobrosPage() {
  const [tab, setTab] = useState<CobrosTab>('pending');
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const { rate: bcvRate, mode: bcvMode, loading: bcvLoading } = useBcvRate();

  // Date range for export
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split('T')[0];
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0]);
  const [showExport, setShowExport] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  // Toast de feedback (ronda 16)
  const [actionToast, setActionToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(
    null,
  );
  // RONDA 35: items extra ahora persistidos en payment_items (BD).
  const [extraItems, setExtraItems] = useState<Array<{ id: string; name: string; amount: number }>>(
    [],
  );
  const [loadingExtras, setLoadingExtras] = useState(false);
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [availableItems, setAvailableItems] = useState<
    Array<{ id: string; name: string; price_usd: number; type: 'plan' | 'service' }>
  >([]);
  const [addingItem, setAddingItem] = useState(false);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);

  // 7.10: métodos de pago del doctor para el mensaje de WhatsApp
  const [doctorPaymentMethods, setDoctorPaymentMethods] = useState<string[]>([]);
  const [doctorPaymentDetails, setDoctorPaymentDetails] = useState<
    Record<string, Record<string, string>>
  >({});
  const [sendingWa, setSendingWa] = useState(false);

  // TAREA 2: estado de edición de detalles del pago
  const [editPaidAt, setEditPaidAt] = useState('');
  const [editMethod, setEditMethod] = useState('');
  const [editReference, setEditReference] = useState('');
  const [editBcvRate, setEditBcvRate] = useState<string>('');
  const [editAmountBs, setEditAmountBs] = useState<string>('');
  const [savingDetails, setSavingDetails] = useState(false);
  const [loadingBcvForDate, setLoadingBcvForDate] = useState(false);
  const [bcvDateWarning, setBcvDateWarning] = useState<string | null>(null);

  async function handleReceiptUpload(file: File) {
    if (!selectedPayment) return;
    setUploadingReceipt(true);
    try {
      // 1. Upload file to MinIO via BFF storage proxy.
      const fd = new FormData();
      fd.append('file', file);
      fd.append('kind', 'receipt');
      const uploadRes = await fetch('/api/storage/upload', { method: 'POST', body: fd });
      const uploadJson = await uploadRes.json();
      if (!uploadRes.ok || !uploadJson?.data?.url) {
        throw new Error(uploadJson?.error?.message ?? 'Error al subir comprobante');
      }
      const publicUrl: string = uploadJson.data.url;

      // 2. Persist the URL to the backend via PATCH /api/finances/payments/:id/receipt.
      const saved = await saveReceiptUrl(selectedPayment.id, publicUrl);
      if (!saved.ok) {
        throw new Error(saved.error ?? 'Error al guardar comprobante en el servidor');
      }

      // 3. Update local state so the UI reflects the change immediately.
      setSelectedPayment((prev) => (prev ? { ...prev, payment_receipt_url: publicUrl } : null));
      setPayments((prev) =>
        prev.map((p) =>
          p.id === selectedPayment.id ? { ...p, payment_receipt_url: publicUrl } : p,
        ),
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      reportError('doctor/cobros', 'handleReceiptUpload', err);
      showToast({ type: 'error', message: 'Error al subir el comprobante. ' + msg });
    } finally {
      setUploadingReceipt(false);
    }
  }

  // FUENTE UNICA (ronda 15): leer de tabla `payments` via helper compartido.
  const fetchPayments = useCallback(async () => {
    setLoading(true);

    // TAREA 5: pasar 'all' cuando el tab es 'all'
    const rows = await getPayments({ status: tab });

    setPayments(
      rows.map((p) => ({
        id: p.id,
        patient_name: p.appointment?.patient_name || 'Paciente',
        plan_name: p.appointment?.plan_name || null,
        plan_price: p.amount_usd,
        payment_method: p.method_snapshot || null,
        status: p.status,
        scheduled_at: p.appointment?.scheduled_at || p.created_at,
        appointment_code:
          p.consultation?.consultation_code ||
          p.appointment?.appointment_code ||
          p.payment_code ||
          '',
        payment_receipt_url: p.appointment?.payment_receipt_url || null,
        patient_phone: p.appointment?.patient_phone ?? null,
        _source: 'appointment' as const,
      })),
    );
    setLoading(false);
  }, [tab]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  // 7.10: cargar datos de pago del doctor una sola vez al montar
  useEffect(() => {
    let cancelled = false;
    getDoctorProfile().then((prof) => {
      if (cancelled || !prof) return;
      setDoctorPaymentMethods((prof.paymentMethods as string[] | null) ?? []);
      setDoctorPaymentDetails(
        (prof.paymentDetails as Record<string, Record<string, string>> | null) ?? {},
      );
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // TAREA 2: inicializar campos de edición cuando se selecciona un pago.
  // Resetear múltiples campos de formulario al cambiar selectedPayment es
  // un patrón establecido; el aviso set-state-in-effect no aplica aquí
  // porque no hay otra fuente de verdad externa que se sincronice.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!selectedPayment) {
      setEditPaidAt('');
      setEditMethod('');
      setEditReference('');
      setEditBcvRate('');
      setEditAmountBs('');
      setBcvDateWarning(null);
      return;
    }
    // Pre-poblar con datos existentes del pago
    const today = new Date().toISOString().split('T')[0];
    setEditPaidAt(today);
    setEditMethod(selectedPayment.payment_method ?? '');
    setEditReference('');
    setEditBcvRate(bcvRate ? bcvRate.toFixed(2) : '');
    setEditAmountBs(
      bcvRate && selectedPayment.plan_price
        ? (selectedPayment.plan_price * bcvRate).toFixed(2)
        : '',
    );
    setBcvDateWarning(null);
    // Solo re-ejecutar cuando cambia el payment seleccionado (id), no con bcvRate
    // para evitar resetear el formulario mientras el usuario edita.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPayment?.id]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const filtered = payments.filter((p) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      p.patient_name?.toLowerCase().includes(q) ||
      p.plan_name?.toLowerCase().includes(q) ||
      p.appointment_code?.toLowerCase().includes(q)
    );
  });

  const totalUSD = filtered.reduce((sum, p) => sum + (p.plan_price || 0), 0);
  const totalBs = bcvRate ? totalUSD * bcvRate : null;

  // Export to CSV/Excel — ETAPA 1: migrado al backend (GET /api/finances/payments).
  async function exportExcel() {
    const data = await getPaymentsForExport(dateFrom, dateTo);

    if (!data || data.length === 0) {
      showToast({ type: 'info', message: 'No hay datos en ese rango de fechas' });
      return;
    }

    const headers = [
      'Fecha',
      'Paciente',
      'Servicio',
      'Monto USD',
      'Monto Bs',
      'Método de Pago',
      'Estado',
      'Código',
    ];
    const rows = data.map((r) => [
      r.scheduled_at ? new Date(r.scheduled_at).toLocaleDateString('es-VE') : '',
      r.patient_name || '',
      r.plan_name || '',
      r.amount_usd.toFixed(2),
      bcvRate ? (r.amount_usd * bcvRate).toFixed(2) : 'N/A',
      formatPaymentMethod(r.payment_method),
      r.status || '',
      r.consultation_code || r.appointment_code || '',
    ]);

    const csv = [headers, ...rows].map((row) => row.map((c) => `"${c}"`).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cobros_${dateFrom}_${dateTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setShowExport(false);
  }

  // TAREA 3: openAddItemModal — verifica que el modal se abra correctamente
  // getServicesForModal() llama GET /api/doctor/services y filtra is_active=true
  async function openAddItemModal() {
    if (!selectedPayment) return;
    const items = await getServicesForModal();
    setAvailableItems(items);
    setShowAddItemModal(true);
  }

  // RONDA 35: persistir el item extra en payment_items + actualizar total
  async function addExtraItem(item: {
    id: string;
    name: string;
    price_usd: number;
    type: 'plan' | 'service';
  }) {
    if (!selectedPayment) return;
    setAddingItem(true);
    try {
      const result = await addPaymentItem(selectedPayment.id, {
        name: item.name,
        amountUsd: item.price_usd,
        sourceType: item.type,
        sourceId: item.id,
      });
      if (!result.success) throw new Error(result.error);

      const newTotal = (selectedPayment.plan_price || 0) + item.price_usd;
      if (result.item) {
        setExtraItems((prev) => [
          ...prev,
          {
            id: result.item!.id,
            name: result.item!.name,
            amount: Number(result.item!.amount_usd),
          },
        ]);
      }
      setSelectedPayment((prev) => (prev ? { ...prev, plan_price: newTotal } : prev));

      setActionToast({ type: 'success', msg: `${item.name} agregado al cobro` });
      setTimeout(() => setActionToast(null), 2500);
      setShowAddItemModal(false);
      await fetchPayments();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al agregar item';
      setActionToast({ type: 'error', msg });
      setTimeout(() => setActionToast(null), 3000);
    } finally {
      setAddingItem(false);
    }
  }

  // RONDA 35: borrar un item extra de BD y restar del total
  async function removeExtraItem(itemId: string, amount: number) {
    if (!selectedPayment) return;
    if (!confirm('¿Eliminar este cargo del cobro?')) return;
    try {
      const result = await removePaymentItem(selectedPayment.id, itemId);
      if (!result.success) throw new Error(result.error);

      const newTotal = Math.max(0, (selectedPayment.plan_price || 0) - amount);
      setExtraItems((prev) => prev.filter((i) => i.id !== itemId));
      setSelectedPayment((prev) => (prev ? { ...prev, plan_price: newTotal } : prev));
      setActionToast({ type: 'success', msg: 'Cargo eliminado' });
      setTimeout(() => setActionToast(null), 2000);
      await fetchPayments();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al eliminar';
      setActionToast({ type: 'error', msg });
      setTimeout(() => setActionToast(null), 3000);
    }
  }

  // RONDA 35: cargar extras de BD cuando se abre un payment
  async function loadExtraItems(paymentId: string) {
    setLoadingExtras(true);
    try {
      const data = await getPaymentItems(paymentId);
      setExtraItems(data.map((d) => ({ id: d.id, name: d.name, amount: Number(d.amount_usd) })));
    } catch (err) {
      reportError('doctor/cobros', 'loadExtraItems', err);
      setExtraItems([]);
    } finally {
      setLoadingExtras(false);
    }
  }

  // TAREA 2: cuando cambia la fecha de pago, consultar tasa BCV de ese día.
  // Solo se busca la tasa histórica cuando el modo del doctor es 'usd_bcv'.
  // Para 'eur_bcv' y 'custom' se mantiene la tasa ya configurada del doctor
  // (bcvRate) para no pisar con la tasa BCV USD que puede ser diferente.
  async function handlePaidAtChange(newDate: string) {
    setEditPaidAt(newDate);
    if (!newDate) return;

    // Para modos distintos a usd_bcv no hay tasa histórica relevante:
    // eur_bcv → la tasa EUR no está disponible histórica; custom → es fija.
    // En ambos casos conservamos la tasa del doctor sin modificarla.
    if (bcvMode !== 'usd_bcv') {
      setBcvDateWarning(null);
      return;
    }

    setLoadingBcvForDate(true);
    setBcvDateWarning(null);
    try {
      const result = await getBcvRateForDate(newDate);
      if (!result || result.rate === null) {
        setBcvDateWarning('Tasa BCV USD no disponible para esa fecha, ingrésala manualmente');
        setEditBcvRate('');
        setEditAmountBs('');
      } else {
        setBcvDateWarning(null);
        const rateStr = result.rate.toFixed(2);
        setEditBcvRate(rateStr);
        const amountUsd = selectedPayment?.plan_price ?? 0;
        setEditAmountBs((amountUsd * result.rate).toFixed(2));
      }
    } catch {
      setBcvDateWarning('No se pudo obtener la tasa, ingrésala manualmente');
      setEditBcvRate('');
      setEditAmountBs('');
    } finally {
      setLoadingBcvForDate(false);
    }
  }

  // TAREA 2: recalcular amount_bs cuando el usuario edita la tasa
  function handleBcvRateChange(val: string) {
    setEditBcvRate(val);
    const rate = parseFloat(val);
    if (!isNaN(rate) && rate > 0 && selectedPayment?.plan_price) {
      setEditAmountBs((selectedPayment.plan_price * rate).toFixed(2));
    } else {
      setEditAmountBs('');
    }
  }

  // TAREA 2: guardar detalles del pago
  async function handleSaveDetails() {
    if (!selectedPayment) return;
    setSavingDetails(true);
    try {
      const bcvRateNum = editBcvRate ? parseFloat(editBcvRate) : null;
      const amountBsNum = editAmountBs ? parseFloat(editAmountBs) : null;

      const result = await updatePaymentDetails(selectedPayment.id, {
        paid_at: editPaidAt || null,
        method: editMethod || null,
        reference: editReference || null,
        bcv_rate: isNaN(bcvRateNum ?? NaN) ? null : bcvRateNum,
        amount_bs: isNaN(amountBsNum ?? NaN) ? null : amountBsNum,
      });

      if (!result.ok) throw new Error(result.error);

      // Actualizar estado local del pago (método visible en la lista)
      if (editMethod) {
        setSelectedPayment((prev) => (prev ? { ...prev, payment_method: editMethod } : prev));
        setPayments((prev) =>
          prev.map((p) => (p.id === selectedPayment.id ? { ...p, payment_method: editMethod } : p)),
        );
      }

      showToast({ type: 'success', message: 'Detalles guardados correctamente' });
      await fetchPayments();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al guardar detalles';
      showToast({ type: 'error', message: msg });
    } finally {
      setSavingDetails(false);
    }
  }

  // RONDA 34: generar recibo PDF con branding del perfil.
  // TAREA 4: fallback a blob URL si window.open() está bloqueado.
  // Branded: aplica la config de plantilla del doctor (color, header, footer,
  // show_logo, show_signature) igual que los documentos de consulta.
  // Orden de prioridad para la config del recibo:
  //   1. Config guardada en localStorage (tipo 'recibo' desde /doctor/templates)
  //   2. Config del servidor para 'informe' (fallback) via getReceiptTemplateConfig()
  async function generateReceipt() {
    if (!selectedPayment) return;

    // 1. Leer config de 'recibo' desde localStorage (guardada en /doctor/templates)
    type LocalReciboCfg = {
      primary_color?: string;
      header_text?: string;
      footer_text?: string;
      show_logo?: boolean;
      show_signature?: boolean;
    };
    let localReciboCfg: LocalReciboCfg | null = null;
    try {
      const raw = localStorage.getItem('delta_recibo_template_config');
      if (raw) localReciboCfg = JSON.parse(raw) as LocalReciboCfg;
    } catch {
      // localStorage no disponible — continuar con fallback del servidor
    }

    const [prof, rawItems] = await Promise.all([
      getDoctorProfileForReceipt(),
      getPaymentItems(selectedPayment.id),
    ]);

    // Obtener config de plantilla del servidor (fallback a 'informe' si no hay 'recibo')
    const rawServerCfg = await getReceiptTemplateConfig();
    const serverColor: string = rawServerCfg.primary_color;
    const serverHeaderText: string = rawServerCfg.header_text;
    const serverFooterText: string = rawServerCfg.footer_text;
    const serverShowLogo: boolean = rawServerCfg.show_logo;
    const serverShowSignature: boolean = rawServerCfg.show_signature;

    // Merge: config local (localStorage) tiene prioridad sobre la del servidor (informe fallback)
    const templateCfg = {
      primary_color: localReciboCfg?.primary_color ?? serverColor,
      header_text: localReciboCfg?.header_text ?? serverHeaderText,
      footer_text: localReciboCfg?.footer_text ?? serverFooterText,
      show_logo: localReciboCfg?.show_logo ?? serverShowLogo,
      show_signature: localReciboCfg?.show_signature ?? serverShowSignature,
    };

    if (!prof) {
      showToast({ type: 'error', message: 'No se pudo cargar la información del doctor' });
      return;
    }

    const dbExtras = rawItems.map((i) => ({
      name: i.name,
      amount: Number(i.amount_usd),
    }));

    const totalNow = selectedPayment.plan_price || 0;
    const sumExtras = dbExtras.reduce((s, e) => s + e.amount, 0);
    const baseTotal = Math.max(0, totalNow - sumExtras);

    const effectiveBcvRate = editBcvRate ? parseFloat(editBcvRate) : (bcvRate ?? null);
    const effectivePaidAt = editPaidAt || new Date().toISOString();

    const html = buildReceiptHtml({
      paymentCode: selectedPayment.appointment_code || 'RECIBO',
      consultationCode: null,
      patientName: selectedPayment.patient_name || 'Paciente',
      patientCedula: null,
      amountUsd: baseTotal,
      amountBs: effectiveBcvRate ? baseTotal * effectiveBcvRate : null,
      bcvRate: effectiveBcvRate,
      paymentMethod: selectedPayment.payment_method,
      paymentReference: editReference || undefined,
      paidAt: effectivePaidAt,
      scheduledAt: selectedPayment.scheduled_at,
      planName: selectedPayment.plan_name,
      extraItems: dbExtras,
      doctorName: prof.full_name || 'Doctor',
      doctorTitle: prof.professional_title,
      doctorSpecialty: prof.specialty,
      doctorLicense: prof.license_number,
      doctorEmail: prof.email,
      doctorPhone: prof.phone,
      logoUrl: prof.logo_url,
      signatureUrl: prof.signature_url,
      // Template config branded (color, header, footer, visibilidad)
      primaryColor: templateCfg.primary_color,
      headerText: templateCfg.header_text || null,
      footerText: templateCfg.footer_text || null,
      showLogo: templateCfg.show_logo,
      showSignature: templateCfg.show_signature,
    });

    // TAREA 4: intentar window.open(); si está bloqueado, usar blob URL
    const w = window.open('', '_blank');
    if (w) {
      w.document.write(html);
      w.document.close();
    } else {
      // Popup bloqueado: abrir via blob URL en la misma sesión
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Liberar después de un momento
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
      showToast({
        type: 'info',
        message: 'Si el recibo no abrió, permite ventanas emergentes en tu navegador',
      });
    }
  }

  // RONDA 35: al abrir el modal, cargar los items extra reales desde BD.
  useEffect(() => {
    if (!selectedPayment) {
      setExtraItems([]);
      return;
    }
    loadExtraItems(selectedPayment.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPayment?.id]);

  // RONDA 16 / TAREA 1: actualizar estado del pago
  async function updatePaymentStatus(paymentId: string, newStatus: 'pending' | 'approved') {
    setUpdatingStatus(true);
    setActionToast(null);
    try {
      const result = await updatePaymentStatusAction(paymentId, newStatus);
      if (!result.success) throw new Error(result.error);

      setActionToast({
        type: 'success',
        msg:
          newStatus === 'approved' ? 'Pago aprobado correctamente' : 'Pago marcado como pendiente',
      });
      setTimeout(() => setActionToast(null), 3000);
      setSelectedPayment(null);
      await fetchPayments();
    } catch (err: unknown) {
      reportError('doctor/cobros', 'updatePaymentStatus', err);
      setActionToast({
        type: 'error',
        msg: err instanceof Error ? err.message : 'Error al actualizar el pago',
      });
      setTimeout(() => setActionToast(null), 3500);
    } finally {
      setUpdatingStatus(false);
    }
  }

  // 7.10: construye el texto del mensaje de cobro por WhatsApp
  function buildWhatsAppMessage(payment: Payment): string {
    const amountUsd = payment.plan_price ?? 0;
    const amountBs = bcvRate ? amountUsd * bcvRate : null;
    const service = payment.plan_name || 'consulta médica';
    const code = payment.appointment_code ? ` (Ref. ${payment.appointment_code})` : '';

    const usdStr = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(amountUsd);

    const bsStr = amountBs
      ? new Intl.NumberFormat('es-VE', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(amountBs) + ' Bs'
      : null;

    const amountLine = bsStr
      ? `*Monto:* ${usdStr} USD (${bsStr}${bcvRate ? ` | Tasa BCV: ${bcvRate.toFixed(2)} Bs/$` : ''})`
      : `*Monto:* ${usdStr} USD`;

    const PAYMENT_LABELS: Record<string, string> = {
      pago_movil: 'Pago Móvil',
      transferencia: 'Transferencia Bancaria',
      zelle: 'Zelle',
      binance: 'Binance Pay',
      cash_usd: 'Efectivo USD',
      cash_bs: 'Efectivo Bs',
      pos: 'Punto de venta (POS)',
    };

    const paymentLines: string[] = [];
    for (const methodId of doctorPaymentMethods) {
      const label = PAYMENT_LABELS[methodId] ?? methodId;
      const details = doctorPaymentDetails[methodId];

      if (!details || Object.keys(details).length === 0) {
        paymentLines.push(`• *${label}*`);
        continue;
      }

      const parts: string[] = [];
      if (methodId === 'pago_movil') {
        if (details.phone) parts.push(`Tlf: ${details.phone}`);
        if (details.bank) parts.push(`Banco: ${details.bank}`);
        if (details.id_number) parts.push(`C.I./RIF: ${details.id_number}`);
        if (details.holder) parts.push(`Titular: ${details.holder}`);
      } else if (methodId === 'transferencia') {
        if (details.bank) parts.push(`Banco: ${details.bank}`);
        if (details.account) parts.push(`Cuenta: ${details.account}`);
        if (details.account_type) parts.push(`Tipo: ${details.account_type}`);
        if (details.id_number) parts.push(`C.I./RIF: ${details.id_number}`);
        if (details.holder) parts.push(`Titular: ${details.holder}`);
      } else if (methodId === 'zelle') {
        if (details.email) parts.push(`Email: ${details.email}`);
        if (details.holder) parts.push(`Nombre: ${details.holder}`);
        if (details.bank) parts.push(`Banco: ${details.bank}`);
      } else if (methodId === 'binance') {
        if (details.binance_id) parts.push(`ID: ${details.binance_id}`);
        if (details.email) parts.push(`Email: ${details.email}`);
      } else if (methodId === 'pos') {
        if (details.bank) parts.push(`Banco del POS: ${details.bank}`);
      }

      paymentLines.push(`• *${label}:* ${parts.join(' | ')}`);
    }

    const noMethodsNote =
      paymentLines.length === 0
        ? '\n_No tienes métodos de pago configurados. Configúralos en Ajustes > Métodos de pago._'
        : '';

    const paymentSection =
      paymentLines.length > 0 ? `\n\n*Datos de pago:*\n${paymentLines.join('\n')}` : noMethodsNote;

    return (
      `Hola ${payment.patient_name}, le escribo del consultorio para recordarle el pago pendiente de su ${service}${code}.\n\n` +
      `${amountLine}${paymentSection}\n\n` +
      `Por favor, confirme el pago una vez realizado. Quedamos atentos a cualquier consulta.`
    );
  }

  // 7.10: abre WhatsApp con el mensaje de cobro
  function handleWhatsApp(payment: Payment) {
    if (!payment.patient_phone) {
      showToast({
        type: 'error',
        message: 'El paciente no tiene un teléfono válido registrado',
      });
      return;
    }
    setSendingWa(true);
    try {
      const message = buildWhatsAppMessage(payment);
      const link = waLink(payment.patient_phone, message);
      if (!link) {
        showToast({
          type: 'error',
          message: 'El teléfono del paciente no es válido para WhatsApp',
        });
        return;
      }
      window.open(link, '_blank', 'noopener,noreferrer');
    } finally {
      setSendingWa(false);
    }
  }

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('es-VE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString('es-VE', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });

  // TAREA 5: 3 tabs incluyendo "Todas"
  const tabs: { key: CobrosTab; label: string; icon: React.ElementType; color: string }[] = [
    { key: 'pending', label: 'Pendientes', icon: Clock, color: 'amber' },
    { key: 'approved', label: 'Aprobados', icon: CheckCircle, color: 'emerald' },
    { key: 'all', label: 'Todas', icon: Filter, color: 'slate' },
  ];

  return (
    <div className="space-y-6">
      {/* TOAST de feedback (ronda 16) */}
      {actionToast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed top-6 left-1/2 z-[100] flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-lg border text-sm font-semibold ${
            actionToast.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
          style={{ transform: 'translateX(-50%)' }}
        >
          {actionToast.type === 'success' ? (
            <CheckCircle className="w-4 h-4" />
          ) : (
            <XCircle className="w-4 h-4" />
          )}
          {actionToast.msg}
        </div>
      )}

      {/* TAREA 5: cajas de resumen reflejan el filtro activo (filtered, no todos) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-5 h-5 text-teal-500" />
            <span className="text-xs font-semibold text-slate-500 uppercase">Total USD</span>
          </div>
          <p className="text-2xl font-bold text-slate-900">{formatUsd(totalUSD)}</p>
          <p className="text-xs text-slate-400 mt-1">
            {filtered.length} registro{filtered.length !== 1 ? 's' : ''}{' '}
            {tab === 'pending' ? 'pendientes' : tab === 'approved' ? 'aprobados' : 'en total'}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-2">
            <Banknote className="w-5 h-5 text-teal-500" />
            <span className="text-xs font-semibold text-slate-500 uppercase">Total Bs</span>
          </div>
          {bcvLoading ? (
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
              <span className="text-sm text-slate-400">Cargando tasa BCV...</span>
            </div>
          ) : totalBs !== null ? (
            <>
              <p className="text-2xl font-bold text-slate-900">{formatBs(totalBs)}</p>
              <p className="text-xs text-slate-400 mt-1">Tasa BCV: {bcvRate?.toFixed(2)} Bs/$</p>
            </>
          ) : (
            <p className="text-sm text-slate-400">Tasa no disponible</p>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between">
          <div className="flex items-center gap-2 mb-2">
            <Download className="w-5 h-5 text-teal-500" />
            <span className="text-xs font-semibold text-slate-500 uppercase">Exportar</span>
          </div>
          {!showExport ? (
            <button
              onClick={() => setShowExport(true)}
              className="text-sm font-semibold text-teal-600 hover:text-teal-700 flex items-center gap-1"
            >
              Exportar a Excel <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <div className="space-y-2">
              <div className="flex gap-2">
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1.5"
                />
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1.5"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={exportExcel}
                  className="flex-1 text-xs font-semibold text-white bg-teal-500 hover:bg-teal-600 rounded-lg py-1.5 transition-colors"
                >
                  Descargar
                </button>
                <button
                  onClick={() => setShowExport(false)}
                  className="text-xs text-slate-400 hover:text-slate-600 px-2"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* TAREA 5: Tabs (3 tabs) + Search */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex bg-slate-100 rounded-xl p-1 gap-0.5">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                tab === t.key
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <t.icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar paciente o servicio..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:border-teal-400 focus:ring-1 focus:ring-teal-100 outline-none"
          />
        </div>
      </div>

      {/* Payment list */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <Receipt className="w-8 h-8 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-400">
              No hay registros{' '}
              {tab === 'pending' ? 'pendientes' : tab === 'approved' ? 'aprobados' : ''}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {/* Table header */}
            <div className="hidden sm:grid grid-cols-12 gap-3 px-5 py-3 bg-slate-50 text-xs font-semibold text-slate-500 uppercase">
              <div className="col-span-3">Paciente</div>
              <div className="col-span-2">Servicio</div>
              <div className="col-span-2">Fecha</div>
              <div className="col-span-2">Método</div>
              <div className="col-span-1 text-right">USD</div>
              <div className="col-span-1 text-right">Bs</div>
              <div className="col-span-1 text-center">Estado</div>
            </div>

            {filtered.map((p) => (
              <div
                key={p.id}
                onClick={() => setSelectedPayment(p)}
                className="grid grid-cols-1 sm:grid-cols-12 gap-1 sm:gap-3 px-5 py-3.5 hover:bg-slate-50/50 transition-colors items-center cursor-pointer"
              >
                <div className="col-span-3">
                  <p className="text-sm font-medium text-slate-900">
                    {p.patient_name || 'Sin nombre'}
                  </p>
                  {p.appointment_code && (
                    <p className="text-xs text-slate-400 mt-0.5">#{p.appointment_code}</p>
                  )}
                </div>
                <div className="col-span-2">
                  <p className="text-sm text-slate-600">{p.plan_name || '—'}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-slate-500">{formatDate(p.scheduled_at)}</p>
                  <p className="text-xs text-slate-400">{formatTime(p.scheduled_at)}</p>
                </div>
                <div className="col-span-2">
                  <span className="text-xs text-slate-500">
                    {formatPaymentMethod(p.payment_method)}
                  </span>
                </div>
                <div className="col-span-1 text-right">
                  <span className="text-sm font-semibold text-slate-900">
                    {formatUsd(p.plan_price)}
                  </span>
                </div>
                <div className="col-span-1 text-right">
                  <span className="text-xs text-slate-500">
                    {bcvRate ? formatBs((p.plan_price || 0) * bcvRate) : '—'}
                  </span>
                </div>
                <div className="col-span-1 text-center">
                  <span
                    className={`text-xs font-medium px-2 py-1 rounded-full ${
                      p.status === 'approved'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-amber-50 text-amber-700 border border-amber-200'
                    }`}
                  >
                    {p.status === 'approved' ? 'Aprobada' : 'Pendiente'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Detail drawer */}
      {selectedPayment && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex"
          onClick={() => setSelectedPayment(null)}
        >
          <div
            className="ml-auto w-full max-w-md bg-white h-full overflow-y-auto shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Detalle del cobro</h3>
              <button
                onClick={() => setSelectedPayment(null)}
                className="p-1.5 rounded-lg hover:bg-slate-100"
              >
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-5">
              {/* Patient info */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-400 uppercase">Paciente</p>
                <p className="text-lg font-bold text-slate-900">
                  {selectedPayment.patient_name || 'Sin nombre'}
                </p>
                {selectedPayment.appointment_code && (
                  <p className="text-xs font-mono text-slate-400">
                    Código: {selectedPayment.appointment_code}
                  </p>
                )}
              </div>

              {/* Service & amount */}
              <div className="bg-gradient-to-br from-teal-50 to-cyan-50 rounded-xl p-4 border border-teal-100 space-y-2">
                <p className="text-xs font-semibold text-slate-500">Servicio</p>
                <p className="text-sm font-bold text-slate-800">
                  {selectedPayment.plan_name || '—'}
                </p>
                <div className="flex items-baseline gap-2 pt-1">
                  <span className="text-2xl font-bold text-teal-600">
                    {formatUsd(selectedPayment.plan_price)}
                  </span>
                  <span className="text-xs text-slate-400">USD</span>
                  {bcvRate && (
                    <span className="text-sm text-slate-500 ml-2">
                      = {formatBs((selectedPayment.plan_price || 0) * bcvRate)}
                    </span>
                  )}
                </div>
              </div>

              {/* Date */}
              <div className="flex items-center gap-3 py-3 border-b border-slate-100">
                <Calendar className="w-4 h-4 text-slate-400" />
                <div>
                  <p className="text-sm text-slate-700">
                    {formatDate(selectedPayment.scheduled_at)}
                  </p>
                  <p className="text-xs text-slate-400">
                    {formatTime(selectedPayment.scheduled_at)}
                  </p>
                </div>
              </div>

              {/* TAREA 1: UN solo botón de cambio de estado (contrario al actual) */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-400 uppercase">Estado del pago</p>
                <div className="flex items-center gap-3">
                  <span
                    className={`inline-flex text-sm font-semibold px-3 py-1.5 rounded-full ${
                      selectedPayment.status === 'approved'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-amber-50 text-amber-700 border border-amber-200'
                    }`}
                  >
                    {selectedPayment.status === 'approved' ? 'Aprobado' : 'Pendiente'}
                  </span>
                  {/* Solo un botón: acción contraria */}
                  {selectedPayment.status === 'approved' ? (
                    <button
                      onClick={() => updatePaymentStatus(selectedPayment.id, 'pending')}
                      disabled={updatingStatus}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-200 text-amber-600 text-xs font-semibold hover:bg-amber-50 transition-colors disabled:opacity-40"
                    >
                      {updatingStatus ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Clock className="w-3.5 h-3.5" />
                      )}
                      Marcar como pendiente
                    </button>
                  ) : (
                    <button
                      onClick={() => updatePaymentStatus(selectedPayment.id, 'approved')}
                      disabled={updatingStatus}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-500 hover:bg-teal-600 text-white text-xs font-semibold transition-colors disabled:opacity-40"
                    >
                      {updatingStatus ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <CheckCircle className="w-3.5 h-3.5" />
                      )}
                      Marcar como aprobado
                    </button>
                  )}
                </div>
              </div>

              {/* TAREA 2: campos editables de detalles del pago */}
              <div className="space-y-3 pt-3 border-t border-slate-100">
                <p className="text-xs font-semibold text-slate-400 uppercase flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5" /> Detalles del pago
                </p>

                {/* Fecha de pago */}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-500" htmlFor="edit-paid-at">
                    Fecha de pago
                  </label>
                  <input
                    id="edit-paid-at"
                    type="date"
                    value={editPaidAt}
                    onChange={(e) => handlePaidAtChange(e.target.value)}
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:border-teal-400 focus:ring-1 focus:ring-teal-100 outline-none"
                  />
                  {loadingBcvForDate && (
                    <p className="text-xs text-slate-400 flex items-center gap-1">
                      <Loader2 className="w-3 h-3 animate-spin" /> Consultando tasa BCV...
                    </p>
                  )}
                  {bcvDateWarning && (
                    <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
                      {bcvDateWarning}
                    </p>
                  )}
                </div>

                {/* Tasa BCV */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-500" htmlFor="edit-bcv-rate">
                      Tasa (Bs/USD)
                    </label>
                    <input
                      id="edit-bcv-rate"
                      type="number"
                      min="0"
                      step="0.01"
                      value={editBcvRate}
                      onChange={(e) => handleBcvRateChange(e.target.value)}
                      placeholder="Ej: 46.50"
                      className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:border-teal-400 focus:ring-1 focus:ring-teal-100 outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-500" htmlFor="edit-amount-bs">
                      Monto Bs
                    </label>
                    <input
                      id="edit-amount-bs"
                      type="number"
                      min="0"
                      step="0.01"
                      value={editAmountBs}
                      onChange={(e) => setEditAmountBs(e.target.value)}
                      placeholder="Calculado auto."
                      className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:border-teal-400 focus:ring-1 focus:ring-teal-100 outline-none bg-slate-50"
                    />
                  </div>
                </div>

                {/* Método de pago */}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-500" htmlFor="edit-method">
                    Método de pago
                  </label>
                  <select
                    id="edit-method"
                    value={editMethod}
                    onChange={(e) => setEditMethod(e.target.value)}
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:border-teal-400 focus:ring-1 focus:ring-teal-100 outline-none bg-white"
                  >
                    <option value="">— Seleccionar —</option>
                    {PAYMENT_METHOD_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Referencia */}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-500" htmlFor="edit-reference">
                    Referencia (opcional)
                  </label>
                  <input
                    id="edit-reference"
                    type="text"
                    value={editReference}
                    onChange={(e) => setEditReference(e.target.value)}
                    placeholder="Nro. de confirmación o referencia"
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:border-teal-400 focus:ring-1 focus:ring-teal-100 outline-none"
                  />
                </div>

                {/* Botón guardar detalles */}
                <button
                  onClick={handleSaveDetails}
                  disabled={savingDetails}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-600 text-white text-sm font-bold transition-colors disabled:opacity-50"
                >
                  {savingDetails ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  {savingDetails ? 'Guardando...' : 'Guardar detalles'}
                </button>
              </div>

              {/* Receipt/comprobante */}
              <div className="space-y-2 pt-3 border-t border-slate-100">
                <p className="text-xs font-semibold text-slate-400 uppercase flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5" /> Comprobante
                </p>
                {selectedPayment.payment_receipt_url ? (
                  <div className="space-y-2">
                    {selectedPayment.payment_receipt_url.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                      <a
                        href={selectedPayment.payment_receipt_url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <img
                          src={selectedPayment.payment_receipt_url}
                          alt="Comprobante"
                          className="w-full rounded-xl border border-slate-200 hover:opacity-90 transition-opacity"
                        />
                      </a>
                    ) : (
                      <a
                        href={selectedPayment.payment_receipt_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-sm text-teal-600 hover:text-teal-700 font-medium"
                      >
                        <ExternalLink className="w-4 h-4" /> Ver comprobante adjunto
                      </a>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm text-slate-400 italic">Sin comprobante adjunto</p>
                    <label
                      className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border-2 border-dashed border-slate-300 hover:border-teal-400 hover:bg-teal-50/50 cursor-pointer transition-all ${uploadingReceipt ? 'opacity-60 pointer-events-none' : ''}`}
                    >
                      {uploadingReceipt ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin text-teal-500" />{' '}
                          <span className="text-sm text-teal-600 font-medium">Subiendo...</span>
                        </>
                      ) : (
                        <>
                          <Upload className="w-4 h-4 text-slate-400" />{' '}
                          <span className="text-sm text-slate-600 font-medium">
                            Subir comprobante
                          </span>
                        </>
                      )}
                      <input
                        type="file"
                        accept="image/*,.pdf"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleReceiptUpload(file);
                          e.target.value = '';
                        }}
                      />
                    </label>
                  </div>
                )}
              </div>

              {/* RONDA 35 — Items extra persistidos en BD (payment_items) */}
              {(extraItems.length > 0 || loadingExtras) && (
                <div className="space-y-2 pt-3 border-t border-slate-100">
                  <p className="text-xs font-semibold text-slate-400 uppercase">
                    Cargos adicionales
                  </p>
                  {loadingExtras ? (
                    <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Cargando cargos...
                    </div>
                  ) : (
                    <>
                      {extraItems.map((item) => (
                        <div
                          key={item.id}
                          className="group flex items-center justify-between bg-teal-50 border border-teal-200 rounded-lg px-3 py-2"
                        >
                          <span className="text-sm text-teal-800 flex-1 truncate pr-2">
                            {item.name}
                          </span>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-sm font-bold text-teal-700">
                              {formatUsd(item.amount)}
                            </span>
                            <button
                              onClick={() => removeExtraItem(item.id, item.amount)}
                              title="Eliminar este cargo"
                              className="p-1 rounded-md text-teal-500 hover:bg-red-100 hover:text-red-600 transition-colors"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                      <div className="flex items-center justify-between pt-2 border-t border-teal-200">
                        <span className="text-xs font-semibold text-slate-600 uppercase">
                          Total actualizado
                        </span>
                        <span className="text-base font-bold text-teal-600">
                          {formatUsd(selectedPayment.plan_price)}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Botones de acciones extra */}
              <div className="space-y-2 pt-3 border-t border-slate-100">
                {/* 7.10: Cobrar por WhatsApp — solo para pagos pendientes */}
                {selectedPayment.status === 'pending' && (
                  <button
                    onClick={() => handleWhatsApp(selectedPayment)}
                    disabled={sendingWa || !selectedPayment.patient_phone}
                    title={
                      !selectedPayment.patient_phone
                        ? 'El paciente no tiene teléfono registrado'
                        : 'Enviar mensaje de cobro por WhatsApp'
                    }
                    className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-colors ${
                      selectedPayment.patient_phone
                        ? 'bg-emerald-500 hover:bg-emerald-600 text-white'
                        : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    <MessageSquare className="w-4 h-4" />
                    {selectedPayment.patient_phone
                      ? 'Cobrar por WhatsApp'
                      : 'Sin teléfono registrado'}
                  </button>
                )}
                {/* TAREA 3: botón "Añadir paquete / servicio" — llama openAddItemModal */}
                <button
                  onClick={openAddItemModal}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-slate-300 text-sm font-semibold text-slate-600 hover:border-teal-400 hover:text-teal-600 hover:bg-teal-50 transition-colors"
                >
                  <Plus className="w-4 h-4" /> Añadir paquete / servicio
                </button>
                {/* TAREA 4: Generar recibo PDF con fallback a blob URL */}
                <button
                  onClick={generateReceipt}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-sm font-bold transition-colors"
                >
                  <FileText className="w-4 h-4" /> Generar recibo PDF
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAREA 3 / RONDA 34: Modal para seleccionar paquete/servicio */}
      {showAddItemModal && (
        <div
          className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4"
          onClick={() => !addingItem && setShowAddItemModal(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-md w-full max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-3.5 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">Añadir al cobro</h3>
              <button
                onClick={() => !addingItem && setShowAddItemModal(false)}
                disabled={addingItem}
                className="p-1 rounded-lg hover:bg-slate-100"
              >
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>
            <div className="p-4 space-y-2">
              {availableItems.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6">
                  No tienes paquetes ni servicios activos. Configúralos en /doctor/services.
                </p>
              ) : (
                availableItems.map((item) => (
                  <button
                    key={`${item.type}-${item.id}`}
                    onClick={() => addExtraItem(item)}
                    disabled={addingItem}
                    className="w-full flex items-center justify-between p-3 rounded-xl border border-slate-200 hover:border-teal-300 hover:bg-teal-50 transition-colors disabled:opacity-50"
                  >
                    <div className="text-left">
                      <p className="text-sm font-semibold text-slate-800">{item.name}</p>
                      <p className="text-[10px] text-slate-400 uppercase tracking-wider">
                        {item.type === 'plan' ? 'Plan' : 'Servicio'}
                      </p>
                    </div>
                    <span className="text-sm font-bold text-teal-600">
                      {formatUsd(item.price_usd)}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
      <style jsx>{`
        .g-bg {
          background: linear-gradient(135deg, #00c4cc 0%, #0891b2 100%);
        }
      `}</style>
    </div>
  );
}
