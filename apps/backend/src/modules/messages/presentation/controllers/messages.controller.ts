import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { DevAuthGuard } from '../../../../infrastructure/auth/dev-auth.guard';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../../../presentation/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../../../presentation/pipes/zod-validation.pipe';
import { SendMessageDtoSchema, type SendMessageDto } from '@delta/shared-types';

import { ListThreadsUseCase } from '../../application/use-cases/messages/list-threads.use-case';
import { GetThreadUseCase } from '../../application/use-cases/messages/get-thread.use-case';
import { SendMessageUseCase } from '../../application/use-cases/messages/send-message.use-case';
import { toThreadListItem, toMessageItem, type ThreadListItem, type MessageItem } from '../mappers/message.mapper';

interface SuccessResponse<T> {
  success: true;
  data: T;
}

/**
 * MessagesController
 *
 * Doctor-side messaging under /api/doctor/messages.
 *
 * SECURITY:
 *   - doctorId is ALWAYS taken from the authenticated user (user.sub) — never from request body.
 *   - Patient ownership is verified before accessing or creating any message (anti-IDOR).
 *   - Message body is PHI: encrypted at rest, decrypted only for the owning doctor.
 *   - Patient name in thread list is masked ("Juan P.") — applied in mapper layer.
 */
@Controller('doctor/messages')
@UseGuards(DevAuthGuard)
export class MessagesController {
  constructor(
    private readonly listThreads: ListThreadsUseCase,
    private readonly getThread: GetThreadUseCase,
    private readonly sendMessage: SendMessageUseCase,
  ) {}

  /**
   * GET /api/doctor/messages/threads
   * Returns all message threads for the authenticated doctor.
   * Patient names are masked ("Juan P.").
   */
  @Get('threads')
  async threads(
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<ThreadListItem[]>> {
    const summaries = await this.listThreads.execute(user.sub);
    return { success: true, data: summaries.map(toThreadListItem) };
  }

  /**
   * GET /api/doctor/messages?patientId=<uuid>
   * Returns all messages in the thread with the given patient, chronological order.
   * Marks patient_to_doctor messages as read.
   * Returns 404 if the patient does not belong to this doctor (anti-IDOR).
   */
  @Get()
  async thread(
    @Query('patientId') patientId: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<MessageItem[]>> {
    const messages = await this.getThread.execute(user.sub, patientId);
    return { success: true, data: messages.map(toMessageItem) };
  }

  /**
   * POST /api/doctor/messages
   * Sends a doctor_to_patient message.
   * Returns 404 if the patient does not belong to this doctor (anti-IDOR).
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async send(
    @Body(new ZodValidationPipe(SendMessageDtoSchema)) dto: SendMessageDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<MessageItem>> {
    const message = await this.sendMessage.execute(dto, user.sub);
    return { success: true, data: toMessageItem(message) };
  }
}
