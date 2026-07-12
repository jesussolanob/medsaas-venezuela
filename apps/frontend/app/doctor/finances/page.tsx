'use client';

// L7 (2026-04-29): añadidos KPIs (consultas/mes, pacientes únicos, crecimiento MoM),
// dropdown de meses (últimos 12), gráfico Recharts de ingresos vs egresos
// (últimos 6 meses) y exportación CSV de consultas con diagnóstico/duración.
// ETAPA 1: Supabase eliminado — expenses via /api/finances/transactions,
// consultations via /api/consultations. Realtime Supabase eliminado (Fase 5).
import { useState, useEffect, useMemo } from 'react';
import { useBcvRate } from '@/lib/useBcvRate';
import { formatUsd, formatBs } from '@/lib/finances';
import { getPayments } from './payments-actions';
import { getPatients, getDoctorId, type Patient } from '../patients/actions';
import {
  getExpenses,
  addExpense,
  getConsultationsForReports,
  getIncomeConcepts,
  addIncome,
  getManualIncomes,
  createIncomeConcept,
  updateIncomeConcept,
  deleteIncomeConcept,
  editTransaction,
  getIncomePaged,
  getExpensesPaged,
  type BackendConsultationRow,
  type BackendExpense,
  type IncomeConcept,
  type IncomeTransactionItem,
  type IncomePageItem,
} from './actions';
import Paginator, { PAGE_SIZE_ALL } from '@/components/ui/Paginator';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Clock,
  BarChart3,
  Plus,
  Trash2,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Search,
  Calendar,
  Download,
  Users,
  ClipboardList,
  Activity,
  FileSpreadsheet,
  Eye,
  X,
  FileText,
  Stethoscope,
  Pill,
  MessageCircle,
  Pencil,
  Check,
  ArrowDownCircle,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  Legend,
} from 'recharts';
import { reportError } from '@/lib/report-error';

type Income = {
  id: string;
  patient_name: string;
  amount_usd: number;
  payment_method: string;
  date: string;
  consultation_code?: string;
};

type Expense = {
  id: string;
  vendor_name: string;
  concept: string;
  amount: number;
  due_date: string;
  paid: boolean;
  notes?: string;
};

/** Ingreso manual extraordinario (financial_transactions type='income') */
type ManualIncome = {
  id: string;
  description: string;
  amount: number;
  currency: string;
  conceptId: string | null;
  date: string;
  patientId: string | null;
  patientName: string | null;
};

// ConsultationRow — re-exported from actions.ts (backend-aligned shape).
// Fields that require appointment joins are null until the backend exposes them
// (appointment_status, consultation_status, duration_minutes, scheduled_at,
// appointment_mode, payment_reference, blocks_data, plan_name, patient_cedula).
type ConsultationRow = BackendConsultationRow;

const EXPENSE_CATEGORIES = [
  { value: 'rent', label: 'Alquiler' },
  { value: 'staff', label: 'Personal' },
  { value: 'supplies', label: 'Insumos' },
  { value: 'services', label: 'Servicios' },
  { value: 'taxes', label: 'Impuestos' },
  { value: 'other', label: 'Otros' },
];

const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

type ViewMode = 'month' | 'week' | 'day';

/**
 * Parses the date portion of an ISO datetime or bare "YYYY-MM-DD" string as a
 * local calendar date, avoiding the UTC midnight offset bug where
 * new Date("2026-07-01") in UTC-4 (Venezuela) becomes June 30 at 20:00 local.
 */
function parseDateLocal(dateStr: string): Date {
  const part = dateStr.split('T')[0]; // keep only "YYYY-MM-DD"
  const [y, m, d] = part.split('-').map(Number);
  return new Date(y, m - 1, d); // constructed in local time
}

