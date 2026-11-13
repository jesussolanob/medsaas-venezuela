import { ApprovePaymentWithExtrasUseCase } from './approve-payment-with-extras.use-case';
import type { IConsultationRepository } from '../../../domain/repositories/consultation.repository';
import { Consultation } from '../../../domain/entities/consultation.entity';
import { ConsultationAmountRequiredError } from '../../../domain/errors/consultation-amount-required.error';
import { ConsultationNotFoundError } from '../../../domain/errors/consultation-not-found.error';
import { ConsultationNotOwnedError } from '../../../domain/errors/consultation-not-owned.error';
import { PaymentMethodRequiredError } from '../../../domain/errors/payment-method-required.error';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const OTHER_DOCTOR_ID = 'eeeeeeee-0000-0000-0000-000000000002';
const PATIENT_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const CONSULTATION_ID = 'cccccccc-0000-0000-0000-000000000001';
const now = new Date('2026-07-12T00:00:00Z');

function makeConsultation(
  overrides: Partial<ConstructorParameters<typeof Consultation>[0]> = {},
): Consultation {
  return Consultation.create({
    id: CONSULTATION_ID,
    doctorId: DOCTOR_ID,
    patientId: PATIENT_ID,
    consultationCode: 'DLT-202607-0001',
    consultationDate: now,
    paymentStatus: 'pending',
    amount: 30,
    baseAmount: null,
    createdAt: now,
    updatedAt: now,
    extraItems: [],
    ...overrides,
  });
}

