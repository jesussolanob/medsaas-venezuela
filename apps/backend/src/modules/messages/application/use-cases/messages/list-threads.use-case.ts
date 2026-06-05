import { Inject, Injectable } from '@nestjs/common';
import {
  IMessageRepository,
  MESSAGE_REPOSITORY,
  type ThreadSummary,
} from '../../../domain/repositories/message.repository';

/**
 * Returns all message threads for the authenticated doctor.
 * The doctor ID is always taken from the auth token — never from user input.
 */
@Injectable()
export class ListThreadsUseCase {
  constructor(
    @Inject(MESSAGE_REPOSITORY)
    private readonly messageRepo: IMessageRepository,
  ) {}

  async execute(doctorId: string): Promise<ThreadSummary[]> {
    return this.messageRepo.listThreads(doctorId);
  }
}
