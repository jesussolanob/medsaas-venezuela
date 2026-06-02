import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { DevAuthGuard } from '../../../../infrastructure/auth/dev-auth.guard';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../../../presentation/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../../../presentation/pipes/zod-validation.pipe';

import { GetPatientDashboardUseCase } from '../../application/use-cases/patient-portal/get-patient-dashboard.use-case';
import { GetPatientAppointmentsUseCase } from '../../application/use-cases/patient-portal/get-patient-appointments.use-case';
import { GetPatientPackagesUseCase } from '../../application/use-cases/patient-portal/get-patient-packages.use-case';
import { GetPatientPrescriptionsUseCase } from '../../application/use-cases/patient-portal/get-patient-prescriptions.use-case';
import { GetPatientMessagesUseCase } from '../../application/use-cases/patient-portal/get-patient-messages.use-case';
import { SendPatientMessageUseCase } from '../../application/use-cases/patient-portal/send-patient-message.use-case';
import { GetPatientProfileUseCase } from '../../application/use-cases/patient-portal/get-patient-profile.use-case';
import { UpdatePatientProfileUseCase } from '../../application/use-cases/patient-portal/update-patient-profile.use-case';
import type {
  PatientDashboard,
  PackageSummary,
} from '../../domain/entities/patient-dashboard.entity';
import type { PatientMessageRow } from '../../domain/repositories/patient-portal.repository';

// ---------------------------------------------------------------------------
// Response shapes — one explicit interface per endpoint
// ---------------------------------------------------------------------------

interface DashboardResponse {
  success: true;
  data: PatientDashboard;
}

interface AppointmentItem {
  id: string;
  doctorId: string;
  scheduledAt: Date;
  status: string;
  appointmentMode: string;
  planName: string | null;
  planPrice: number | null;
  paymentMethod: string | null;
  chiefComplaint: string | null;
  appointmentCode: string | null;
  packageId: string | null;
  sessionNumber: number | null;
  createdAt: Date;
}

interface AppointmentsResponse {
  success: true;
  data: AppointmentItem[];
  meta: { total: number; page: number; limit: number };
}

interface PackagesResponse {
  success: true;
  data: PackageSummary[];
}

interface PrescriptionItem {
  id: string;
  patientId: string | null;
  doctorId: string;
  consultationId: string | null;
  medication: string;
  dosage: string | null;
  frequency: string | null;
  duration: string | null;
  notes: string | null;
  createdAt: Date;
}

interface PrescriptionsResponse {
  success: true;
  data: PrescriptionItem[];
}

interface MessagesResponse {
  success: true;
  data: PatientMessageRow[];
}

interface SendMessageResponse {
  success: true;
  data: PatientMessageRow;
}

interface ProfileItem {
  id: string;
  doctorId: string;
  fullName: string;
  cedula: string | null;
  phone: string | null;
  email: string | null;
  birthDate: string | null;
  sex: 'male' | 'female' | 'other' | null;
  bloodType: string | null;
  allergies: string | null;
  chronicConditions: string | null;
  address: string | null;
  city: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  notes: string | null;
  createdAt: Date;
}

interface ProfileResponse {
  success: true;
  data: ProfileItem[];
}

interface UpdateProfileItem {
  id: string;
  doctorId: string;
  fullName: string;
  address: string | null;
  city: string | null;
  notes: string | null;
  updatedAt: Date;
}

interface UpdateProfileResponse {
  success: true;
  data: UpdateProfileItem;
}

// ---------------------------------------------------------------------------
// Zod body schemas — inline for YAGNI; promote to @delta/shared-types when
// the frontend starts consuming these endpoints.
// TODO: promover a @delta/shared-types cuando el frontend los consuma.
// ---------------------------------------------------------------------------

const SendMessageBodySchema = z.object({
  doctor_id: z.string().uuid('doctor_id must be a valid UUID'),
  body: z.string().min(1, 'body is required').max(5000, 'body must be at most 5000 characters'),
});
type SendMessageBody = z.infer<typeof SendMessageBodySchema>;