export default function FinancesPage() {
  const { rate: bcvRate, toBs } = useBcvRate();
  const [incomes, setIncomes] = useState<Income[]>([]);
  // Cuentas por cobrar: pagos aún 'pending' (no aprobados). Se muestran como "Por ingresar".
  const [pendingIncomes, setPendingIncomes] = useState<Income[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  // L7 (2026-04-29): consultas para el cuadro descargable + KPIs.
  const [consultationsRows, setConsultationsRows] = useState<ConsultationRow[]>([]);
  const [loading, setLoading] = useState(true);
  // F3 (2026-04-29): nuevo tab 'reports' (Reportería) — la sección estaba renderizada
  // SIEMPRE en todos los tabs (no estaba envuelta en `tab === 'overview'`),
  // pero quedaba muy abajo del scroll y el usuario no la encontraba. Ahora vive
  // en su propio tab con icono BarChart3.
  const [tab, setTab] = useState<'overview' | 'income' | 'expenses' | 'reports'>('overview');
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [currentDate, setCurrentDate] = useState(new Date());
  // L7 (2026-04-29): mes seleccionado para los KPIs nuevos (formato YYYY-MM,
  // independiente del navegador día/semana/mes existente — afecta solo a los
  // KPI cards del bloque "Reportería" y al gráfico Recharts).
  const [reportMonth, setReportMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [savingExpense, setSavingExpense] = useState(false);
  const [expenseForm, setExpenseForm] = useState({
    vendor_name: '',
    concept: '',
    amount: '',
    category: 'other',
    due_date: new Date().toISOString().split('T')[0],
  });
  // Date range filters for tables
  const [incomeDateFrom, setIncomeDateFrom] = useState('');
  const [incomeDateTo, setIncomeDateTo] = useState('');
  const [expenseDateFrom, setExpenseDateFrom] = useState('');
  const [expenseDateTo, setExpenseDateTo] = useState('');
  // 2026-04-30: modal de detalle de consulta (UX feature request).
  const [detailRow, setDetailRow] = useState<ConsultationRow | null>(null);

  // #6 — Registrar ingreso extraordinario
  const [incomeConcepts, setIncomeConcepts] = useState<IncomeConcept[]>([]);
  const [showIncomeModal, setShowIncomeModal] = useState(false);
  const [savingIncome, setSavingIncome] = useState(false);
  const [incomeError, setIncomeError] = useState('');
  const [incomeForm, setIncomeForm] = useState({
    description: '',
    amount: '',
    conceptId: '',
    date: new Date().toISOString().split('T')[0],
    // Asociación opcional — se envía uno o ninguno al backend:
    relatedConsultationId: '', // si se elige una consulta
    patientId: '', // si se elige un paciente directamente
  });

  // #7 — Editar transacción (gasto o ingreso manual)
  const [editingTx, setEditingTx] = useState<{
    id: string;
    type: 'expense' | 'manual_income';
    description: string;
    amount: string;
    date: string;
    conceptId: string;
  } | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState('');

  // Ingresos manuales (financial_transactions type='income') — cargados desde
  // GET /api/finances/income-transactions en loadData.
  const [manualIncomes, setManualIncomes] = useState<ManualIncome[]>([]);

  // Lista de pacientes del doctor para el IncomeModal (se carga junto a los datos).
  const [patientsList, setPatientsList] = useState<Patient[]>([]);

  // ─── Paginación server-side: Tab Ingresos ───────────────────────────────
  const [incPage, setIncPage] = useState(1);
  const [incPageSize, setIncPageSize] = useState(15);
  const [incTotal, setIncTotal] = useState(0);
  const [incPagedItems, setIncPagedItems] = useState<IncomePageItem[]>([]);
  const [incLoading, setIncLoading] = useState(false);

  // ─── Paginación server-side: Tab Egresos ────────────────────────────────
  const [expPage, setExpPage] = useState(1);
  const [expPageSize, setExpPageSize] = useState(15);
  const [expTotal, setExpTotal] = useState(0);
  const [expPagedItems, setExpPagedItems] = useState<BackendExpense[]>([]);
  const [expLoading, setExpLoading] = useState(false);

  // ─── Clave de refresco para paginación tras mutaciones ──────────────────
  // Se incrementa después de agregar/eliminar/editar ingresos o gastos para
  // que los useEffect de paginación re-fetchen sin necesidad de cambiar
  // tab/página/mes, evitando que el listado quede stale tras una mutación.
  const [refreshKey, setRefreshKey] = useState(0);

  // ETAPA 1: loadData migrado al backend. Supabase eliminado.
  const loadData = async () => {
    setLoading(true);
    try {
      // Pagos APROBADOS (ingresos reales) + PENDIENTES (cuentas por cobrar) vía backend (BFF).
      // Adicionalmente cargamos: gastos, conceptos de ingreso, consultas, ingresos manuales
      // y lista de pacientes en paralelo.
      const doctorId = await getDoctorId();
      const [paid, pending, exp, concepts, cons, manualRaw, patients] = await Promise.all([
        getPayments({ status: 'approved' }),
        getPayments({ status: 'pending' }),
        getExpenses(),
        getIncomeConcepts(),
        getConsultationsForReports(200),
        getManualIncomes(),
        doctorId ? getPatients(doctorId) : Promise.resolve([]),
      ]);

      const toIncome = (p: Awaited<ReturnType<typeof getPayments>>[number]): Income => ({
        id: p.id,
        patient_name: p.appointment?.patient_name || 'Paciente',
        amount_usd: Number(p.amount_usd || 0),
        payment_method: p.method_snapshot || '',
        date: p.appointment?.scheduled_at || p.paid_at || p.created_at,
        consultation_code:
          p.consultation?.consultation_code ||
          p.appointment?.appointment_code ||
          p.payment_code ||
          '',
      });

      setIncomes(paid.map(toIncome));
      setPendingIncomes(pending.map(toIncome));
      setIncomeConcepts(concepts);

      // getExpenses() ya filtra type='expense' en el backend
      setExpenses(
        exp.map((e) => ({
          id: e.id,
          vendor_name: e.vendor_name,
          concept: e.concept,
          amount: e.amount,
          due_date: e.due_date,
          paid: e.paid,
          notes: e.notes,
        })),
      );

      // Ingresos manuales (financial_transactions type='income') — endpoint nuevo MVP 7.9
      setManualIncomes(
        manualRaw.map(
          (m: IncomeTransactionItem): ManualIncome => ({
            id: m.id,
            description: m.description,
            amount: m.amount,
            currency: m.currency,
            conceptId: m.conceptId,
            date: m.date,
            patientId: m.patientId,
            patientName: m.patientName,
          }),
        ),
      );

      setPatientsList(patients);
      setConsultationsRows(cons);
    } catch (err) {
      reportError('doctor/finances', 'loadData', err);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  /**
   * Deriva el string YYYY-MM del período activo del navegador.
   * En modo mes devuelve el mes de currentDate.
   * En modo semana/día devuelve el mes que contiene la semana/día actual.
   */
  const activeMonth = (() => {
    const y = currentDate.getFullYear();
    const m = String(currentDate.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  })();

  // ─── Cargar página de Ingresos cuando cambia tab/página/tamaño/mes ──────
  useEffect(() => {
    if (tab !== 'income') return;

    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIncLoading(true);

    const limit = incPageSize === PAGE_SIZE_ALL ? 100 : incPageSize;
    const page = incPageSize === PAGE_SIZE_ALL ? 1 : incPage;

    getIncomePaged({ page, limit, month: activeMonth })
      .then((result) => {
        if (cancelled) return;
        setIncPagedItems(result.items);
        setIncTotal(result.total);
      })
      .catch(() => {
        if (!cancelled) {
          setIncPagedItems([]);
          setIncTotal(0);
        }
      })
      .finally(() => {
        if (!cancelled) setIncLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [tab, incPage, incPageSize, activeMonth, refreshKey]);

  // ─── Cargar página de Egresos cuando cambia tab/página/tamaño/mes ───────
  useEffect(() => {
    if (tab !== 'expenses') return;

    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setExpLoading(true);

    const limit = expPageSize === PAGE_SIZE_ALL ? 100 : expPageSize;
    const page = expPageSize === PAGE_SIZE_ALL ? 1 : expPage;

    getExpensesPaged({ page, limit, month: activeMonth })
      .then((result) => {
        if (cancelled) return;
        setExpPagedItems(result.items);
        setExpTotal(result.total);
      })
      .catch(() => {
        if (!cancelled) {
          setExpPagedItems([]);
          setExpTotal(0);
        }
      })
      .finally(() => {
        if (!cancelled) setExpLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [tab, expPage, expPageSize, activeMonth, refreshKey]);

  // ETAPA 1 NOTE: Supabase Realtime removed. Live refresh is deferred to Fase 5
  // (WebSocket or SSE from NestJS). The page reloads data on mount only.

  // Filter data by current period
  const filteredData = useMemo(() => {
    const filterByDate = (dateStr: string) => {
      // Parse as local calendar date to avoid UTC midnight offset bug (Venezuela = UTC-4).
      const part = dateStr.split('T')[0];
      const [y, m, d] = part.split('-').map(Number);
      if (viewMode === 'day') {
        return (
          y === currentDate.getFullYear() &&
          m - 1 === currentDate.getMonth() &&
          d === currentDate.getDate()
        );
      } else if (viewMode === 'week') {
        const local = new Date(y, m - 1, d);
        const start = new Date(
          currentDate.getFullYear(),
          currentDate.getMonth(),
          currentDate.getDate(),
        );
        start.setDate(start.getDate() - start.getDay());
        const end = new Date(start);
        end.setDate(end.getDate() + 6);
        return local >= start && local <= end;
      } else {
        return y === currentDate.getFullYear() && m - 1 === currentDate.getMonth();
      }
    };

    const filteredIncomes = incomes.filter((i) => filterByDate(i.date));
    const filteredExpenses = expenses.filter((e) => filterByDate(e.due_date));
    const filteredPending = pendingIncomes.filter((i) => filterByDate(i.date));
    // manualIncomes son ADICIONALES a incomes (no se solapan — fuentes distintas).
    const filteredManual = manualIncomes.filter((m) => filterByDate(m.date));

    const totalIncome =
      filteredIncomes.reduce((sum, i) => sum + (i.amount_usd || 0), 0) +
      filteredManual.reduce((sum, m) => sum + (m.amount || 0), 0);
    const totalExpenses = filteredExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
    const pendingTotal = filteredPending.reduce((sum, i) => sum + (i.amount_usd || 0), 0);
    const balance = totalIncome - totalExpenses;

    return {
      filteredIncomes,
      filteredExpenses,
      filteredPending,
      filteredManual,
      totalIncome,
      totalExpenses,
      pendingTotal,
      balance,
    };
  }, [incomes, pendingIncomes, expenses, manualIncomes, viewMode, currentDate]);

  // Chart data — last 6 periods
  const chartData = useMemo(() => {
    const periods: { label: string; income: number; expenses: number }[] = [];

    for (let i = 5; i >= 0; i--) {
      const d = new Date(currentDate);
      if (viewMode === 'month') {
        d.setMonth(d.getMonth() - i);
        const label = `${MONTHS[d.getMonth()]} ${d.getFullYear().toString().slice(2)}`;
        const monthIncomes = incomes.filter((inc) => {
          const id = new Date(inc.date);
          return id.getMonth() === d.getMonth() && id.getFullYear() === d.getFullYear();
        });
        const monthManual = manualIncomes.filter((m) => {
          const md = parseDateLocal(m.date);
          return md.getFullYear() === d.getFullYear() && md.getMonth() === d.getMonth();
        });
        const monthExpenses = expenses.filter((exp) => {
          const ed = parseDateLocal(exp.due_date);
          return ed.getFullYear() === d.getFullYear() && ed.getMonth() === d.getMonth();
        });
        periods.push({
          label,
          income:
            monthIncomes.reduce((s, x) => s + (x.amount_usd || 0), 0) +
            monthManual.reduce((s, x) => s + (x.amount || 0), 0),
          expenses: monthExpenses.reduce((s, x) => s + (x.amount || 0), 0),
        });
      } else if (viewMode === 'week') {
        d.setDate(d.getDate() - i * 7);
        const start = new Date(d);
        start.setDate(start.getDate() - start.getDay());
        const end = new Date(start);
        end.setDate(end.getDate() + 6);
        const label = `${start.getDate()}/${start.getMonth() + 1}`;
        const weekIncomes = incomes.filter((inc) => {
          const id = new Date(inc.date);
          return id >= start && id <= end;
        });
        const weekManual = manualIncomes.filter((m) => {
          const md = parseDateLocal(m.date);
          return md >= start && md <= end;
        });
        const weekExpenses = expenses.filter((exp) => {
          const ed = parseDateLocal(exp.due_date);
          return ed >= start && ed <= end;
        });
        periods.push({
          label,
          income:
            weekIncomes.reduce((s, x) => s + (x.amount_usd || 0), 0) +
            weekManual.reduce((s, x) => s + (x.amount || 0), 0),
          expenses: weekExpenses.reduce((s, x) => s + (x.amount || 0), 0),
        });
      } else {
        d.setDate(d.getDate() - i);
        const label = `${d.getDate()}/${d.getMonth() + 1}`;
        const dayIncomes = incomes.filter(
          (inc) => new Date(inc.date).toDateString() === d.toDateString(),
        );
        const dayManual = manualIncomes.filter(
          (m) => parseDateLocal(m.date).toDateString() === d.toDateString(),
        );
        const dayExpenses = expenses.filter(
          (exp) => parseDateLocal(exp.due_date).toDateString() === d.toDateString(),
        );
        periods.push({
          label,
          income:
            dayIncomes.reduce((s, x) => s + (x.amount_usd || 0), 0) +
            dayManual.reduce((s, x) => s + (x.amount || 0), 0),
          expenses: dayExpenses.reduce((s, x) => s + (x.amount || 0), 0),
        });
      }
    }
    return periods;
  }, [incomes, manualIncomes, expenses, viewMode, currentDate]);

  // L7 (2026-04-29): opciones del dropdown — últimos 12 meses.
  const monthOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
      opts.push({ value, label });
    }
    return opts;
  }, []);

  // L7 + FIX 2026-04-29: KPIs basados en `reportMonth`.
  // - consultasMes: TOTAL de consultas del mes (independiente de pago) — antes
  //   filtraba por payment_status='approved' y daba 0 cuando habían consultas
  //   pendientes/agendadas. Sub-desglose: aprobadas + pendientes para que el
  //   doctor vea el ratio.
  // - pacientesUnicos: distinct patient_name del mes.
  // - crecimientoMoM: % de consultas totales vs mes anterior.
  const reportKpis = useMemo(() => {
    const [yStr, mStr] = reportMonth.split('-');
    const year = parseInt(yStr, 10);
    const month = parseInt(mStr, 10) - 1;
    const prevMonthDate = new Date(year, month - 1, 1);
    const prevYear = prevMonthDate.getFullYear();
    const prevMonth = prevMonthDate.getMonth();

    const inMonth = (d: Date, y: number, m: number) => d.getFullYear() === y && d.getMonth() === m;

    const currentMonth = consultationsRows.filter((r) => {
      if (!r.consultation_date) return false;
      return inMonth(parseDateLocal(r.consultation_date), year, month);
    });
    const prevMonthRows = consultationsRows.filter((r) => {
      if (!r.consultation_date) return false;
      return inMonth(parseDateLocal(r.consultation_date), prevYear, prevMonth);
    });

    const consultasMes = currentMonth.length;
    const consultasAprobadas = currentMonth.filter((r) => r.payment_status === 'approved').length;
    const consultasPendientes = consultasMes - consultasAprobadas;
    const pacientesUnicos = new Set(currentMonth.map((r) => r.patient_name)).size;
    const consultasPrev = prevMonthRows.length;

    let crecimientoMoM: number | null = null;
    if (consultasPrev > 0) {
      crecimientoMoM = ((consultasMes - consultasPrev) / consultasPrev) * 100;
    } else {
      crecimientoMoM = null;
    }

    return {
      consultasMes,
      consultasAprobadas,
      consultasPendientes,
      pacientesUnicos,
      crecimientoMoM,
      consultasPrev,
    };
  }, [consultationsRows, reportMonth]);

  // L7 (2026-04-29): chart Recharts — últimos 6 meses ingresos vs egresos
  // anclado al `reportMonth` seleccionado (no al `currentDate` del navegador).
  const reportChartData = useMemo(() => {
    const [yStr, mStr] = reportMonth.split('-');
    const anchor = new Date(parseInt(yStr, 10), parseInt(mStr, 10) - 1, 1);
    const months: { label: string; ingresos: number; egresos: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(anchor.getFullYear(), anchor.getMonth() - i, 1);
      const yy = d.getFullYear();
      const mm = d.getMonth();
      const ingresosConsultas = incomes
        .filter((inc) => {
          const id = new Date(inc.date);
          return id.getFullYear() === yy && id.getMonth() === mm;
        })
        .reduce((s, x) => s + (x.amount_usd || 0), 0);
      // Ingresos manuales son aditivos — fuente distinta (financial_transactions type='income')
      const ingresosManuales = manualIncomes
        .filter((m) => {
          const md = parseDateLocal(m.date);
          return md.getFullYear() === yy && md.getMonth() === mm;
        })
        .reduce((s, x) => s + (x.amount || 0), 0);
      const egresos = expenses
        .filter((exp) => {
          const ed = parseDateLocal(exp.due_date);
          return ed.getFullYear() === yy && ed.getMonth() === mm;
        })
        .reduce((s, x) => s + (x.amount || 0), 0);
      months.push({
        label: `${MONTHS[mm]} ${String(yy).slice(2)}`,
        ingresos: parseFloat((ingresosConsultas + ingresosManuales).toFixed(2)),
        egresos: parseFloat(egresos.toFixed(2)),
      });
    }
    return months;
  }, [incomes, manualIncomes, expenses, reportMonth]);

  // L7 (2026-04-29): consultas filtradas por `reportMonth` para el CSV.
  const reportConsultations = useMemo(() => {
    const [yStr, mStr] = reportMonth.split('-');
    const year = parseInt(yStr, 10);
    const month = parseInt(mStr, 10) - 1;
    return consultationsRows.filter((r) => {
      if (!r.consultation_date) return false;
      const cd = parseDateLocal(r.consultation_date);
      return cd.getFullYear() === year && cd.getMonth() === month;
    });
  }, [consultationsRows, reportMonth]);

  // L7 (2026-04-29): traduce status de cita a etiqueta legible.
  const apptStatusLabel = (s: string | null) => {
    if (!s) return '—';
    const map: Record<string, string> = {
      scheduled: 'Agendada',
      confirmed: 'Aprobada',
      cancelled: 'Rechazada',
      completed: 'Atendida',
      no_show: 'No asistió',
      pending: 'Pendiente',
      accepted: 'Aceptada',
    };
    return map[s] || s;
  };
  const consultationStatusLabel = (s: string | null) => {
    if (s === 'completed') return 'Atendida';
    if (s === 'no_show') return 'No asistió';
    return '—';
  };
  const paymentStatusLabel = (s: string | null) => {
    if (s === 'approved') return 'Aprobado';
    if (s === 'pending') return 'Pendiente';
    return '—';
  };
  const formatDurationCell = (mins: number | null | undefined): string => {
    if (mins == null || mins <= 0) return '—';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h > 0) return m > 0 ? `${h}h ${m}min` : `${h}h`;
    return `${m} min`;
  };

  // L7 (2026-04-29): export CSV de la cuadrícula de consultas.
  // Columnas requeridas: código, fecha, paciente, status cita, status consulta,
  // status pago, duración, diagnóstico + monto + plan (datos extra valiosos).
  // Genera CSV en cliente con Blob + URL.createObjectURL — sin libs externas.
  const downloadConsultationsCSV = () => {
    const monthLabel = monthOptions.find((o) => o.value === reportMonth)?.label || reportMonth;
    const escapeCsv = (v: unknown): string => {
      if (v == null) return '';
      const s = String(v);
      // Escapamos comillas duplicándolas y envolvemos toda la celda entre comillas
      // para soportar comas/saltos de línea/quotes en diagnósticos.
      return `"${s.replace(/"/g, '""')}"`;
    };
    const headers = [
      'Código',
      'Fecha',
      'Paciente',
      'Plan',
      'Status Cita',
      'Status Consulta',
      'Status Pago',
      'Duración',
      'Monto USD',
      'Diagnóstico',
    ];
    const lines: string[] = [headers.join(',')];
    for (const r of reportConsultations) {
      const dateStr = r.consultation_date
        ? new Date(r.consultation_date).toLocaleDateString('es-VE')
        : '';
      lines.push(
        [
          escapeCsv(r.consultation_code || ''),
          escapeCsv(dateStr),
          escapeCsv(r.patient_name),
          escapeCsv(r.plan_name || ''),
          escapeCsv(apptStatusLabel(r.appointment_status)),
          escapeCsv(consultationStatusLabel(r.consultation_status)),
          escapeCsv(paymentStatusLabel(r.payment_status)),
          escapeCsv(formatDurationCell(r.duration_minutes)),
          r.amount_usd != null ? r.amount_usd.toFixed(2) : '',
          escapeCsv(r.diagnosis || ''),
        ].join(','),
      );
    }
    const csv = lines.join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `consultas_${monthLabel.replace(/\s/g, '_')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const navigate = (dir: number) => {
    const d = new Date(currentDate);
    if (viewMode === 'month') d.setMonth(d.getMonth() + dir);
    else if (viewMode === 'week') d.setDate(d.getDate() + dir * 7);
    else d.setDate(d.getDate() + dir);
    setCurrentDate(d);
    // Reset pagination when period changes
    setIncPage(1);
    setExpPage(1);
  };

  const periodLabel = () => {
    if (viewMode === 'month')
      return `${MONTHS[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
    if (viewMode === 'week') {
      const start = new Date(currentDate);
      start.setDate(start.getDate() - start.getDay());
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      return `${start.getDate()}/${start.getMonth() + 1} — ${end.getDate()}/${end.getMonth() + 1}`;
    }
    return currentDate.toLocaleDateString('es-VE', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  };

  const downloadCSV = (type: 'income' | 'expenses' | 'all') => {
    let csv = '';
    if (type === 'all') {
      // Unified table with all movements
      csv = 'Tipo,Descripción,Detalle,Monto USD,Método/Categoría,Fecha,Estado\n';
      const incRows = tab === 'income' ? incomes : filteredData.filteredIncomes;
      const expRows = tab === 'expenses' ? expenses : filteredData.filteredExpenses;
      // manualRows: filteredManual viene del período activo; en tab 'income' usamos
      // todos los manuales sin filtro de período (mismo criterio que incRows para 'income').
      const manualRows = tab === 'income' ? manualIncomes : filteredData.filteredManual;
      // Combine and sort by date
      const allMovements: {
        type: string;
        desc: string;
        detail: string;
        amount: number;
        method: string;
        date: string;
        status: string;
      }[] = [];
      incRows.forEach((i) => {
        allMovements.push({
          type: 'Ingreso',
          desc: i.patient_name,
          detail: i.consultation_code || '',
          amount: i.amount_usd,
          method: i.payment_method,
          date: i.date,
          status: 'Cobrado',
        });
      });
      // Ingresos manuales — aditivos, fuente distinta a los pagos de consulta.
      manualRows.forEach((m) => {
        allMovements.push({
          type: 'Ingreso manual',
          desc: m.patientName ?? m.description,
          detail: m.description,
          amount: m.amount,
          method: m.currency,
          date: m.date,
          status: 'Registrado',
        });
      });
      expRows.forEach((e) => {
        allMovements.push({
          type: 'Egreso',
          desc: e.vendor_name,
          detail: e.concept,
          amount: -e.amount,
          method: e.notes || 'Otros',
          date: e.due_date,
          status: e.paid ? 'Pagado' : 'Pendiente',
        });
      });
      allMovements.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      allMovements.forEach((m) => {
        csv += `"${m.type}","${m.desc}","${m.detail}",${m.amount},"${m.method}","${new Date(m.date).toLocaleDateString('es-VE')}","${m.status}"\n`;
      });
      // TOTAL INGRESOS coincide exactamente con filteredData.totalIncome (pagos + manuales).
      const totalInc =
        incRows.reduce((s, i) => s + (i.amount_usd || 0), 0) +
        manualRows.reduce((s, m) => s + (m.amount || 0), 0);
      const totalExp = expRows.reduce((s, e) => s + (e.amount || 0), 0);
      csv += `\n"","","TOTAL INGRESOS",${totalInc},"","",""\n`;
      csv += `"","","TOTAL EGRESOS",-${totalExp},"","",""\n`;
      csv += `"","","BALANCE",${totalInc - totalExp},"","",""\n`;
    } else if (type === 'income') {
      csv = 'Paciente,Monto USD,Método de pago,Fecha,Código\n';
      const rows = tab === 'income' ? incomes : filteredData.filteredIncomes;
      rows.forEach((i) => {
        csv += `"${i.patient_name}",${i.amount_usd},"${i.payment_method}","${new Date(i.date).toLocaleDateString('es-VE')}","${i.consultation_code || ''}"\n`;
      });
      // Ingresos manuales en el mismo CSV — para que el total del archivo coincida con el KPI.
      const manualRows = tab === 'income' ? manualIncomes : filteredData.filteredManual;
      manualRows.forEach((m) => {
        csv += `"${m.patientName ?? m.description}",${m.amount},"${m.currency}","${new Date(m.date).toLocaleDateString('es-VE')}","Ingreso manual"\n`;
      });
    } else {
      csv = 'Proveedor,Concepto,Monto,Fecha,Pagado\n';
      const rows = tab === 'expenses' ? expenses : filteredData.filteredExpenses;
      rows.forEach((e) => {
        csv += `"${e.vendor_name}","${e.concept}",${e.amount},"${new Date(e.due_date).toLocaleDateString('es-VE')}","${e.paid ? 'Sí' : 'No'}"\n`;
      });
    }
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${type === 'all' ? 'movimientos' : type === 'income' ? 'ingresos' : 'gastos'}_${periodLabel().replace(/\s/g, '_')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expenseForm.concept || !expenseForm.amount) return;
    setSavingExpense(true);
    try {
      // ETAPA 1: registra el gasto en financial_transactions via backend.
      const result = await addExpense({
        concept: expenseForm.concept,
        vendorName: expenseForm.vendor_name || expenseForm.category,
        amount: parseFloat(expenseForm.amount),
        dueDate: expenseForm.due_date,
        category: expenseForm.category,
      });

      if (!result.success) {
        reportError('doctor/finances', 'handleAddExpense:backend', new Error(String(result.error)));
      }

      setExpenseForm({
        vendor_name: '',
        concept: '',
        amount: '',
        category: 'other',
        due_date: new Date().toISOString().split('T')[0],
      });
      setShowExpenseForm(false);
      loadData();
      setRefreshKey((k) => k + 1);
    } catch (err) {
      reportError('doctor/finances', 'handleAddExpense', err);
    }
    setSavingExpense(false);
  };

  // ETAPA 1 NOTE: Delete expense is pending — no backend DELETE endpoint for
  // financial_transactions exists yet. The row is removed from local state only
  // for immediate UX feedback; it will reappear on next reload until the backend
  // exposes DELETE /api/finances/transactions/:id.
  const handleDeleteExpense = (id: string) => {
    setExpenses((prev) => prev.filter((e) => e.id !== id));
    setRefreshKey((k) => k + 1);
  };

  // #6 — Guardar ingreso extraordinario
  const handleAddIncome = async (e: React.FormEvent) => {
    e.preventDefault();
    setIncomeError('');
    if (!incomeForm.description || !incomeForm.amount) {
      setIncomeError('Descripción y monto son obligatorios.');
      return;
    }
    setSavingIncome(true);
    try {
      const result = await addIncome({
        description: incomeForm.description,
        amount: parseFloat(incomeForm.amount),
        currency: 'USD',
        conceptId: incomeForm.conceptId || undefined,
        date: incomeForm.date || undefined,
        // Asociación: consulta toma precedencia sobre paciente (regla de negocio del backend)
        relatedConsultationId: incomeForm.relatedConsultationId || null,
        patientId: incomeForm.relatedConsultationId ? null : incomeForm.patientId || null,
      });
      if (!result.success) {
        setIncomeError(result.error);
      } else {
        setIncomeForm({
          description: '',
          amount: '',
          conceptId: '',
          date: new Date().toISOString().split('T')[0],
          relatedConsultationId: '',
          patientId: '',
        });
        setShowIncomeModal(false);
        loadData();
        setRefreshKey((k) => k + 1);
      }
    } catch (err) {
      reportError('doctor/finances', 'handleAddIncome', err);
      setIncomeError('Ocurrió un error al registrar el ingreso.');
    }
    setSavingIncome(false);
  };

  // #7 — Guardar edición de transacción (gasto o ingreso manual)
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTx) return;
    setEditError('');
    if (!editingTx.description || !editingTx.amount) {
      setEditError('Descripción y monto son obligatorios.');
      return;
    }
    setSavingEdit(true);
    try {
      const result = await editTransaction({
        id: editingTx.id,
        description: editingTx.description,
        amount: parseFloat(editingTx.amount),
        transactionDate: editingTx.date || undefined,
        conceptId: editingTx.conceptId || null,
      });
      if (!result.success) {
        setEditError(result.error);
      } else {
        setEditingTx(null);
        loadData();
        setRefreshKey((k) => k + 1);
      }
    } catch (err) {
      reportError('doctor/finances', 'handleSaveEdit', err);
      setEditError('Ocurrió un error al guardar los cambios.');
    }
    setSavingEdit(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-teal-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0">
          <h1
            className="font-semibold tracking-tight"
            style={{
              fontFamily: 'var(--dh-font-display)',
              fontSize: 'clamp(22px, 3.2vw, 32px)',
              color: 'var(--dh-ink)',
            }}
          >
            Finanzas
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--dh-gray-600)' }}>
            Control de ingresos, gastos y balance del consultorio
          </p>
        </div>

        {/* View mode + Period nav */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
            {(['day', 'week', 'month'] as ViewMode[]).map((m) => (
              <button
                key={m}
                onClick={() => {
                  setViewMode(m);
                  // Cambio de modo resetea paginación (cambia el mes activo)
                  setIncPage(1);
                  setExpPage(1);
                }}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${viewMode === m ? 'bg-white text-teal-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                {m === 'day' ? 'Día' : m === 'week' ? 'Semana' : 'Mes'}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg hover:bg-slate-100">
              <ChevronLeft className="w-4 h-4 text-slate-500" />
            </button>
            <span className="text-xs font-semibold text-slate-700 min-w-[120px] text-center">
              {periodLabel()}
            </span>
            <button onClick={() => navigate(1)} className="p-1.5 rounded-lg hover:bg-slate-100">
              <ChevronRight className="w-4 h-4 text-slate-500" />
            </button>
          </div>
        </div>
      </div>

      {/* F3 (2026-04-29): tabs movidos arriba para que Reportería sea descubrible */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-1 bg-slate-100 p-1 rounded-lg overflow-x-auto max-w-full">
          {[
            { value: 'overview' as const, label: 'Resumen', icon: DollarSign },
            { value: 'income' as const, label: 'Ingresos', icon: TrendingUp },
            { value: 'expenses' as const, label: 'Gastos', icon: TrendingDown },
            { value: 'reports' as const, label: 'Reportería', icon: BarChart3 },
          ].map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.value}
                onClick={() => {
                  setTab(t.value);
                  // Reset paginación al cambiar de tab
                  setIncPage(1);
                  setExpPage(1);
                }}
                className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-md text-xs sm:text-sm font-medium transition-all whitespace-nowrap ${
                  tab === t.value
                    ? 'bg-white text-teal-600 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* #6 — Botón Registrar ingreso */}
          <button
            onClick={() => {
              setIncomeError('');
              setShowIncomeModal(true);
            }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-white text-sm font-semibold transition-all hover:opacity-90"
            style={{ background: 'linear-gradient(135deg, #00C4CC 0%, #0891b2 100%)' }}
          >
            <ArrowDownCircle className="w-4 h-4" /> Registrar ingreso
          </button>
          {tab !== 'reports' && (
            <button
              onClick={() => downloadCSV('all')}
              className="flex items-center gap-2 px-4 py-2 bg-teal-50 text-teal-700 border border-teal-200 rounded-lg text-sm font-semibold hover:bg-teal-100 transition-colors"
            >
              <Download className="w-4 h-4" /> Descargar (CSV)
            </button>
          )}
        </div>
      </div>

      {/* KPI Cards — visibles en overview/income/expenses (no en reports) */}
      {tab !== 'reports' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-emerald-600" />
              </div>
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                Ingresos
              </p>
            </div>
            <p className="text-2xl font-bold text-emerald-600">
              {formatUsd(filteredData.totalIncome)}
            </p>
            {bcvRate && (
              <p className="text-sm text-emerald-400 font-semibold">
                {toBs(filteredData.totalIncome)}
              </p>
            )}
            <p className="text-xs text-slate-400 mt-1">
              {filteredData.filteredIncomes.length} pagos aprobados
              {filteredData.filteredManual.length > 0 &&
                ` · ${filteredData.filteredManual.length} manuales`}
            </p>
          </div>
          {/* Por ingresar = cuentas por cobrar (pagos pendientes del período). */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
                <Clock className="w-5 h-5 text-amber-600" />
              </div>
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                Por ingresar
              </p>
            </div>
            <p className="text-2xl font-bold text-amber-600">
              {formatUsd(filteredData.pendingTotal)}
            </p>
            {bcvRate && (
              <p className="text-sm text-amber-400 font-semibold">
                {toBs(filteredData.pendingTotal)}
              </p>
            )}
            <p className="text-xs text-slate-400 mt-1">
              {filteredData.filteredPending.length} pagos pendientes
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
                <TrendingDown className="w-5 h-5 text-red-500" />
              </div>
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Gastos</p>
            </div>
            <p className="text-2xl font-bold text-red-500">
              {formatUsd(filteredData.totalExpenses)}
            </p>
            {bcvRate && (
              <p className="text-sm text-red-300 font-semibold">
                {toBs(filteredData.totalExpenses)}
              </p>
            )}
            <p className="text-xs text-slate-400 mt-1">
              {filteredData.filteredExpenses.length} gastos registrados
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <div className="flex items-center gap-3 mb-3">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center ${filteredData.balance >= 0 ? 'bg-teal-50' : 'bg-amber-50'}`}
              >
                <DollarSign
                  className={`w-5 h-5 ${filteredData.balance >= 0 ? 'text-teal-600' : 'text-amber-600'}`}
                />
              </div>
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Balance</p>
            </div>
            <p
              className={`text-2xl font-bold ${filteredData.balance >= 0 ? 'text-teal-600' : 'text-amber-600'}`}
            >
              {formatUsd(filteredData.balance)}
            </p>
            {bcvRate && (
              <p
                className={`text-sm font-semibold ${filteredData.balance >= 0 ? 'text-teal-400' : 'text-amber-400'}`}
              >
                {toBs(filteredData.balance)}
              </p>
            )}
            <p className="text-xs text-slate-400 mt-1">Ingresos - Gastos</p>
          </div>
        </div>
      )}

      {/* Chart — visible en overview/income (no en reports ni expenses) */}
      {tab !== 'reports' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center gap-3 mb-5 flex-wrap">
            <BarChart3 className="w-5 h-5 text-slate-400" />
            <h3 className="text-sm font-bold text-slate-700">Ingresos vs Gastos</h3>
          </div>
          {chartData.every((p) => p.income === 0 && p.expenses === 0) ? (
            <div className="flex items-center justify-center h-64 rounded-xl border border-dashed border-slate-200 text-sm text-slate-300">
              Sin datos en este período
            </div>
          ) : (
            <div className="w-full h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData.map((p) => ({
                    name: p.label,
                    ingresos: p.income,
                    egresos: p.expenses,
                  }))}
                  margin={{ top: 8, right: 8, bottom: 0, left: -16 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                  <RTooltip
                    formatter={(v) => `$${Number(v ?? 0).toFixed(2)}`}
                    contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="ingresos" name="Ingresos" fill="#10b981" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="egresos" name="Egresos" fill="#ef4444" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* F3 (2026-04-29): Reportería ahora vive en su propio tab para que sea
          descubrible. Antes estaba siempre visible pero buried bajo el chart. */}
      {tab === 'reports' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-teal-500" />
              <h3 className="text-sm font-bold text-slate-700">Reportería</h3>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Mes:</span>
              <select
                value={reportMonth}
                onChange={(e) => setReportMonth(e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm font-medium bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-200"
              >
                {monthOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* L7 KPI cards: consultas del mes / pacientes únicos / crecimiento MoM */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-9 h-9 rounded-xl bg-teal-50 flex items-center justify-center">
                  <ClipboardList className="w-4 h-4 text-teal-600" />
                </div>
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Consultas del mes
                </p>
              </div>
              <p className="text-2xl font-bold text-slate-900">{reportKpis.consultasMes}</p>
              <p className="text-xs text-slate-400 mt-1">
                {reportKpis.consultasAprobadas} aprobadas · {reportKpis.consultasPendientes}{' '}
                pendientes
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center">
                  <Users className="w-4 h-4 text-emerald-600" />
                </div>
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Pacientes únicos
                </p>
              </div>
              <p className="text-2xl font-bold text-slate-900">{reportKpis.pacientesUnicos}</p>
              <p className="text-xs text-slate-400 mt-1">En el mes</p>
            </div>
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-center gap-3 mb-2">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                    reportKpis.crecimientoMoM == null
                      ? 'bg-slate-50'
                      : reportKpis.crecimientoMoM >= 0
                        ? 'bg-emerald-50'
                        : 'bg-red-50'
                  }`}
                >
                  {reportKpis.crecimientoMoM == null ? (
                    <Activity className="w-4 h-4 text-slate-400" />
                  ) : reportKpis.crecimientoMoM >= 0 ? (
                    <TrendingUp className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <TrendingDown className="w-4 h-4 text-red-500" />
                  )}
                </div>
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Crecimiento MoM
                </p>
              </div>
              <p
                className={`text-2xl font-bold ${
                  reportKpis.crecimientoMoM == null
                    ? 'text-slate-400'
                    : reportKpis.crecimientoMoM >= 0
                      ? 'text-emerald-600'
                      : 'text-red-500'
                }`}
              >
                {reportKpis.crecimientoMoM == null
                  ? '—'
                  : `${reportKpis.crecimientoMoM >= 0 ? '+' : ''}${reportKpis.crecimientoMoM.toFixed(1)}%`}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                vs mes anterior ({reportKpis.consultasPrev})
              </p>
            </div>
          </div>

          {/* L7 chart Recharts: ingresos vs egresos últimos 6 meses */}
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
              Ingresos vs Egresos · últimos 6 meses
            </p>
            {reportChartData.every((p) => p.ingresos === 0 && p.egresos === 0) ? (
              <div className="flex items-center justify-center h-64 rounded-xl border border-dashed border-slate-200 text-sm text-slate-300">
                Sin datos para el período seleccionado
              </div>
            ) : (
              <div className="w-full h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={reportChartData}
                    margin={{ top: 8, right: 8, bottom: 0, left: -16 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                    <RTooltip
                      formatter={(v) => `$${Number(v ?? 0).toFixed(2)}`}
                      contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="ingresos" name="Ingresos" fill="#10b981" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="egresos" name="Egresos" fill="#ef4444" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* L7 cuadro descargable de consultas */}
          <div>
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Consultas del mes ({reportConsultations.length})
              </p>
              <button
                onClick={downloadConsultationsCSV}
                disabled={reportConsultations.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-teal-50 text-teal-700 border border-teal-200 rounded-lg text-xs font-semibold hover:bg-teal-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <FileSpreadsheet className="w-4 h-4" /> Descargar Excel (CSV)
              </button>
            </div>
            {reportConsultations.length === 0 ? (
              <div className="px-5 py-10 text-center text-slate-400 text-sm border border-dashed border-slate-200 rounded-xl">
                No hay consultas registradas en este mes
              </div>
            ) : (
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="text-left px-3 py-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                        Código
                      </th>
                      <th className="text-left px-3 py-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                        Fecha
                      </th>
                      <th className="text-left px-3 py-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                        Paciente
                      </th>
                      <th className="text-left px-3 py-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                        Status Cita
                      </th>
                      <th className="text-left px-3 py-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                        Status Consulta
                      </th>
                      <th className="text-left px-3 py-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                        Status Pago
                      </th>
                      <th className="text-left px-3 py-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                        Duración
                      </th>
                      <th className="text-right px-3 py-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                        Monto
                      </th>
                      <th className="text-left px-3 py-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                        Diagnóstico
                      </th>
                      <th className="text-right px-3 py-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                        Detalle
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {reportConsultations.slice(0, 50).map((r) => (
                      <tr
                        key={r.id}
                        className="hover:bg-teal-50/50 transition-colors cursor-pointer"
                        onClick={() => setDetailRow(r)}
                      >
                        <td className="px-3 py-2 text-xs font-mono text-slate-500">
                          {r.consultation_code || '—'}
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-600">
                          {r.consultation_date
                            ? new Date(r.consultation_date).toLocaleDateString('es-VE')
                            : '—'}
                        </td>
                        <td className="px-3 py-2 text-xs font-medium text-slate-800">
                          {r.patient_name}
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-600">
                          {apptStatusLabel(r.appointment_status)}
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-600">
                          {consultationStatusLabel(r.consultation_status)}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                              r.payment_status === 'approved'
                                ? 'bg-emerald-50 text-emerald-700'
                                : r.payment_status === 'pending'
                                  ? 'bg-amber-50 text-amber-700'
                                  : 'bg-slate-50 text-slate-500'
                            }`}
                          >
                            {paymentStatusLabel(r.payment_status)}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-600">
                          {formatDurationCell(r.duration_minutes)}
                        </td>
                        <td className="px-3 py-2 text-xs text-right font-semibold text-slate-700">
                          {r.amount_usd != null ? formatUsd(r.amount_usd) : '—'}
                        </td>
                        <td
                          className="px-3 py-2 text-xs text-slate-600 max-w-xs truncate"
                          title={r.diagnosis || ''}
                        >
                          {r.diagnosis || '—'}
                        </td>
                        <td className="px-3 py-2 text-xs text-right">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDetailRow(r);
                            }}
                            className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-md"
                          >
                            <Eye className="w-3 h-3" /> Ver
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {reportConsultations.length > 50 && (
                  <div className="px-3 py-2 text-[10px] text-slate-400 text-center bg-slate-50 border-t border-slate-100">
                    Mostrando 50 de {reportConsultations.length}. Descargá el CSV para verlas todas.
                  </div>
                )}
              </div>
            )}

            {/* Modal detalle completo de consulta */}
            {detailRow && (
              <ConsultationDetailModal
                row={detailRow}
                onClose={() => setDetailRow(null)}
                apptStatusLabel={apptStatusLabel}
                consultationStatusLabel={consultationStatusLabel}
                paymentStatusLabel={paymentStatusLabel}
                formatDurationCell={formatDurationCell}
              />
            )}
          </div>
        </div>
      )}

      {/* Income Table — Overview: legacy filtered list (primeros 5) */}
      {tab === 'overview' &&
        (() => {
          const tableIncomes = filteredData.filteredIncomes.slice(0, 5);
          const tableTotal = tableIncomes.reduce((s, i) => s + (i.amount_usd || 0), 0);

          return (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-700">Ingresos recientes</h3>
                  <button
                    onClick={() => downloadCSV('income')}
                    className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-teal-600 transition-colors"
                    title="Descargar CSV"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                </div>
                <button
                  onClick={() => {
                    setIncomeError('');
                    setShowIncomeModal(true);
                  }}
                  className="flex items-center gap-1.5 text-xs font-semibold text-teal-600 hover:text-teal-700 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Agregar ingreso
                </button>
              </div>

              {tableIncomes.length === 0 ? (
                <div className="px-5 py-10 text-center text-slate-400 text-sm">
                  No hay ingresos en este periodo
                </div>
              ) : (
                <div className="overflow-x-auto -mx-4 sm:mx-0">
                  <table className="w-full md:min-w-[500px]">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        <th className="text-left px-5 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                          Fecha
                        </th>
                        <th className="text-left px-5 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                          Consulta
                        </th>
                        <th className="text-left px-5 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                          Paciente
                        </th>
                        <th className="text-right px-5 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                          Monto USD
                        </th>
                        <th className="text-right px-5 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                          Monto Bs
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {tableIncomes.map((inc) => (
                        <tr key={inc.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-5 py-3 text-xs text-slate-600">
                            {new Date(inc.date).toLocaleDateString('es-VE')}
                          </td>
                          <td className="px-5 py-3 text-xs text-slate-600">
                            {inc.consultation_code || inc.payment_method || '—'}
                          </td>
                          <td className="px-5 py-3 text-sm font-medium text-slate-900">
                            {inc.patient_name}
                          </td>
                          <td className="px-5 py-3 text-sm font-bold text-emerald-600 text-right">
                            +{formatUsd(inc.amount_usd)}
                          </td>
                          <td className="px-5 py-3 text-xs text-slate-400 text-right">
                            {bcvRate ? toBs(inc.amount_usd || 0) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-emerald-50/50 border-t border-emerald-100">
                        <td colSpan={3} className="px-5 py-3 text-xs font-bold text-slate-700">
                          Total
                        </td>
                        <td className="px-5 py-3 text-sm font-bold text-emerald-600 text-right">
                          {formatUsd(tableTotal)}
                        </td>
                        <td className="px-5 py-3 text-xs font-bold text-slate-500 text-right">
                          {bcvRate ? toBs(tableTotal) : '—'}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          );
        })()}

      {/* Income Table — Tab Ingresos: paginación server-side */}
      {tab === 'income' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-700">
                Ingresos · {periodLabel()}
                {incTotal > 0 && (
                  <span className="ml-1.5 text-xs font-normal text-slate-400">
                    ({incTotal} total)
                  </span>
                )}
              </h3>
              <button
                onClick={() => downloadCSV('income')}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-teal-600 transition-colors"
                title="Descargar CSV del período"
              >
                <Download className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              {/* Filtros de fecha adicionales — aplica client-side sobre la página actual */}
              <div className="flex items-center gap-2 flex-wrap">
                <Calendar className="w-4 h-4 text-slate-400" />
                {/* F4: text-base evita zoom en iOS Safari */}
                <input
                  type="date"
                  value={incomeDateFrom}
                  onChange={(e) => setIncomeDateFrom(e.target.value)}
                  className="px-2 py-1.5 rounded-lg border border-slate-200 text-base sm:text-xs"
                />
                <span className="text-xs text-slate-400">a</span>
                <input
                  type="date"
                  value={incomeDateTo}
                  onChange={(e) => setIncomeDateTo(e.target.value)}
                  className="px-2 py-1.5 rounded-lg border border-slate-200 text-base sm:text-xs"
                />
                {(incomeDateFrom || incomeDateTo) && (
                  <button
                    onClick={() => {
                      setIncomeDateFrom('');
                      setIncomeDateTo('');
                    }}
                    className="text-xs text-teal-600 hover:text-teal-700 font-medium"
                  >
                    Limpiar
                  </button>
                )}
              </div>
              <button
                onClick={() => {
                  setIncomeError('');
                  setShowIncomeModal(true);
                }}
                className="flex items-center gap-1.5 text-xs font-semibold text-teal-600 hover:text-teal-700 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Agregar ingreso
              </button>
            </div>
          </div>

          {incLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-teal-500" />
            </div>
          ) : (
            (() => {
              // Filtrado client-side adicional (date range) sobre la página actual
              const displayItems = incPagedItems.filter((item) => {
                const d = parseDateLocal(item.date);
                if (incomeDateFrom && d < parseDateLocal(incomeDateFrom)) return false;
                if (incomeDateTo && d > parseDateLocal(incomeDateTo)) return false;
                return true;
              });
              const pageTotal = displayItems.reduce((s, i) => s + (i.amount_usd || 0), 0);

              return displayItems.length === 0 ? (
                <div className="px-5 py-10 text-center text-slate-400 text-sm">
                  No hay ingresos en este período
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto -mx-4 sm:mx-0">
                    <table className="w-full md:min-w-[600px]">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100">
                          <th className="text-left px-5 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                            Fecha
                          </th>
                          <th className="text-left px-5 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                            Paciente
                          </th>
                          <th className="text-left px-5 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                            Origen / Concepto
                          </th>
                          <th className="text-left px-5 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                            Estado
                          </th>
                          <th className="text-right px-5 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                            Monto USD
                          </th>
                          <th className="text-right px-5 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                            Monto Bs
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {displayItems.map((item) => (
                          <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-5 py-3 text-xs text-slate-600">
                              {new Intl.DateTimeFormat('es-VE', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              }).format(parseDateLocal(item.date))}
                            </td>
                            <td className="px-5 py-3 text-sm font-medium text-slate-900">
                              {item.patient_name ?? '—'}
                            </td>
                            <td className="px-5 py-3 text-xs text-slate-600">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold mr-1.5 ${
                                  item.source === 'consultation'
                                    ? 'bg-blue-50 text-blue-700'
                                    : 'bg-purple-50 text-purple-700'
                                }`}
                              >
                                {item.source === 'consultation' ? 'Consulta' : 'Manual'}
                              </span>
                              {item.concept ?? (item.reference ? `Ref: ${item.reference}` : '—')}
                            </td>
                            <td className="px-5 py-3 text-xs">
                              {item.status ? (
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                    item.status === 'approved'
                                      ? 'bg-emerald-50 text-emerald-700'
                                      : 'bg-amber-50 text-amber-700'
                                  }`}
                                >
                                  {item.status === 'approved' ? 'Aprobado' : 'Pendiente'}
                                </span>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                            <td className="px-5 py-3 text-sm font-bold text-emerald-600 text-right">
                              +{formatUsd(item.amount_usd)}
                            </td>
                            <td className="px-5 py-3 text-xs text-slate-400 text-right">
                              {bcvRate ? toBs(item.amount_usd) : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-emerald-50/50 border-t border-emerald-100">
                          <td colSpan={4} className="px-5 py-3 text-xs font-bold text-slate-700">
                            Total en esta página
                          </td>
                          <td className="px-5 py-3 text-sm font-bold text-emerald-600 text-right">
                            {formatUsd(pageTotal)}
                          </td>
                          <td className="px-5 py-3 text-xs font-bold text-slate-500 text-right">
                            {bcvRate ? toBs(pageTotal) : '—'}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  <Paginator
                    page={incPage}
                    pageSize={incPageSize}
                    total={incTotal}
                    onPageChange={(p) => setIncPage(p)}
                    onPageSizeChange={(s) => {
                      setIncPageSize(s);
                      setIncPage(1);
                    }}
                    pageSizeOptions={[10, 15, 20]}
                  />
                </>
              );
            })()
          )}
        </div>
      )}

      {/* #6 — Modal: Registrar ingreso extraordinario */}
      {showIncomeModal && (
        <IncomeModal
          concepts={incomeConcepts}
          consultations={consultationsRows}
          patients={patientsList}
          form={incomeForm}
          saving={savingIncome}
          error={incomeError}
          onChangeForm={setIncomeForm}
          onSubmit={handleAddIncome}
          onClose={() => setShowIncomeModal(false)}
          onCreateConcept={async (name) => {
            const res = await createIncomeConcept(name);
            if (res.success) {
              setIncomeConcepts((prev) => [...prev, res.data]);
              setIncomeForm((f) => ({ ...f, conceptId: res.data.id }));
            }
            return res;
          }}
          onUpdateConcept={async (id, patch) => {
            const res = await updateIncomeConcept(id, patch);
            if (res.success) {
              setIncomeConcepts((prev) => prev.map((c) => (c.id === id ? res.data : c)));
            }
            return res;
          }}
          onDeleteConcept={async (id) => {
            const res = await deleteIncomeConcept(id);
            if (res.success) {
              setIncomeConcepts((prev) => prev.filter((c) => c.id !== id));
              if (incomeForm.conceptId === id) {
                setIncomeForm((f) => ({ ...f, conceptId: '' }));
              }
            }
            return res;
          }}
        />
      )}

      {/* #7 — Modal: Editar transacción */}
      {editingTx && (
        <EditTransactionModal
          tx={editingTx}
          concepts={incomeConcepts}
          saving={savingEdit}
          error={editError}
          onChangeTx={setEditingTx}
          onSubmit={handleSaveEdit}
          onClose={() => setEditingTx(null)}
        />
      )}

      {/* Expenses Table — Overview: legacy filtered list (primeros 5) */}
      {tab === 'overview' &&
        (() => {
          const tableExpenses = filteredData.filteredExpenses.slice(0, 5);
          const tableTotal = tableExpenses.reduce((s, e) => s + (e.amount || 0), 0);

          return (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-700">Gastos recientes</h3>
                  <button
                    onClick={() => downloadCSV('expenses')}
                    className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-teal-600 transition-colors"
                    title="Descargar CSV"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                </div>
                <button
                  onClick={() => setShowExpenseForm(!showExpenseForm)}
                  className="flex items-center gap-1.5 text-xs font-semibold text-teal-600 hover:text-teal-700 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Agregar gasto
                </button>
              </div>

              {/* Add expense form */}
              {showExpenseForm && (
                <form
                  onSubmit={handleAddExpense}
                  className="px-5 py-4 bg-slate-50 border-b border-slate-100 space-y-3"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <select
                      value={expenseForm.category}
                      onChange={(e) => setExpenseForm((f) => ({ ...f, category: e.target.value }))}
                      className="px-3 py-2 rounded-lg border border-slate-200 text-sm"
                    >
                      {EXPENSE_CATEGORIES.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      placeholder="Concepto"
                      value={expenseForm.concept}
                      onChange={(e) => setExpenseForm((f) => ({ ...f, concept: e.target.value }))}
                      className="px-3 py-2 rounded-lg border border-slate-200 text-sm"
                    />
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Monto USD"
                      value={expenseForm.amount}
                      onChange={(e) => setExpenseForm((f) => ({ ...f, amount: e.target.value }))}
                      className="px-3 py-2 rounded-lg border border-slate-200 text-sm"
                    />
                    <input
                      type="date"
                      value={expenseForm.due_date}
                      onChange={(e) => setExpenseForm((f) => ({ ...f, due_date: e.target.value }))}
                      className="px-3 py-2 rounded-lg border border-slate-200 text-base sm:text-sm"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="submit"
                      disabled={savingExpense}
                      className="px-4 py-2 rounded-lg text-white text-xs font-semibold transition-all hover:opacity-90 disabled:opacity-50"
                      style={{ background: 'linear-gradient(135deg, #00C4CC 0%, #0891b2 100%)' }}
                    >
                      {savingExpense ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Guardar'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowExpenseForm(false)}
                      className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-500 hover:bg-slate-100"
                    >
                      Cancelar
                    </button>
                  </div>
                </form>
              )}

              {tableExpenses.length === 0 ? (
                <div className="px-5 py-10 text-center text-slate-400 text-sm">
                  No hay gastos en este periodo
                </div>
              ) : (
                <div className="overflow-x-auto -mx-4 sm:mx-0">
                  <table className="w-full md:min-w-[400px]">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        <th className="text-left px-5 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                          Fecha
                        </th>
                        <th className="text-left px-5 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                          Gasto
                        </th>
                        <th className="text-right px-5 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                          Monto USD
                        </th>
                        <th className="text-right px-5 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                          Monto Bs
                        </th>
                        <th className="w-16"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {tableExpenses.map((exp) => (
                        <tr key={exp.id} className="hover:bg-slate-50 transition-colors group">
                          <td className="px-5 py-3 text-xs text-slate-600">
                            {new Date(exp.due_date).toLocaleDateString('es-VE')}
                          </td>
                          <td className="px-5 py-3">
                            <p className="text-sm font-medium text-slate-900">{exp.concept}</p>
                            {exp.notes && (
                              <p className="text-[10px] text-slate-400">
                                {EXPENSE_CATEGORIES.find((c) => c.value === exp.notes)?.label ||
                                  exp.notes}
                              </p>
                            )}
                          </td>
                          <td className="px-5 py-3 text-sm font-bold text-red-500 text-right">
                            -{formatUsd(exp.amount)}
                          </td>
                          <td className="px-5 py-3 text-xs text-slate-400 text-right">
                            {bcvRate ? toBs(exp.amount || 0) : '—'}
                          </td>
                          <td className="px-2 py-3">
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                              <button
                                onClick={() => {
                                  setEditError('');
                                  setEditingTx({
                                    id: exp.id,
                                    type: 'expense',
                                    description: exp.concept,
                                    amount: String(exp.amount),
                                    date: exp.due_date,
                                    conceptId: '',
                                  });
                                }}
                                className="p-1 rounded-lg text-slate-300 hover:text-teal-600 hover:bg-teal-50"
                                title="Editar gasto"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteExpense(exp.id)}
                                className="p-1 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50"
                                title="Eliminar gasto"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-red-50/50 border-t border-red-100">
                        <td colSpan={2} className="px-5 py-3 text-xs font-bold text-slate-700">
                          Total
                        </td>
                        <td className="px-5 py-3 text-sm font-bold text-red-500 text-right">
                          -{formatUsd(tableTotal)}
                        </td>
                        <td className="px-5 py-3 text-xs font-bold text-slate-500 text-right">
                          {bcvRate ? toBs(tableTotal) : '—'}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          );
        })()}

      {/* Expenses Table — Tab Gastos: paginación server-side */}
      {tab === 'expenses' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-700">
                Gastos · {periodLabel()}
                {expTotal > 0 && (
                  <span className="ml-1.5 text-xs font-normal text-slate-400">
                    ({expTotal} total)
                  </span>
                )}
              </h3>
              <button
                onClick={() => downloadCSV('expenses')}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-teal-600 transition-colors"
                title="Descargar CSV del período"
              >
                <Download className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              {/* Filtros de fecha adicionales — aplica client-side sobre la página actual */}
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-slate-400" />
                {/* F4: text-base evita zoom en iOS Safari */}
                <input
                  type="date"
                  value={expenseDateFrom}
                  onChange={(e) => setExpenseDateFrom(e.target.value)}
                  className="px-2 py-1.5 rounded-lg border border-slate-200 text-base sm:text-xs"
                />
                <span className="text-xs text-slate-400">a</span>
                <input
                  type="date"
                  value={expenseDateTo}
                  onChange={(e) => setExpenseDateTo(e.target.value)}
                  className="px-2 py-1.5 rounded-lg border border-slate-200 text-base sm:text-xs"
                />
                {(expenseDateFrom || expenseDateTo) && (
                  <button
                    onClick={() => {
                      setExpenseDateFrom('');
                      setExpenseDateTo('');
                    }}
                    className="text-xs text-teal-600 hover:text-teal-700 font-medium"
                  >
                    Limpiar
                  </button>
                )}
              </div>
              <button
                onClick={() => setShowExpenseForm(!showExpenseForm)}
                className="flex items-center gap-1.5 text-xs font-semibold text-teal-600 hover:text-teal-700 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Agregar gasto
              </button>
            </div>
          </div>

          {/* Add expense form */}
          {showExpenseForm && (
            <form
              onSubmit={handleAddExpense}
              className="px-5 py-4 bg-slate-50 border-b border-slate-100 space-y-3"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <select
                  value={expenseForm.category}
                  onChange={(e) => setExpenseForm((f) => ({ ...f, category: e.target.value }))}
                  className="px-3 py-2 rounded-lg border border-slate-200 text-sm"
                >
                  {EXPENSE_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="Concepto"
                  value={expenseForm.concept}
                  onChange={(e) => setExpenseForm((f) => ({ ...f, concept: e.target.value }))}
                  className="px-3 py-2 rounded-lg border border-slate-200 text-sm"
                />
                <input
                  type="number"
                  step="0.01"
                  placeholder="Monto USD"
                  value={expenseForm.amount}
                  onChange={(e) => setExpenseForm((f) => ({ ...f, amount: e.target.value }))}
                  className="px-3 py-2 rounded-lg border border-slate-200 text-sm"
                />
                <input
                  type="date"
                  value={expenseForm.due_date}
                  onChange={(e) => setExpenseForm((f) => ({ ...f, due_date: e.target.value }))}
                  className="px-3 py-2 rounded-lg border border-slate-200 text-base sm:text-sm"
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={savingExpense}
                  className="px-4 py-2 rounded-lg text-white text-xs font-semibold transition-all hover:opacity-90 disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, #00C4CC 0%, #0891b2 100%)' }}
                >
                  {savingExpense ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Guardar'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowExpenseForm(false)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-500 hover:bg-slate-100"
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}

          {expLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-teal-500" />
            </div>
          ) : (
            (() => {
              // Filtrado client-side adicional (date range) sobre la página actual
              const displayItems = expPagedItems.filter((exp) => {
                const d = parseDateLocal(exp.due_date);
                if (expenseDateFrom && d < parseDateLocal(expenseDateFrom)) return false;
                if (expenseDateTo && d > parseDateLocal(expenseDateTo)) return false;
                return true;
              });
              const pageTotal = displayItems.reduce((s, e) => s + (e.amount || 0), 0);

              return displayItems.length === 0 ? (
                <div className="px-5 py-10 text-center text-slate-400 text-sm">
                  No hay gastos en este período
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto -mx-4 sm:mx-0">
                    <table className="w-full md:min-w-[400px]">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100">
                          <th className="text-left px-5 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                            Fecha
                          </th>
                          <th className="text-left px-5 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                            Gasto
                          </th>
                          <th className="text-right px-5 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                            Monto USD
                          </th>
                          <th className="text-right px-5 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                            Monto Bs
                          </th>
                          <th className="w-16"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {displayItems.map((exp) => (
                          <tr key={exp.id} className="hover:bg-slate-50 transition-colors group">
                            <td className="px-5 py-3 text-xs text-slate-600">
                              {new Intl.DateTimeFormat('es-VE', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              }).format(parseDateLocal(exp.due_date))}
                            </td>
                            <td className="px-5 py-3">
                              <p className="text-sm font-medium text-slate-900">{exp.concept}</p>
                              {exp.notes && (
                                <p className="text-[10px] text-slate-400">
                                  {EXPENSE_CATEGORIES.find((c) => c.value === exp.notes)?.label ||
                                    exp.notes}
                                </p>
                              )}
                            </td>
                            <td className="px-5 py-3 text-sm font-bold text-red-500 text-right">
                              -{formatUsd(exp.amount)}
                            </td>
                            <td className="px-5 py-3 text-xs text-slate-400 text-right">
                              {bcvRate ? toBs(exp.amount || 0) : '—'}
                            </td>
                            <td className="px-2 py-3">
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                {/* #7 — Editar gasto */}
                                <button
                                  onClick={() => {
                                    setEditError('');
                                    setEditingTx({
                                      id: exp.id,
                                      type: 'expense',
                                      description: exp.concept,
                                      amount: String(exp.amount),
                                      date: exp.due_date,
                                      conceptId: '',
                                    });
                                  }}
                                  className="p-1 rounded-lg text-slate-300 hover:text-teal-600 hover:bg-teal-50"
                                  title="Editar gasto"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDeleteExpense(exp.id)}
                                  className="p-1 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50"
                                  title="Eliminar gasto"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-red-50/50 border-t border-red-100">
                          <td colSpan={2} className="px-5 py-3 text-xs font-bold text-slate-700">
                            Total en esta página
                          </td>
                          <td className="px-5 py-3 text-sm font-bold text-red-500 text-right">
                            -{formatUsd(pageTotal)}
                          </td>
                          <td className="px-5 py-3 text-xs font-bold text-slate-500 text-right">
                            {bcvRate ? toBs(pageTotal) : '—'}
                          </td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  <Paginator
                    page={expPage}
                    pageSize={expPageSize}
                    total={expTotal}
                    onPageChange={(p) => setExpPage(p)}
                    onPageSizeChange={(s) => {
                      setExpPageSize(s);
                      setExpPage(1);
                    }}
                    pageSizeOptions={[10, 15, 20]}
                  />
                </>
              );
            })()
          )}
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// ConsultationDetailModal — Modal con TODA la información de una consulta
// (paciente, cita, pago, motivo, diagnóstico, tratamiento, prescripción,
// ejercicios, notas, bloques personalizados…). Inspirado en el "Order detail"
// de Stripe/Shopify: una vista que centraliza el contexto completo de la
// transacción, sin necesidad de navegar a múltiples pestañas.
// ════════════════════════════════════════════════════════════════════════════
function ConsultationDetailModal({
  row,
  onClose,
  apptStatusLabel,
  consultationStatusLabel,
  paymentStatusLabel,
  formatDurationCell,
}: {
  row: ConsultationRow;
  onClose: () => void;
  apptStatusLabel: (s: string | null) => string;
  consultationStatusLabel: (s: string | null) => string;
  paymentStatusLabel: (s: string | null) => string;
  formatDurationCell: (m: number | null | undefined) => string;
}) {
  // Helper: obtener valor del bloque desde blocks_data
  const getBlockValue = (key: string): string | null => {
    if (!row.blocks_data) return null;
    const v = (row.blocks_data as Record<string, unknown>)[key];
    if (!v) return null;
    if (typeof v === 'string') return v.trim() || null;
    if (Array.isArray(v)) return v.length > 0 ? v.join(' • ') : null;
    if (typeof v === 'object') {
      try {
        return JSON.stringify(v);
      } catch {
        return null;
      }
    }
    return String(v);
  };

  // Si hay snapshot, usamos ese orden; si no, una lista por defecto
  const printableBlocks =
    row.blocks_snapshot && row.blocks_snapshot.length > 0
      ? row.blocks_snapshot.filter((b) => b.printable !== false)
      : null;

  const apptDate = row.scheduled_at ? new Date(row.scheduled_at) : null;
  const consultDate = row.consultation_date ? new Date(row.consultation_date) : null;

  return (
    <div
      className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-3 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[92vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 sm:px-6 py-4 border-b border-slate-100 flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs text-slate-500">
                {row.consultation_code || '—'}
              </span>
              {row.appointment_status && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-bold uppercase tracking-wider">
                  Cita: {apptStatusLabel(row.appointment_status)}
                </span>
              )}
              {row.consultation_status && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-bold uppercase tracking-wider">
                  Consulta: {consultationStatusLabel(row.consultation_status)}
                </span>
              )}
              {row.payment_status && (
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                    row.payment_status === 'approved'
                      ? 'bg-emerald-50 text-emerald-700'
                      : row.payment_status === 'pending'
                        ? 'bg-amber-50 text-amber-700'
                        : 'bg-slate-50 text-slate-500'
                  }`}
                >
                  Pago: {paymentStatusLabel(row.payment_status)}
                </span>
              )}
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 mt-1.5">
              {row.patient_name}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-slate-100 rounded-lg shrink-0"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Body scroll */}
        <div className="overflow-y-auto px-4 sm:px-6 py-5 space-y-5 flex-1">
          {/* Sección 1: Datos del paciente */}
          <section>
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" /> Paciente
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs bg-slate-50 rounded-lg p-3">
              {row.patient_cedula && (
                <div>
                  <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold">
                    Cédula
                  </p>
                  <p className="text-slate-800 font-mono">{row.patient_cedula}</p>
                </div>
              )}
              {row.patient_phone && (
                <div>
                  <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold">
                    Teléfono
                  </p>
                  <p className="text-slate-800">{row.patient_phone}</p>
                </div>
              )}
              {row.patient_email && (
                <div className="col-span-2 sm:col-span-1">
                  <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold">
                    Email
                  </p>
                  <p className="text-slate-800 truncate">{row.patient_email}</p>
                </div>
              )}
              {!row.patient_cedula && !row.patient_phone && !row.patient_email && (
                <p className="text-slate-400 italic col-span-3">
                  Sin datos de contacto registrados.
                </p>
              )}
            </div>
          </section>

          {/* Sección 2: Detalle de la cita */}
          <section>
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" /> Cita
            </h3>
            <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 rounded-lg p-3">
              <div>
                <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold">
                  Fecha de la cita
                </p>
                <p className="text-slate-800">
                  {apptDate
                    ? apptDate.toLocaleDateString('es-VE', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })
                    : consultDate
                      ? consultDate.toLocaleDateString('es-VE', {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                        })
                      : '—'}
                </p>
              </div>
              <div>
                <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold">
                  Hora
                </p>
                <p className="text-slate-800">
                  {apptDate
                    ? apptDate.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })
                    : '—'}
                </p>
              </div>
              <div>
                <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold">
                  Modalidad
                </p>
                <p className="text-slate-800 capitalize">
                  {row.appointment_mode === 'online'
                    ? '🖥 Online'
                    : row.appointment_mode === 'in_person'
                      ? '🏥 Presencial'
                      : '—'}
                </p>
              </div>
              <div>
                <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold">
                  Duración
                </p>
                <p className="text-slate-800">{formatDurationCell(row.duration_minutes)}</p>
              </div>
              {row.plan_name && (
                <div className="col-span-2">
                  <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold">
                    Plan / Servicio
                  </p>
                  <p className="text-slate-800">{row.plan_name}</p>
                </div>
              )}
            </div>
          </section>

          {/* Sección 3: Pago */}
          <section>
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5" /> Pago
            </h3>
            <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 rounded-lg p-3">
              <div>
                <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold">
                  Monto
                </p>
                <p className="text-slate-800 font-bold text-base">
                  {row.amount_usd != null ? formatUsd(row.amount_usd) : '—'}
                </p>
              </div>
              <div>
                <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold">
                  Método
                </p>
                <p className="text-slate-800 capitalize">
                  {row.payment_method?.replace('_', ' ') || '—'}
                </p>
              </div>
              {row.payment_reference && (
                <div className="col-span-2">
                  <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold">
                    Referencia
                  </p>
                  <p className="text-slate-800 font-mono">{row.payment_reference}</p>
                </div>
              )}
            </div>
          </section>

          {/* Sección 4: Detalle clínico */}
          <section>
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Stethoscope className="w-3.5 h-3.5" /> Información clínica
            </h3>
            <div className="space-y-3 text-sm">
              {row.chief_complaint && (
                <DetailField
                  icon={<MessageCircle className="w-3.5 h-3.5 text-blue-500" />}
                  label="Motivo de consulta"
                  value={row.chief_complaint}
                />
              )}
              {row.diagnosis && (
                <DetailField
                  icon={<FileText className="w-3.5 h-3.5 text-purple-500" />}
                  label="Diagnóstico"
                  value={row.diagnosis}
                />
              )}
              {row.treatment && (
                <DetailField
                  icon={<Pill className="w-3.5 h-3.5 text-emerald-500" />}
                  label="Tratamiento"
                  value={row.treatment}
                />
              )}
              {row.notes && (
                <DetailField
                  icon={<FileText className="w-3.5 h-3.5 text-slate-500" />}
                  label="Notas / Informe"
                  value={row.notes}
                  richText
                />
              )}

              {/* Bloques dinámicos del snapshot — solo si hay extras además de los campos legacy */}
              {printableBlocks &&
                printableBlocks
                  .filter(
                    (b) =>
                      !['chief_complaint', 'diagnosis', 'treatment', 'notes', 'informe'].includes(
                        b.key,
                      ),
                  )
                  .map((b) => {
                    const value = getBlockValue(b.key);
                    if (!value) return null;
                    return (
                      <DetailField
                        key={b.key}
                        icon={<ClipboardList className="w-3.5 h-3.5 text-teal-500" />}
                        label={b.label}
                        value={value}
                      />
                    );
                  })}

              {!row.chief_complaint && !row.diagnosis && !row.treatment && !row.notes && (
                <div className="text-xs text-slate-400 italic px-3 py-4 bg-slate-50 rounded-lg text-center">
                  Esta consulta aún no tiene información clínica registrada.
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-2 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-200 rounded-lg"
          >
            Cerrar
          </button>
          <a
            href={`/doctor/consultations?open=${row.id}`}
            className="px-4 py-2 text-sm font-bold text-white bg-teal-500 hover:bg-teal-600 rounded-lg flex items-center gap-1.5"
          >
            <FileText className="w-4 h-4" /> Abrir consulta completa
          </a>
        </div>
      </div>
    </div>
  );
}

function DetailField({
  icon,
  label,
  value,
  richText,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  richText?: boolean;
}) {
  return (
    <div className="border border-slate-200 rounded-lg p-3 bg-white">
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
        {icon} {label}
      </p>
      {richText ? (
        <div
          className="text-sm text-slate-800 prose prose-sm max-w-none"
          dangerouslySetInnerHTML={{ __html: value }}
        />
      ) : (
        <p className="text-sm text-slate-800 whitespace-pre-wrap">{value}</p>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// #6 — IncomeModal
// Modal para registrar un ingreso extraordinario/manual.
// Incluye selector de concepto y mini-gestor inline (agregar/editar/eliminar).
// ════════════════════════════════════════════════════════════════════════════

type IncomeForm = {
  description: string;
  amount: string;
  conceptId: string;
  date: string;
  /** ID de consulta existente — si se elige, el paciente queda implícito */
  relatedConsultationId: string;
  /** ID de paciente directo — solo cuando no hay consulta asociada */
  patientId: string;
};

type ConceptManagerResult =
  | { success: true; data: IncomeConcept }
  | { success: false; error: string };

type SimpleActionResult = { success: true } | { success: false; error: string };

function IncomeModal({
  concepts,
  consultations,
  patients,
  form,
  saving,
  error,
  onChangeForm,
  onSubmit,
  onClose,
  onCreateConcept,
  onUpdateConcept,
  onDeleteConcept,
}: {
  concepts: IncomeConcept[];
  /** Consultas del doctor para asociar el ingreso a una consulta existente */
  consultations: ConsultationRow[];
  /** Lista de pacientes del doctor para asociación directa */
  patients: Patient[];
  form: IncomeForm;
  saving: boolean;
  error: string;
  onChangeForm: React.Dispatch<React.SetStateAction<IncomeForm>>;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
  onCreateConcept: (name: string) => Promise<ConceptManagerResult>;
  onUpdateConcept: (
    id: string,
    patch: { name?: string; isActive?: boolean },
  ) => Promise<ConceptManagerResult>;
  onDeleteConcept: (id: string) => Promise<SimpleActionResult>;
}) {
  const [showManager, setShowManager] = useState(false);
  const [newConceptName, setNewConceptName] = useState('');
  const [savingConcept, setSavingConcept] = useState(false);
  const [conceptError, setConceptError] = useState('');
  const [editingConceptId, setEditingConceptId] = useState<string | null>(null);
  const [editingConceptName, setEditingConceptName] = useState('');

  const handleCreateConcept = async () => {
    if (!newConceptName.trim()) return;
    setSavingConcept(true);
    setConceptError('');
    const res = await onCreateConcept(newConceptName.trim());
    if (!res.success) setConceptError(res.error);
    else setNewConceptName('');
    setSavingConcept(false);
  };

  const handleUpdateConcept = async (id: string) => {
    if (!editingConceptName.trim()) return;
    setSavingConcept(true);
    setConceptError('');
    const res = await onUpdateConcept(id, { name: editingConceptName.trim() });
    if (!res.success) setConceptError(res.error);
    else setEditingConceptId(null);
    setSavingConcept(false);
  };

  const handleDeleteConcept = async (id: string) => {
    setSavingConcept(true);
    setConceptError('');
    const res = await onDeleteConcept(id);
    if (!res.success) setConceptError(res.error);
    setSavingConcept(false);
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-3 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #00C4CC 0%, #0891b2 100%)' }}
            >
              <ArrowDownCircle className="w-4 h-4 text-white" />
            </div>
            <h2 className="text-base font-bold text-slate-800">Registrar ingreso</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-slate-100 rounded-lg"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={onSubmit} className="px-6 py-5 space-y-4">
          {/* Descripción */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
              Descripción <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="Ej. Consulta particular, honorarios, etc."
              value={form.description}
              onChange={(e) => onChangeForm((f) => ({ ...f, description: e.target.value }))}
              className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-200 focus:border-teal-300"
              required
            />
          </div>

          {/* Monto */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
              Monto (USD) <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">
                $
              </span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                value={form.amount}
                onChange={(e) => onChangeForm((f) => ({ ...f, amount: e.target.value }))}
                className="w-full pl-7 pr-3 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-200 focus:border-teal-300"
                required
              />
            </div>
          </div>

          {/* Fecha */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Fecha</label>
            <input
              type="date"
              value={form.date}
              onChange={(e) => onChangeForm((f) => ({ ...f, date: e.target.value }))}
              className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-200 focus:border-teal-300"
            />
          </div>

          {/* Asociación a consulta o paciente (opcional) */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
              Asociar a <span className="text-slate-400 font-normal">(opcional)</span>
            </label>
            {/* Si el doctor elige una consulta, el paciente queda implícito */}
            {consultations.length > 0 && (
              <div className="mb-2">
                <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold mb-1">
                  Consulta existente
                </p>
                <select
                  value={form.relatedConsultationId}
                  onChange={(e) =>
                    onChangeForm((f) => ({
                      ...f,
                      relatedConsultationId: e.target.value,
                      // Al elegir consulta, limpiar paciente directo
                      patientId: '',
                    }))
                  }
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-200 focus:border-teal-300"
                >
                  <option value="">— Sin consulta —</option>
                  {consultations
                    .filter((c) => c.consultation_date)
                    .slice(0, 50)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.consultation_code ? `[${c.consultation_code}] ` : ''}
                        {c.patient_name}
                        {c.consultation_date
                          ? ` · ${new Date(c.consultation_date).toLocaleDateString('es-VE')}`
                          : ''}
                      </option>
                    ))}
                </select>
                {form.relatedConsultationId && (
                  <p className="text-[10px] text-teal-600 mt-1 font-medium">
                    Paciente derivado de la consulta seleccionada
                  </p>
                )}
              </div>
            )}
            {/* Si no hay consulta, permitir asociar a un paciente directamente */}
            {!form.relatedConsultationId && patients.length > 0 && (
              <div>
                <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold mb-1">
                  Paciente directo
                </p>
                <select
                  value={form.patientId}
                  onChange={(e) => onChangeForm((f) => ({ ...f, patientId: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-200 focus:border-teal-300"
                >
                  <option value="">— Sin paciente —</option>
                  {patients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {consultations.length === 0 && patients.length === 0 && (
              <p className="text-xs text-slate-400 italic">
                Sin consultas ni pacientes registrados.
              </p>
            )}
          </div>

          {/* Concepto */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-slate-600">
                Concepto (opcional)
              </label>
              <button
                type="button"
                onClick={() => setShowManager((v) => !v)}
                className="text-[10px] font-bold text-teal-600 hover:text-teal-700"
              >
                {showManager ? 'Cerrar gestor' : 'Gestionar conceptos'}
              </button>
            </div>

            <select
              value={form.conceptId}
              onChange={(e) => onChangeForm((f) => ({ ...f, conceptId: e.target.value }))}
              className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-200 focus:border-teal-300"
            >
              <option value="">— Sin concepto —</option>
              {concepts
                .filter((c) => c.isActive)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>

            {/* Mini-gestor inline de conceptos */}
            {showManager && (
              <div className="mt-3 border border-slate-200 rounded-xl p-4 bg-slate-50 space-y-3">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Gestionar conceptos
                </p>

                {/* Lista */}
                <div className="space-y-1.5">
                  {concepts.length === 0 && (
                    <p className="text-xs text-slate-400 italic">No hay conceptos aún.</p>
                  )}
                  {concepts.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border border-slate-200"
                    >
                      {editingConceptId === c.id ? (
                        <>
                          <input
                            type="text"
                            value={editingConceptName}
                            onChange={(e) => setEditingConceptName(e.target.value)}
                            className="flex-1 text-xs px-2 py-1 rounded border border-slate-300 focus:outline-none focus:ring-1 focus:ring-teal-300"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => handleUpdateConcept(c.id)}
                            disabled={savingConcept}
                            className="p-1 rounded-md text-teal-600 hover:bg-teal-50"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingConceptId(null)}
                            className="p-1 rounded-md text-slate-400 hover:bg-slate-100"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </>
                      ) : (
                        <>
                          <span
                            className={`flex-1 text-xs font-medium ${c.isActive ? 'text-slate-800' : 'text-slate-400 line-through'}`}
                          >
                            {c.name}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingConceptId(c.id);
                              setEditingConceptName(c.name);
                            }}
                            className="p-1 rounded-md text-slate-300 hover:text-teal-600 hover:bg-teal-50"
                            title="Editar"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteConcept(c.id)}
                            disabled={savingConcept}
                            className="p-1 rounded-md text-slate-300 hover:text-red-500 hover:bg-red-50"
                            title="Eliminar"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </>
                      )}
                    </div>
                  ))}
                </div>

                {/* Agregar nuevo */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Nuevo concepto..."
                    value={newConceptName}
                    onChange={(e) => setNewConceptName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleCreateConcept();
                      }
                    }}
                    className="flex-1 text-xs px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-300"
                  />
                  <button
                    type="button"
                    onClick={handleCreateConcept}
                    disabled={savingConcept || !newConceptName.trim()}
                    className="px-3 py-2 rounded-lg text-xs font-bold text-white bg-teal-500 hover:bg-teal-600 disabled:opacity-50"
                  >
                    {savingConcept ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Plus className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>

                {conceptError && <p className="text-xs text-red-500 font-medium">{conceptError}</p>}
              </div>
            )}
          </div>

          {/* Error general */}
          {error && (
            <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200">
              <p className="text-xs text-red-600 font-medium">{error}</p>
            </div>
          )}

          {/* Acciones */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-lg text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
              style={{ background: 'linear-gradient(135deg, #00C4CC 0%, #0891b2 100%)' }}
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              Guardar ingreso
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// #7 — EditTransactionModal
// Modal de edición para una transacción financiera (gasto o ingreso manual).
// ════════════════════════════════════════════════════════════════════════════

type EditingTx = {
  id: string;
  type: 'expense' | 'manual_income';
  description: string;
  amount: string;
  date: string;
  conceptId: string;
};

function EditTransactionModal({
  tx,
  concepts,
  saving,
  error,
  onChangeTx,
  onSubmit,
  onClose,
}: {
  tx: EditingTx;
  concepts: IncomeConcept[];
  saving: boolean;
  error: string;
  onChangeTx: React.Dispatch<React.SetStateAction<EditingTx | null>>;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
}) {
  const isIncome = tx.type === 'manual_income';

  return (
    <div
      className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-3 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-md w-full"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
              <Pencil className="w-4 h-4 text-slate-600" />
            </div>
            <h2 className="text-base font-bold text-slate-800">
              Editar {isIncome ? 'ingreso' : 'gasto'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-slate-100 rounded-lg"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={onSubmit} className="px-6 py-5 space-y-4">
          {/* Descripción */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
              Descripción <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={tx.description}
              onChange={(e) =>
                onChangeTx((prev) => prev && { ...prev, description: e.target.value })
              }
              className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-200 focus:border-teal-300"
              required
            />
          </div>

          {/* Monto */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
              Monto (USD) <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">
                $
              </span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={tx.amount}
                onChange={(e) => onChangeTx((prev) => prev && { ...prev, amount: e.target.value })}
                className="w-full pl-7 pr-3 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-200 focus:border-teal-300"
                required
              />
            </div>
          </div>

          {/* Fecha */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Fecha</label>
            <input
              type="date"
              value={tx.date}
              onChange={(e) => onChangeTx((prev) => prev && { ...prev, date: e.target.value })}
              className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-200 focus:border-teal-300"
            />
          </div>

          {/* Concepto (solo para ingresos manuales) */}
          {isIncome && concepts.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                Concepto (opcional)
              </label>
              <select
                value={tx.conceptId}
                onChange={(e) =>
                  onChangeTx((prev) => prev && { ...prev, conceptId: e.target.value })
                }
                className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-200 focus:border-teal-300"
              >
                <option value="">— Sin concepto —</option>
                {concepts
                  .filter((c) => c.isActive)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200">
              <p className="text-xs text-red-600 font-medium">{error}</p>
            </div>
          )}

          {/* Acciones */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-lg text-sm font-semibold text-white bg-teal-500 hover:bg-teal-600 disabled:opacity-50 flex items-center gap-2"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              Guardar cambios
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
