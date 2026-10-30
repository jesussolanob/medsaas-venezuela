import { ListTeamMeetingsAdminUseCase } from './list-team-meetings-admin.use-case';
import type {
  ITeamMeetingRepository,
  ListTeamMeetingsResult,
} from '../../domain/repositories/iteam-meeting.repository';

describe('ListTeamMeetingsAdminUseCase', () => {
  let useCase: ListTeamMeetingsAdminUseCase;
  let repo: jest.Mocked<Pick<ITeamMeetingRepository, 'listWithDoctor'>>;

  const mockResult: ListTeamMeetingsResult = {
    items: [],
    total: 0,
  };

  beforeEach(() => {
    repo = { listWithDoctor: jest.fn().mockResolvedValue(mockResult) };
    useCase = new ListTeamMeetingsAdminUseCase(repo as unknown as ITeamMeetingRepository);
  });

  it('delegates to repo.listWithDoctor with the correct filter', async () => {
    await useCase.execute({ limit: 10, offset: 0 });

    expect(repo.listWithDoctor).toHaveBeenCalledWith({
      status: undefined,
      from: undefined,
      to: undefined,
      limit: 10,
      offset: 0,
    });
  });

  it('passes status filter when provided', async () => {
    await useCase.execute({ status: 'scheduled', limit: 20, offset: 0 });

    expect(repo.listWithDoctor).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'scheduled' }),
    );
  });

  it('returns the repository result', async () => {
    const result = await useCase.execute({ limit: 10, offset: 0 });
    expect(result).toEqual(mockResult);
  });
});