const UpdateProfileBodySchema = z.object({
  patient_id: z.string().uuid('patient_id must be a valid UUID'),
  address: z.string().max(500).nullish(),
  city: z.string().max(200).nullish(),
  notes: z.string().max(2000).nullish(),
});
type UpdateProfileBody = z.infer<typeof UpdateProfileBodySchema>;

/**
 * Patient portal controller.
 *
 * Global prefix 'api' is set in main.ts.
 * All endpoints require DevAuthGuard (Etapa 1 only).
 *
 * CRITICAL SECURITY RULE: every endpoint derives the access scope from
 * user.sub (authUserId from DevAuthGuard), never from path params or body.
 * Path params are used only as secondary filters — the repository always
 * enforces the auth_user_id scope first.
 *
 * DEFERRED (TODO: implement when ready):
 *   - GET /patient/prescriptions/:id/pdf — requires doctor_templates + PDF generation
 *   - GET /patient/reports — clinical data exposure requires product decision
 */
@Controller('patient')
@UseGuards(DevAuthGuard)
export class PatientController {
  constructor(
    private readonly getDashboard: GetPatientDashboardUseCase,
    private readonly getAppointments: GetPatientAppointmentsUseCase,
    private readonly getPackages: GetPatientPackagesUseCase,
    private readonly getPrescriptions: GetPatientPrescriptionsUseCase,
    private readonly getMessages: GetPatientMessagesUseCase,
    private readonly sendMessage: SendPatientMessageUseCase,
    private readonly getProfile: GetPatientProfileUseCase,
    private readonly updateProfile: UpdatePatientProfileUseCase,
  ) {}

  /**
   * GET /api/patient/dashboard
   * Returns the patient's next upcoming appointment, active packages, and total appointment count.
   */
  @Get('dashboard')
  async dashboard(@CurrentUser() user: CurrentUserPayload): Promise<DashboardResponse> {
    const result = await this.getDashboard.execute({ authUserId: user.sub });
    return { success: true, data: result };
  }

  /**
   * GET /api/patient/appointments
   * Returns the patient's appointment history, paginated, newest first.
   */
  @Get('appointments')
  async appointments(
    @CurrentUser() user: CurrentUserPayload,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ): Promise<AppointmentsResponse> {
    const parsedPage = Math.max(1, parseInt(page, 10) || 1);
    const parsedLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const result = await this.getAppointments.execute({
      authUserId: user.sub,
      page: parsedPage,
      limit: parsedLimit,
    });

    // Strip desnormalized contact fields (patientName, patientPhone, etc.) from
    // the patient-facing response. Those are booking snapshots written by the
    // doctor's side and may be stale. The patient's canonical contact data
    // lives in GET /patient/profile.
    const items: AppointmentItem[] = result.items.map((appt) => ({
      id: appt.id,
      doctorId: appt.doctorId,
      scheduledAt: appt.scheduledAt,
      status: appt.status,
      appointmentMode: appt.appointmentMode,
      planName: appt.planName,
      planPrice: appt.planPrice,
      paymentMethod: appt.paymentMethod,
      chiefComplaint: appt.chiefComplaint,
      appointmentCode: appt.appointmentCode,
      packageId: appt.packageId,
      sessionNumber: appt.sessionNumber,
      createdAt: appt.createdAt,
    }));

    return {
      success: true,
      data: items,
      meta: { total: result.total, page: result.page, limit: result.limit },
    };
  }

  /**
   * GET /api/patient/packages
   * Returns the patient's packages with doctor info. Use ?status=active to filter.
   */
  @Get('packages')
  async packages(
    @CurrentUser() user: CurrentUserPayload,
    @Query('status') status?: string,
  ): Promise<PackagesResponse> {
    const result = await this.getPackages.execute({
      authUserId: user.sub,
      onlyActive: status === 'active',
    });
    return { success: true, data: result };
  }

  /**
   * GET /api/patient/prescriptions
   * Returns the patient's prescriptions with medication and dosage decrypted.
   *
   * TODO: GET /api/patient/prescriptions/:id/pdf — deferred (requires doctor_templates + PDF service)
   */
  @Get('prescriptions')
  async prescriptions(@CurrentUser() user: CurrentUserPayload): Promise<PrescriptionsResponse> {
    const result = await this.getPrescriptions.execute({ authUserId: user.sub });
    // Map to safe output — never log or include raw PHI in logs
    const output: PrescriptionItem[] = result.map((rx) => ({
      id: rx.id,
      patientId: rx.patientId,
      doctorId: rx.doctorId,
      consultationId: rx.consultationId,
      medication: rx.medication,
      dosage: rx.dosage,
      frequency: rx.frequency,
      duration: rx.duration,
      notes: rx.notes,
      createdAt: rx.createdAt,
    }));
    return { success: true, data: output };
  }

