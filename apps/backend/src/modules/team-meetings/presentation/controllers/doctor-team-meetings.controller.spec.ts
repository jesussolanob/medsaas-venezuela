import { DoctorTeamMeetingsController } from './doctor-team-meetings.controller';
import type { GetMeetingSlotsUseCase } from '../../application/use-cases/get-meeting-slots.use-case';
import type { CreateTeamMeetingUseCase } from '../../application/use-cases/create-team-meeting.use-case';
import type { GetCurrentTeamMeetingUseCase } from '../../application/use-cases/get-current-team-meeting.use-case';
import type { RescheduleTeamMeetingUseCase } from '../../application/use-cases/reschedule-team-meeting.use-case';
import type { CancelTeamMeetingUseCase } from '../../application/use-cases/cancel-team-meeting.use-case';
import type { CurrentUserPayload } from '../../../../presentation/decorators/current-user.decorator';

const USER: CurrentUserPayload = { sub: 'doctor-1', role: 'doctor', email: 'dr@test.com' };

describe('DoctorTeamMeetingsController', () => {
  let controller: DoctorTeamMeetingsController;
  let getSlots: jest.Mocked<Pick<GetMeetingSlotsUseCase, 'execute'>>;
  let createMeeting: jest.Mocked<Pick<CreateTeamMeetingUseCase, 'execute'>>;
  let getCurrentMeeting: jest.Mocked<Pick<GetCurrentTeamMeetingUseCase, 'execute'>>;
  let rescheduleMeeting: jest.Mocked<Pick<RescheduleTeamMeetingUseCase, 'execute'>>;
  let cancelMeeting: jest.Mocked<Pick<CancelTeamMeetingUseCase, 'execute'>>;

  beforeEach(() => {
    getSlots = { execute: jest.fn().mockResolvedValue({ usesGenericHours: false, days: [] }) };
    createMeeting = { execute: jest.fn().mockResolvedValue({ id: 'm1', status: 'scheduled' }) };
    getCurrentMeeting = { execute: jest.fn().mockResolvedValue(null) };
    rescheduleMeeting = { execute: jest.fn().mockResolvedValue({ id: 'm1', status: 'scheduled' }) };
    cancelMeeting = { execute: jest.fn().mockResolvedValue(undefined) };

    controller = new DoctorTeamMeetingsController(
      getSlots as unknown as GetMeetingSlotsUseCase,
      createMeeting as unknown as CreateTeamMeetingUseCase,
      getCurrentMeeting as unknown as GetCurrentTeamMeetingUseCase,
      rescheduleMeeting as unknown as RescheduleTeamMeetingUseCase,
      cancelMeeting as unknown as CancelTeamMeetingUseCase,
    );
  });

  it('getAvailableSlots delegates to GetMeetingSlotsUseCase', async () => {
    const res = await controller.getAvailableSlots(USER, { days: '14' });
    expect(getSlots.execute).toHaveBeenCalledWith('doctor-1', 14);
    expect(res.success).toBe(true);
  });

  it('getCurrent delegates to GetCurrentTeamMeetingUseCase', async () => {
    const res = await controller.getCurrent(USER);
    expect(getCurrentMeeting.execute).toHaveBeenCalledWith('doctor-1');
    expect(res).toEqual({ success: true, data: null });
  });

  it('create delegates to CreateTeamMeetingUseCase with source=modal', async () => {
    const res = await controller.create(USER, { date: '2026-11-10', time: '10:00' });
    expect(createMeeting.execute).toHaveBeenCalledWith(
      expect.objectContaining({ doctorId: 'doctor-1', source: 'modal' }),
    );
    expect(res.success).toBe(true);
  });

  it('reschedule delegates to RescheduleTeamMeetingUseCase', async () => {
    const res = await controller.reschedule(USER, 'meeting-uuid-1111-0000-0000-000000000000', {
      date: '2026-11-11',
      time: '14:00',
    });
    expect(rescheduleMeeting.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        meetingId: 'meeting-uuid-1111-0000-0000-000000000000',
        actorId: 'doctor-1',
      }),
    );
    expect(res.success).toBe(true);
  });

  it('cancel delegates to CancelTeamMeetingUseCase with isAdmin=false', async () => {
    const res = await controller.cancel(USER, 'meeting-uuid-1111-0000-0000-000000000000');
    expect(cancelMeeting.execute).toHaveBeenCalledWith(
      expect.objectContaining({ isAdmin: false, actorId: 'doctor-1' }),
    );
    expect(res).toEqual({ success: true, data: null });
  });
});