describe('ApprovePaymentWithExtrasUseCase', () => {
  let useCase: ApprovePaymentWithExtrasUseCase;
  let mockRepo: jest.Mocked<IConsultationRepository>;

  beforeEach(() => {
    mockRepo = {
      findById: jest.fn(),
      findByCode: jest.fn(),
      countByDoctorAndMonth: jest.fn(),
      getMaxSequenceForMonth: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      updatePayment: jest.fn(),
      updatePaymentDetails: jest.fn(),
      approveWithExtras: jest.fn(),
      findExtraItems: jest.fn(),
      list: jest.fn(),
      findByPatient: jest.fn(),
      findByAppointmentId: jest.fn(),
      deleteById: jest.fn().mockResolvedValue(undefined),
      listWithAppointment: jest.fn(),
      applyNoShowFee: jest.fn(),
    };
    useCase = new ApprovePaymentWithExtrasUseCase(mockRepo);
  });

  it('approves with no extras — delegates to approveWithExtras with empty array', async () => {
    const pending = makeConsultation({ paymentStatus: 'pending' });
    const approved = makeConsultation({
      paymentStatus: 'approved',
      amount: 30,
      baseAmount: 30,
      paymentMethod: 'zelle',
    });
    mockRepo.findById.mockResolvedValue(pending);
    mockRepo.approveWithExtras.mockResolvedValue(approved);

    const result = await useCase.execute({
      consultationId: CONSULTATION_ID,
      doctorId: DOCTOR_ID,
      extras: [],
      paymentMethod: 'zelle',
    });

    expect(result.paymentStatus).toBe('approved');
    expect(result.amount).toBe(30);
    expect(result.baseAmount).toBe(30);
    expect(mockRepo.approveWithExtras).toHaveBeenCalledWith(
      CONSULTATION_ID,
      DOCTOR_ID,
      [],
      'zelle',
      undefined, // effectiveBaseAmountUsd: consultation ya tiene amount=30, no es price_on_request
    );
  });

  it('approves with extras — total = base + extras sum', async () => {
    const pending = makeConsultation({ paymentStatus: 'pending', amount: 30 });
    const approved = makeConsultation({
      paymentStatus: 'approved',
      amount: 50, // 30 + 20
      baseAmount: 30,
      paymentMethod: 'pago_movil',
    });
    mockRepo.findById.mockResolvedValue(pending);
    mockRepo.approveWithExtras.mockResolvedValue(approved);

    const result = await useCase.execute({
      consultationId: CONSULTATION_ID,
      doctorId: DOCTOR_ID,
      extras: [{ description: 'Limpieza', amountUsd: 20 }],
      paymentMethod: 'pago_movil',
    });

    expect(result.amount).toBe(50);
    expect(result.baseAmount).toBe(30);
    expect(mockRepo.approveWithExtras).toHaveBeenCalledWith(
      CONSULTATION_ID,
      DOCTOR_ID,
      [expect.objectContaining({ description: 'Limpieza', amountUsd: 20 })],
      'pago_movil',
      undefined, // effectiveBaseAmountUsd: consultation ya tiene amount=30
    );
  });

  it('allows re-approval (editing extras) reusing the already-stored method', async () => {
    // The already-approved consultation has baseAmount + method set from first approval.
    const alreadyApproved = makeConsultation({
      paymentStatus: 'approved',
      amount: 50,
      baseAmount: 30,
      paymentMethod: 'zelle',
    });
    const reApproved = makeConsultation({
      paymentStatus: 'approved',
      amount: 45, // base 30 + new extras 15
      baseAmount: 30,
      paymentMethod: 'zelle',
    });
    mockRepo.findById.mockResolvedValue(alreadyApproved);
    mockRepo.approveWithExtras.mockResolvedValue(reApproved);

    // No paymentMethod passed → falls back to the stored 'zelle'.
    const result = await useCase.execute({
      consultationId: CONSULTATION_ID,
      doctorId: DOCTOR_ID,
      extras: [{ description: 'ECG', amountUsd: 15 }],
    });

    expect(result.amount).toBe(45);
    expect(result.baseAmount).toBe(30);
    expect(mockRepo.approveWithExtras).toHaveBeenCalledWith(
      CONSULTATION_ID,
      DOCTOR_ID,
      [expect.objectContaining({ description: 'ECG', amountUsd: 15 })],
      'zelle',
      undefined, // effectiveBaseAmountUsd: re-aprobación con base_amount ya fijado — se ignora
    );
  });

  it('throws ConsultationNotFoundError when consultation does not exist', async () => {
    mockRepo.findById.mockResolvedValue(null);

    await expect(
      useCase.execute({
        consultationId: CONSULTATION_ID,
        doctorId: DOCTOR_ID,
        extras: [],
      }),
    ).rejects.toThrow(ConsultationNotFoundError);

    expect(mockRepo.approveWithExtras).not.toHaveBeenCalled();
  });

  it('throws ConsultationNotOwnedError when doctor does not own the consultation', async () => {
    const consultation = makeConsultation({ doctorId: DOCTOR_ID });
    mockRepo.findById.mockResolvedValue(consultation);

    await expect(
      useCase.execute({
        consultationId: CONSULTATION_ID,
        doctorId: OTHER_DOCTOR_ID,
        extras: [],
      }),
    ).rejects.toThrow(ConsultationNotOwnedError);

    expect(mockRepo.approveWithExtras).not.toHaveBeenCalled();
  });

  it('throws PaymentMethodRequiredError when no method is provided nor stored', async () => {
    const pending = makeConsultation({ paymentStatus: 'pending' }); // no paymentMethod
    mockRepo.findById.mockResolvedValue(pending);

    await expect(
      useCase.execute({
        consultationId: CONSULTATION_ID,
        doctorId: DOCTOR_ID,
        extras: [],
      }),
    ).rejects.toThrow(PaymentMethodRequiredError);

    expect(mockRepo.approveWithExtras).not.toHaveBeenCalled();
  });

  it('rejects a blank/whitespace payment method', async () => {
    const pending = makeConsultation({ paymentStatus: 'pending' });
    mockRepo.findById.mockResolvedValue(pending);

    await expect(
      useCase.execute({
        consultationId: CONSULTATION_ID,
        doctorId: DOCTOR_ID,
        extras: [],
        paymentMethod: '   ',
      }),
    ).rejects.toThrow(PaymentMethodRequiredError);

    expect(mockRepo.approveWithExtras).not.toHaveBeenCalled();
  });

  it('price_on_request: usa base_amount_usd como monto base cuando amount y baseAmount son null', async () => {
    // Escenario: consulta price_on_request → el especialista ingresa base_amount_usd=80
    // al momento de aprobar. El repo recibe 80 como baseAmountOverride.
    const priceOnRequest = makeConsultation({ amount: null, baseAmount: null });
    const approved = makeConsultation({
      paymentStatus: 'approved',
      amount: 80,
      baseAmount: 80,
      paymentMethod: 'zelle',
    });
    mockRepo.findById.mockResolvedValue(priceOnRequest);
    mockRepo.approveWithExtras.mockResolvedValue(approved);

    const result = await useCase.execute({
      consultationId: CONSULTATION_ID,
      doctorId: DOCTOR_ID,
      extras: [],
      paymentMethod: 'zelle',
      baseAmountUsd: 80,
    });

    expect(result.amount).toBe(80);
    // effectiveBaseAmountUsd = 80 pasa como 5to argumento
    expect(mockRepo.approveWithExtras).toHaveBeenCalledWith(
      CONSULTATION_ID,
      DOCTOR_ID,
      [],
      'zelle',
      80,
    );
  });

  it('price_on_request + extras: base_amount_usd se combina con los extras', async () => {
    // base_amount_usd=50 + 1 extra de $20 → el repo calculará total=70
    const priceOnRequest = makeConsultation({ amount: null, baseAmount: null });
    const approved = makeConsultation({
      paymentStatus: 'approved',
      amount: 70,
      baseAmount: 50,
      paymentMethod: 'pago_movil',
    });
    mockRepo.findById.mockResolvedValue(priceOnRequest);
    mockRepo.approveWithExtras.mockResolvedValue(approved);

    await useCase.execute({
      consultationId: CONSULTATION_ID,
      doctorId: DOCTOR_ID,
      extras: [{ description: 'Ecografía', amountUsd: 20 }],
      paymentMethod: 'pago_movil',
      baseAmountUsd: 50,
    });

    expect(mockRepo.approveWithExtras).toHaveBeenCalledWith(
      CONSULTATION_ID,
      DOCTOR_ID,
      [expect.objectContaining({ description: 'Ecografía', amountUsd: 20 })],
      'pago_movil',
      50,
    );
  });

  it('ignora base_amount_usd cuando la consulta ya tiene base_amount fijado (re-aprobación)', async () => {
    // La consulta ya fue aprobada en una sesión anterior y tiene base_amount=30.
    // El especialista envía base_amount_usd=999 — debe ser ignorado.
    const alreadyApproved = makeConsultation({
      paymentStatus: 'approved',
      amount: 30,
      baseAmount: 30,
      paymentMethod: 'zelle',
    });
    mockRepo.findById.mockResolvedValue(alreadyApproved);
    mockRepo.approveWithExtras.mockResolvedValue(alreadyApproved);

    await useCase.execute({
      consultationId: CONSULTATION_ID,
      doctorId: DOCTOR_ID,
      extras: [],
      paymentMethod: 'zelle',
      baseAmountUsd: 999, // debe ser ignorado
    });

    // effectiveBaseAmountUsd = undefined porque baseAmount !== null
    expect(mockRepo.approveWithExtras).toHaveBeenCalledWith(
      CONSULTATION_ID,
      DOCTOR_ID,
      [],
      'zelle',
      undefined,
    );
  });

  it('rechaza aprobar una consulta price_on_request sin monto ni extras', async () => {
    // Escenario: consulta price_on_request → amount=null, baseAmount=null en la BD.
    // Sin extras y sin monto base → cobro $0 silencioso, que corrompe el módulo de Cobros.
    const priceOnRequest = makeConsultation({ amount: null, baseAmount: null });
    mockRepo.findById.mockResolvedValue(priceOnRequest);

    await expect(
      useCase.execute({
        consultationId: CONSULTATION_ID,
        doctorId: DOCTOR_ID,
        extras: [],
        paymentMethod: 'zelle',
      }),
    ).rejects.toThrow(ConsultationAmountRequiredError);

    expect(mockRepo.approveWithExtras).not.toHaveBeenCalled();
  });

  it('permite aprobar una consulta price_on_request cuando se proporcionan extras', async () => {
    // Con al menos un extra se tiene un monto definido → aprobación válida.
    const priceOnRequest = makeConsultation({ amount: null, baseAmount: null });
    const approved = makeConsultation({
      paymentStatus: 'approved',
      amount: 50,
      baseAmount: 0,
      paymentMethod: 'zelle',
    });
    mockRepo.findById.mockResolvedValue(priceOnRequest);
    mockRepo.approveWithExtras.mockResolvedValue(approved);

    const result = await useCase.execute({
      consultationId: CONSULTATION_ID,
      doctorId: DOCTOR_ID,
      extras: [{ description: 'Ecografía', amountUsd: 50 }],
      paymentMethod: 'zelle',
    });

    expect(result.paymentStatus).toBe('approved');
    expect(mockRepo.approveWithExtras).toHaveBeenCalled();
  });
});
