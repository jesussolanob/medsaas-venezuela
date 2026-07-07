import BookingClient from './BookingClient';
import { AlertCircle } from 'lucide-react';

// Backend booking endpoints are public (no auth required).
// We call them directly from the server component without dev-auth headers.
const BACKEND_URL = process.env.BACKEND_INTERNAL_URL ?? 'http://localhost:3001';

/**
 * Minimal public fetch helper for booking endpoints — no auth headers needed
 * since the booking controller is explicitly public (@Public() / no guard).
 */
async function publicFetch<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${BACKEND_URL}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      // Booking info can be cached briefly; slots should stay fresh.
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { success: boolean; data: T };
    return json.data ?? null;
  } catch {
    return null;
  }
}

interface DoctorInfo {
  id: string;
  fullName: string;
  specialty: string | null;
  professionalTitle: string | null;
  paymentMethods: string[] | null;
  allowsOnline: boolean | null;
  officeAddress: string | null;
  city: string | null;
  avatarUrl: string | null;
  isActive: boolean | null;
  // Extended fields returned by the backend (may be absent in older versions)
  state?: string | null;
  country?: string | null;
  phone?: string | null;
  paymentDetails?: Record<string, unknown> | null;
  // Fase 5 — horizonte de booking en semanas (default 8 si no viene)
  bookingHorizonWeeks?: number | null;
  // Gating por plan: el booking online solo está disponible si el plan del doctor
  // habilita la feature `booking` (Delta Base+). Delta Free → false.
  bookingEnabled?: boolean | null;
  // Configuración de restricciones de booking
  requireReason?: boolean | null;
  minLeadDays?: number | null;
}

interface PricingPlan {
  id: string;
  name: string;
  priceUsd: number;
  durationMinutes: number;
  sessionsCount?: number;
  description?: string | null;
}

interface BookedSlotRow {
  scheduledAt: string;
}

interface DoctorOfficeRaw {
  id: string;
  name: string;
  address: string;
  city: string;
  phone: string;
  schedule: { day: number; enabled: boolean; start: string; end: string }[];
  slotDuration: number;
  bufferMinutes: number;
  modality?: 'in_person' | 'online' | 'both';
  allowsOnline?: boolean;
}

// Server Component — fetches doctor data from the NestJS backend (public endpoints).
export default async function PublicBookingPage({
  params,
}: {
  params: Promise<{ doctorId: string }>;
}) {
  const { doctorId } = await params;

  // Fetch doctor info, plans, and offices in parallel.
  const [doctorInfo, plans, officesRaw] = await Promise.all([
    publicFetch<DoctorInfo>(`/api/booking/${doctorId}/info`),
    publicFetch<PricingPlan[]>(`/api/booking/${doctorId}/plans`),
    publicFetch<DoctorOfficeRaw[]>(`/api/booking/${doctorId}/offices`),
  ]);

  if (!doctorInfo) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-slate-300" />
          </div>
          <h2 className="text-lg font-bold text-slate-700">Médico no encontrado</h2>
          <p className="text-sm text-slate-400 mt-2">
            El link de booking no es válido o el médico ya no está disponible.
          </p>
          <p className="text-xs text-slate-300 mt-4 font-mono break-all">ID: {doctorId}</p>
        </div>
      </div>
    );
  }

  // Gating por plan: si el plan del doctor NO habilita booking online (ej. Delta Free),
  // no se permite reservar — ni aunque alguien tenga el link. El backend es la fuente de
  // verdad (también rechaza el POST); acá mostramos un estado amigable.
  if (doctorInfo.bookingEnabled === false) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-slate-300" />
          </div>
          <h2 className="text-lg font-bold text-slate-700">Reservas en línea no disponibles</h2>
          <p className="text-sm text-slate-400 mt-2">
            Este profesional no tiene habilitada la reserva de citas en línea. Por favor contáctalo
            directamente para agendar.
          </p>
        </div>
      </div>
    );
  }

  // Normalize backend camelCase → BookingClient snake_case prop shape.
  // Sin fallback: si el doctor no tiene planes, NO se inventa uno por defecto.
  const activePlans = (plans ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    price_usd: p.priceUsd,
    duration_minutes: p.durationMinutes,
    sessions_count: p.sessionsCount ?? 1,
    description: p.description ?? null,
  }));

  // Sin planes activos no hay nada que reservar → estado amigable en vez de
  // mostrar un plan inventado.
  if (activePlans.length === 0) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-slate-300" />
          </div>
          <h2 className="text-lg font-bold text-slate-700">Reservas no disponibles</h2>
          <p className="text-sm text-slate-400 mt-2">
            Este profesional aún no tiene servicios configurados para agendar en línea. Por favor
            contáctalo directamente.
          </p>
        </div>
      </div>
    );
  }

  // Booked slots: fetched client-side per date via /api/booking/:doctorId/slots
  // to keep the server payload small. Passing empty array here so BookingClient
  // can lazy-load per-date availability when the user picks a date.
  const bookedSlots: string[] = [];

  // Normalize backend camelCase offices → BookingClient snake_case shape.
  const offices =
    officesRaw && officesRaw.length > 0
      ? officesRaw.map((o) => ({
          id: o.id,
          name: o.name,
          address: o.address,
          city: o.city,
          phone: o.phone,
          schedule: o.schedule ?? [],
          slot_duration: o.slotDuration ?? 30,
          buffer_minutes: o.bufferMinutes ?? 0,
          modality: o.modality ?? 'in_person',
        }))
      : [];

  // paymentMethods and paymentDetails come from doctorInfo (backend includes them).
  const paymentMethods = doctorInfo.paymentMethods ?? [];
  const paymentDetails = (doctorInfo.paymentDetails ?? {}) as Record<
    string,
    Record<string, string>
  >;

  // Horizonte de booking: número de semanas a mostrar en el selector de fechas.
  // Default 8 semanas si el backend no lo devuelve (backwards-compatible).
  const bookingHorizonWeeks =
    typeof doctorInfo.bookingHorizonWeeks === 'number' && doctorInfo.bookingHorizonWeeks >= 1
      ? doctorInfo.bookingHorizonWeeks
      : 8;

  return (
    <BookingClient
      doctor={{
        id: doctorInfo.id,
        full_name: doctorInfo.fullName,
        specialty: doctorInfo.specialty ?? '',
        phone: doctorInfo.phone ?? '',
        avatar_url: doctorInfo.avatarUrl ?? null,
        professional_title: doctorInfo.professionalTitle ?? 'Dr.',
        state: doctorInfo.state ?? null,
        city: doctorInfo.city ?? null,
        country: doctorInfo.country ?? 'Venezuela',
        office_address: doctorInfo.officeAddress ?? null,
        allows_online: doctorInfo.allowsOnline ?? true,
      }}
      plans={activePlans}
      paymentMethods={paymentMethods}
      paymentDetails={paymentDetails}
      bookedSlots={bookedSlots}
      bookingHorizonWeeks={bookingHorizonWeeks}
      initialOffices={offices}
      requireReason={doctorInfo.requireReason ?? false}
      minLeadDays={doctorInfo.minLeadDays ?? 0}
    />
  );
}
