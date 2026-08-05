import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DispatchDoctorInactivityNoticesUseCase } from './dispatch-doctor-inactivity-notices.use-case';
import { DOCTOR_INACTIVITY_REPOSITORY } from '../../../domain/repositories/doctor-inactivity.repository';
import type { InactiveDoctorCandidate } from '../../../domain/repositories/doctor-inactivity.repository';
import { MailerService } from '../../../../email/application/services/mailer.service';

const NOW = new Date('2026-08-05T12:00:00.000Z');

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);
}

function makeCandidate(overrides: Partial<InactiveDoctorCandidate> = {}): InactiveDoctorCandidate {
  return {
    doctorId: overrides.doctorId ?? 'doctor-id-001',
    email: overrides.email ?? 'doctor@example.com',
    fullName: 'fullName' in overrides ? (overrides.fullName ?? null) : 'Dra. Ana Solano',
    lastSignInAt: overrides.lastSignInAt ?? daysAgo(10),
    inactivityNoticeStage: overrides.inactivityNoticeStage ?? 0,
  };
}

describe('DispatchDoctorInactivityNoticesUseCase', () => {
  let useCase: DispatchDoctorInactivityNoticesUseCase;
  let mockInactivityRepo: { findCandidates: jest.Mock; markNoticeSent: jest.Mock };
  let mockMailer: { sendTemplate: jest.Mock };
  let mockConfig: { get: jest.Mock };

  beforeEach(async () => {
    mockInactivityRepo = {
      findCandidates: jest.fn().mockResolvedValue([]),
      markNoticeSent: jest.fn().mockResolvedValue(undefined),
    };

    mockMailer = {
      sendTemplate: jest.fn().mockResolvedValue({ id: 'msg-001' }),
    };

    mockConfig = {
      get: jest.fn().mockReturnValue('https://app.deltasalud.app'),
    };

    const module = await Test.createTestingModule({
      providers: [
        DispatchDoctorInactivityNoticesUseCase,
        { provide: DOCTOR_INACTIVITY_REPOSITORY, useValue: mockInactivityRepo },
        { provide: MailerService, useValue: mockMailer },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    useCase = module.get(DispatchDoctorInactivityNoticesUseCase);
  });

  it('returns zeroed counts when there are no candidates', async () => {
    const result = await useCase.execute(NOW);
    expect(result).toEqual({ sent10: 0, sent15: 0, skipped: 0, failed: 0 });
    expect(mockMailer.sendTemplate).not.toHaveBeenCalled();
  });

  it('skips a doctor inactive for 9 days (below the 10-day threshold)', async () => {
    const candidate = makeCandidate({ lastSignInAt: daysAgo(9), inactivityNoticeStage: 0 });
    mockInactivityRepo.findCandidates.mockResolvedValue([candidate]);

    const result = await useCase.execute(NOW);

    expect(mockMailer.sendTemplate).not.toHaveBeenCalled();
    expect(mockInactivityRepo.markNoticeSent).not.toHaveBeenCalled();
    expect(result).toEqual({ sent10: 0, sent15: 0, skipped: 1, failed: 0 });
  });

  it('sends the 10-day notice and advances stage to 1 for a doctor at 10 days, stage 0', async () => {
    const candidate = makeCandidate({
      doctorId: 'doctor-10d',
      lastSignInAt: daysAgo(10),
      inactivityNoticeStage: 0,
    });
    mockInactivityRepo.findCandidates.mockResolvedValue([candidate]);

    const result = await useCase.execute(NOW);

    expect(mockMailer.sendTemplate).toHaveBeenCalledWith(
      'doctor_inactivity_10d',
      candidate.email,
      expect.objectContaining({
        doctorName: 'Dra. Ana Solano',
        appUrl: 'https://app.deltasalud.app',
      }),
      { type: 'doctor', id: 'doctor-10d' },
    );
    expect(mockInactivityRepo.markNoticeSent).toHaveBeenCalledWith('doctor-10d', 1, NOW);
    expect(result).toEqual({ sent10: 1, sent15: 0, skipped: 0, failed: 0 });
  });

  it('does not resend anything for a doctor at 12 days already at stage 1', async () => {
    const candidate = makeCandidate({ lastSignInAt: daysAgo(12), inactivityNoticeStage: 1 });
    mockInactivityRepo.findCandidates.mockResolvedValue([candidate]);

    const result = await useCase.execute(NOW);

    expect(mockMailer.sendTemplate).not.toHaveBeenCalled();
    expect(mockInactivityRepo.markNoticeSent).not.toHaveBeenCalled();
    expect(result).toEqual({ sent10: 0, sent15: 0, skipped: 1, failed: 0 });
  });

  it('sends the 15-day notice and advances stage to 2 for a doctor at 15 days, stage 1', async () => {
    const candidate = makeCandidate({
      doctorId: 'doctor-15d',
      lastSignInAt: daysAgo(15),
      inactivityNoticeStage: 1,
    });
    mockInactivityRepo.findCandidates.mockResolvedValue([candidate]);

    const result = await useCase.execute(NOW);

    expect(mockMailer.sendTemplate).toHaveBeenCalledWith(
      'doctor_inactivity_15d',
      candidate.email,
      expect.objectContaining({ doctorName: 'Dra. Ana Solano' }),
      { type: 'doctor', id: 'doctor-15d' },
    );
    expect(mockInactivityRepo.markNoticeSent).toHaveBeenCalledWith('doctor-15d', 2, NOW);
    expect(result).toEqual({ sent10: 0, sent15: 1, skipped: 0, failed: 0 });
  });

  it('sends nothing for a doctor at 20 days already at stage 2', async () => {
    const candidate = makeCandidate({ lastSignInAt: daysAgo(20), inactivityNoticeStage: 2 });
    mockInactivityRepo.findCandidates.mockResolvedValue([candidate]);

    const result = await useCase.execute(NOW);

    expect(mockMailer.sendTemplate).not.toHaveBeenCalled();
    expect(result).toEqual({ sent10: 0, sent15: 0, skipped: 1, failed: 0 });
  });

  it('sends ONLY the 15-day notice for a doctor at 16 days still at stage 0 (skips 10d)', async () => {
    const candidate = makeCandidate({
      doctorId: 'doctor-16d',
      lastSignInAt: daysAgo(16),
      inactivityNoticeStage: 0,
    });
    mockInactivityRepo.findCandidates.mockResolvedValue([candidate]);

    const result = await useCase.execute(NOW);

    expect(mockMailer.sendTemplate).toHaveBeenCalledTimes(1);
    expect(mockMailer.sendTemplate).toHaveBeenCalledWith(
      'doctor_inactivity_15d',
      candidate.email,
      expect.anything(),
      { type: 'doctor', id: 'doctor-16d' },
    );
    expect(mockInactivityRepo.markNoticeSent).toHaveBeenCalledTimes(1);
    expect(mockInactivityRepo.markNoticeSent).toHaveBeenCalledWith('doctor-16d', 2, NOW);
    expect(result).toEqual({ sent10: 0, sent15: 1, skipped: 0, failed: 0 });
  });

  it('does not abort the batch when one mailer call fails — counts it as failed', async () => {
    const failing = makeCandidate({
      doctorId: 'doctor-fail',
      email: 'fail@example.com',
      lastSignInAt: daysAgo(10),
      inactivityNoticeStage: 0,
    });
    const ok = makeCandidate({
      doctorId: 'doctor-ok',
      email: 'ok@example.com',
      lastSignInAt: daysAgo(10),
      inactivityNoticeStage: 0,
    });
    mockInactivityRepo.findCandidates.mockResolvedValue([failing, ok]);

    mockMailer.sendTemplate.mockImplementation((_template: string, to: string) => {
      if (to === 'fail@example.com') {
        return Promise.reject(new Error('Resend rate limit'));
      }
      return Promise.resolve({ id: 'msg-ok' });
    });

    const result = await useCase.execute(NOW);

    expect(mockInactivityRepo.markNoticeSent).toHaveBeenCalledTimes(1);
    expect(mockInactivityRepo.markNoticeSent).toHaveBeenCalledWith('doctor-ok', 1, NOW);
    expect(result).toEqual({ sent10: 1, sent15: 0, skipped: 0, failed: 1 });
  });

  it('never sends anything when last_sign_in_at candidates list is empty (null sign-in filtered upstream)', async () => {
    // The repository is responsible for filtering out last_sign_in_at IS NULL rows
    // (see SequelizeDoctorInactivityRepository). If it returns [], nothing is sent.
    mockInactivityRepo.findCandidates.mockResolvedValue([]);

    const result = await useCase.execute(NOW);

    expect(mockMailer.sendTemplate).not.toHaveBeenCalled();
    expect(result).toEqual({ sent10: 0, sent15: 0, skipped: 0, failed: 0 });
  });

  it('falls back to "Especialista" when fullName is null', async () => {
    const candidate = makeCandidate({ fullName: null, lastSignInAt: daysAgo(10) });
    mockInactivityRepo.findCandidates.mockResolvedValue([candidate]);

    await useCase.execute(NOW);

    expect(mockMailer.sendTemplate).toHaveBeenCalledWith(
      'doctor_inactivity_10d',
      candidate.email,
      expect.objectContaining({ doctorName: 'Especialista' }),
      expect.anything(),
    );
  });

  it('respects the dispatch cap warning path without throwing (200 candidates)', async () => {
    const candidates = Array.from({ length: 200 }, (_, i) =>
      makeCandidate({ doctorId: `doctor-${i}`, email: `doctor-${i}@example.com` }),
    );
    mockInactivityRepo.findCandidates.mockResolvedValue(candidates);

    const result = await useCase.execute(NOW);

    expect(result.sent10).toBe(200);
  });
});
