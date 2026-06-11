import 'server-only';

/**
 * app/api/doctor/schedule/route.ts
 *
 * Thin-proxy → NestJS doctor-settings module.
 *
 * ETAPA 1 — migrated from Supabase direct access.
 *
 * Backend endpoints:
 *   GET /api/doctor/schedule → DoctorScheduleParams (camelCase)
 *   PUT /api/doctor/schedule → accepts UpdateDoctorScheduleDto (snake_case)
 *
 * Shape bridge:
 *   The legacy UI (agenda/page.tsx) expects:
 *     GET → { config: { slot_duration, buffer_minutes, advance_booking_days, auto_approve },
 *              slots: [{ day_of_week, start_time, end_time, is_enabled }],
 *              blocked: [] }
 *     POST body → { config, slots: [{ day_of_week, start_time, end_time, is_enabled }] }
 *
 *   The backend returns/accepts:
 *     GET → { workDays, startTime, endTime, slotDurationMinutes, breakStart, breakEnd }
 *     PUT → { work_days, start_time, end_time, slot_duration_minutes, break_start?, break_end? }
 *
 *   The mapping is done here so no UI changes are needed.
 *
 * DEFERRED — no backend equivalent (not breaking for UI — returns safe defaults):
 *   - advance_booking_days: backend does not persist this field yet (always returns 30)
 *   - auto_approve: backend does not persist this field yet (always returns false)
 *   - blocked dates: no /api/doctor/consultation-blocks-dates endpoint yet (returns [])
 *   - per-slot granularity: backend uses a single start+end window with a workDays array.
 *     The UI sends slots per day which are collapsed into the single global window on save.
 *     On GET the reverse mapping expands the global window into one slot entry per workDay.
 *
 * NOTE: The public booking flow (GET ?doctor_id=xxx) is not supported by the backend
 * in Etapa 1 — the backend /api/doctor/schedule always uses the authenticated doctor
 * (anti-IDOR). Public schedule reads should use the booking module in Fase 5.
 * The ?doctor_id query param is accepted but ignored in this proxy.
 */

import { NextRequest, NextResponse } from 'next/server';
import { backendGet, backendPut } from '@/lib/api-client.server';
import { log } from '@/lib/logger';

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// Backend response shape
// ---------------------------------------------------------------------------

interface BackendSchedule {
  workDays: number[];
  startTime: string;
  endTime: string;
  slotDurationMinutes: number;
  breakStart: string | null;
  breakEnd: string | null;
  bookingHorizonWeeks?: number | null;
}

// ---------------------------------------------------------------------------
// Legacy UI shapes
// ---------------------------------------------------------------------------

interface LegacyConfig {
  slot_duration: number;
  buffer_minutes: number;
  advance_booking_days: number;
  auto_approve: boolean;
  booking_horizon_weeks?: number | null;
}

interface LegacySlot {
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_enabled: boolean;
}

interface LegacyGetResponse {
  config: LegacyConfig;
  slots: LegacySlot[];
  blocked: never[];
  booking_horizon_weeks: number;
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

/**
 * Backend DoctorScheduleParams → legacy { config, slots, blocked }.
 *
 * Each workDay becomes one LegacySlot with the global startTime/endTime window.
 * buffer_minutes defaults to 0 (not in backend model). advance_booking_days
 * and auto_approve are not persisted by the backend — return safe defaults.
 */
function backendToLegacy(schedule: BackendSchedule): LegacyGetResponse {
  const config: LegacyConfig = {
    slot_duration: schedule.slotDurationMinutes,
    buffer_minutes: 0,
    advance_booking_days: 30,
    auto_approve: false,
    booking_horizon_weeks: schedule.bookingHorizonWeeks ?? 8,
  };

  const slots: LegacySlot[] = schedule.workDays.map((day) => ({
    day_of_week: day,
    start_time: schedule.startTime,
    end_time: schedule.endTime,
    is_enabled: true,
  }));

  return {
    config,
    slots,
    blocked: [],
    booking_horizon_weeks: schedule.bookingHorizonWeeks ?? 8,
  };
}

/**
 * Legacy POST body { config, slots } → backend UpdateDoctorScheduleDto.
 *
 * Collapses per-day slot granularity into a single global window:
 *   - work_days: unique day_of_week values from enabled slots
 *   - start_time: earliest start_time across enabled slots
 *   - end_time: latest end_time across enabled slots
 *   - slot_duration_minutes: from config.slot_duration (clamped to [10, 480])
 *
 * If no enabled slots, uses the backend default (Mon-Fri, 08:00-17:00, 30 min).
 */
function legacyToBackend(config: LegacyConfig, slots: LegacySlot[]): Record<string, unknown> {
  const enabled = slots.filter((s) => s.is_enabled !== false);

  const horizonWeeks =
    config.booking_horizon_weeks != null
      ? Math.max(1, Math.min(52, Math.round(config.booking_horizon_weeks)))
      : undefined;

  if (enabled.length === 0) {
    return {
      work_days: [1, 2, 3, 4, 5],
      start_time: '08:00',
      end_time: '17:00',
      slot_duration_minutes: config.slot_duration ?? 30,
      ...(horizonWeeks !== undefined ? { booking_horizon_weeks: horizonWeeks } : {}),
    };
  }

  const workDays = [...new Set(enabled.map((s) => s.day_of_week))].sort((a, b) => a - b);

  // Earliest start and latest end across all enabled slots
  const startTime = enabled.reduce(
    (min, s) => (s.start_time < min ? s.start_time : min),
    enabled[0]!.start_time,
  );
  const endTime = enabled.reduce(
    (max, s) => (s.end_time > max ? s.end_time : max),
    enabled[0]!.end_time,
  );

  const slotDuration = Math.max(10, Math.min(480, config.slot_duration ?? 30));

  return {
    work_days: workDays,
    start_time: startTime,
    end_time: endTime,
    slot_duration_minutes: slotDuration,
    ...(horizonWeeks !== undefined ? { booking_horizon_weeks: horizonWeeks } : {}),
  };
}

// ---------------------------------------------------------------------------
// GET /api/doctor/schedule
//
// ?doctor_id query param is accepted for backward compat but ignored —
// the backend resolves the schedule from the authenticated user's identity.
// ---------------------------------------------------------------------------

export async function GET(_req: NextRequest): Promise<NextResponse> {
  const result = await backendGet<BackendSchedule>('/api/doctor/schedule');

  if (!result.ok) {
    log.error('[schedule GET] backend error', {
      code: result.error.code,
      status: result.error.status,
    });
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
  }

  return NextResponse.json(backendToLegacy(result.value));
}

// ---------------------------------------------------------------------------
// POST /api/doctor/schedule — legacy consumers POST, backend uses PUT
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: { config?: LegacyConfig; slots?: LegacySlot[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 });
  }

  const config: LegacyConfig = body.config ?? {
    slot_duration: 30,
    buffer_minutes: 0,
    advance_booking_days: 30,
    auto_approve: false,
  };
  const slots: LegacySlot[] = Array.isArray(body.slots) ? body.slots : [];

  const backendBody = legacyToBackend(config, slots);

  const result = await backendPut<BackendSchedule>('/api/doctor/schedule', backendBody);

  if (!result.ok) {
    log.error('[schedule POST] backend error', {
      code: result.error.code,
      status: result.error.status,
    });
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
  }

  return NextResponse.json({ success: true });
}