  /**
   * GET /api/patient/messages
   * Returns the patient's messages in chronological order.
   * Optionally filter by doctor: ?doctor_id=<uuid>
   *
   * The doctor_id query param is validated as a UUID before use. It is a safe
   * additional filter — messages are already scoped by the patient's own
   * patient_id(s), so a non-matching doctor_id simply returns an empty list.
   *
   * TODO: GET /api/patient/reports — deferred (clinical data exposure = product decision)
   */
  @Get('messages')
  async messages(
    @CurrentUser() user: CurrentUserPayload,
    @Query('doctor_id') doctorId?: string,
  ): Promise<MessagesResponse> {
    // Validate the optional doctor_id to fail fast on malformed input.
    // Security note: even without this check there is no SQLi (prepared stmt)
    // and no cross-patient leak (messages are scoped by own patientIds). This
    // improves the API surface and gives callers a clear error on bad input.
    let validatedDoctorId: string | undefined;
    if (doctorId !== undefined) {
      if (!z.string().uuid().safeParse(doctorId).success) {
        throw new BadRequestException('doctor_id must be a valid UUID');
      }
      validatedDoctorId = doctorId;
    }

    const result = await this.getMessages.execute({
      authUserId: user.sub,
      doctorId: validatedDoctorId,
    });
    return { success: true, data: result };
  }

  /**
   * POST /api/patient/messages
   * Sends a patient_to_doctor message.
   * Body: { doctor_id: uuid, body: string }
   */
  @Post('messages')
  async sendMsg(
    @Body(new ZodValidationPipe(SendMessageBodySchema)) dto: SendMessageBody,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SendMessageResponse> {
    const result = await this.sendMessage.execute({
      authUserId: user.sub,
      doctorId: dto.doctor_id,
      body: dto.body,
    });
    return { success: true, data: result };
  }

  /**
   * GET /api/patient/profile
   * Returns all patient records linked to the authenticated auth_user_id.
   */
  @Get('profile')
  async profile(@CurrentUser() user: CurrentUserPayload): Promise<ProfileResponse> {
    const patients = await this.getProfile.execute({ authUserId: user.sub });
    // Map to safe output — includes decrypted PHI that belongs to the patient themselves
    const output: ProfileItem[] = patients.map((p) => ({
      id: p.id,
      doctorId: p.doctorId,
      fullName: p.fullName,
      cedula: p.cedula,
      phone: p.phone,
      email: p.email,
      birthDate: p.birthDate,
      sex: p.sex,
      bloodType: p.bloodType,
      allergies: p.allergies,
      chronicConditions: p.chronicConditions,
      address: p.address,
      city: p.city,
      emergencyContactName: p.emergencyContactName,
      emergencyContactPhone: p.emergencyContactPhone,
      notes: p.notes,
      createdAt: p.createdAt,
    }));
    return { success: true, data: output };
  }

  /**
   * PUT /api/patient/profile
   * Updates non-PHI fields of a patient record. Scoped to authUserId.
   * Body: { patient_id: uuid, address?: string, city?: string, notes?: string }
   */
  @Put('profile')
  async updateProfileEndpoint(
    @Body(new ZodValidationPipe(UpdateProfileBodySchema)) dto: UpdateProfileBody,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<UpdateProfileResponse> {
    const patient = await this.updateProfile.execute({
      authUserId: user.sub,
      patientId: dto.patient_id,
      address: dto.address ?? null,
      city: dto.city ?? null,
      notes: dto.notes ?? null,
    });
    return {
      success: true,
      data: {
        id: patient.id,
        doctorId: patient.doctorId,
        fullName: patient.fullName,
        address: patient.address,
        city: patient.city,
        notes: patient.notes,
        updatedAt: patient.updatedAt,
      },
    };
  }
}
