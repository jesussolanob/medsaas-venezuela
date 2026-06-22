import {
  Controller,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { AppAuthGuard } from '../../../../infrastructure/auth/app-auth.guard';
import { RolesGuard } from '../../../../presentation/guards/roles.guard';
import { Roles } from '../../../../presentation/decorators/roles.decorator';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../../../presentation/decorators/current-user.decorator';
import { HelpChatUseCase } from '../../application/use-cases/help-chat.use-case';
import type { ChatMessage } from '../../application/dtos/help-chat.dto';

/** Maximum number of conversation turns accepted per request. */
const MAX_MESSAGES = 30;

/** Maximum characters allowed in a single message content. */
const MAX_CONTENT_CHARS = 4000;

/** Maximum total characters across all messages in a single request. */
const MAX_TOTAL_CHARS = 24_000;

/** Valid role values for a chat message. */
const VALID_ROLES = new Set<string>(['user', 'assistant']);

interface HelpChatSuccessResponse {
  reply: string;
}

/**
 * HelpChatController
 *
 * POST /api/help/chat
 *
 * Accepts a JSON body `{ messages: ChatMessage[] }` and returns `{ reply: string }`.
 *
 * Auth: AppAuthGuard + RolesGuard.
 * Roles: super_admin, doctor, patient.
 *
 * All input validation is performed at this boundary before the payload
 * reaches the use case layer.
 */
@Controller('help')
@UseGuards(AppAuthGuard, RolesGuard)
@Roles('super_admin', 'doctor', 'patient')
export class HelpChatController {
  constructor(private readonly helpChat: HelpChatUseCase) {}

  @Post('chat')
  @HttpCode(HttpStatus.OK)
  async chat(
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<HelpChatSuccessResponse> {
    const messages = this.validateMessages(body);

    const output = await this.helpChat.execute({
      role: user.role,
      messages,
    });

    return { reply: output.reply };
  }

  // ---------------------------------------------------------------------------
  // Private validation helpers
  // ---------------------------------------------------------------------------

  /**
   * Validates and sanitizes the `messages` field from the raw request body.
   *
   * Rules enforced:
   *   - `messages` must be a non-empty array.
   *   - Each item must have `role` ∈ {user, assistant} and `content` as a non-empty string.
   *   - Maximum 30 messages per request.
   *   - Each message content is at most 4 000 characters (BadRequestException if exceeded).
   *   - Total characters across all messages must not exceed 24 000.
   *   - The last message must be from the `user` role.
   */
  private validateMessages(body: Record<string, unknown>): ChatMessage[] {
    const raw = body['messages'];

    if (!Array.isArray(raw) || raw.length === 0) {
      throw new BadRequestException(
        'El campo "messages" es requerido y debe ser un array no vacío.',
      );
    }

    if (raw.length > MAX_MESSAGES) {
      throw new BadRequestException(
        `El campo "messages" no puede contener más de ${MAX_MESSAGES} mensajes.`,
      );
    }

    const messages: ChatMessage[] = [];
    let totalChars = 0;

    for (let i = 0; i < raw.length; i++) {
      const item = raw[i] as Record<string, unknown>;

      if (item === null || typeof item !== 'object' || Array.isArray(item)) {
        throw new BadRequestException(
          `messages[${i}]: cada mensaje debe ser un objeto con las propiedades "role" y "content".`,
        );
      }

      const role = item['role'];
      if (typeof role !== 'string' || !VALID_ROLES.has(role)) {
        throw new BadRequestException(
          `messages[${i}].role: valor inválido "${String(role)}". Valores permitidos: user, assistant.`,
        );
      }

      const rawContent = item['content'];
      if (typeof rawContent !== 'string' || !rawContent.trim()) {
        throw new BadRequestException(`messages[${i}].content: debe ser un string no vacío.`);
      }

      // Reject payloads where a single message exceeds the character limit.
      if (rawContent.length > MAX_CONTENT_CHARS) {
        throw new BadRequestException(
          `Cada mensaje no puede superar los ${MAX_CONTENT_CHARS} caracteres.`,
        );
      }

      const content = rawContent;
      totalChars += content.length;

      if (totalChars > MAX_TOTAL_CHARS) {
        throw new BadRequestException(
          `El contenido total de los mensajes supera el límite de ${MAX_TOTAL_CHARS} caracteres.`,
        );
      }

      messages.push({ role: role as 'user' | 'assistant', content });
    }

    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.role !== 'user') {
      throw new BadRequestException(
        'El último mensaje del array "messages" debe tener role "user".',
      );
    }

    return messages;
  }
}
