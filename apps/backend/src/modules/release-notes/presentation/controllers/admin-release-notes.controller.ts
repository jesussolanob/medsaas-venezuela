import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AppAuthGuard } from '../../../../infrastructure/auth/app-auth.guard';
import { RolesGuard } from '../../../../presentation/guards/roles.guard';
import { Roles } from '../../../../presentation/decorators/roles.decorator';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../../../presentation/decorators/current-user.decorator';
import { CreateReleaseNoteUseCase } from '../../application/use-cases/create-release-note.use-case';
import { UpdateReleaseNoteUseCase } from '../../application/use-cases/update-release-note.use-case';
import { DeleteReleaseNoteUseCase } from '../../application/use-cases/delete-release-note.use-case';
import { PublishReleaseNoteUseCase } from '../../application/use-cases/publish-release-note.use-case';
import { UnpublishReleaseNoteUseCase } from '../../application/use-cases/unpublish-release-note.use-case';
import { ListReleaseNotesAdminUseCase } from '../../application/use-cases/list-release-notes-admin.use-case';
import { GetNoteImageUploadUrlUseCase } from '../../application/use-cases/get-note-image-upload-url.use-case';
import {
  CreateReleaseNoteDtoSchema,
  UpdateReleaseNoteDtoSchema,
  ListReleaseNotesQuerySchema,
} from '@delta/shared-types';

/**
 * AdminReleaseNotesController — admin endpoints for release note management.
 *
 * Global prefix 'api' is set in main.ts — do NOT repeat it here.
 * Both super_admin AND admin roles may access all endpoints.
 *
 * ROUTES:
 *   GET    /api/admin/release-notes                        — list (status, limit, offset)
 *   POST   /api/admin/release-notes                        — create draft
 *   PUT    /api/admin/release-notes/:id                    — update
 *   DELETE /api/admin/release-notes/:id                    — delete (drafts only)
 *   POST   /api/admin/release-notes/:id/publish            — publish draft
 *   POST   /api/admin/release-notes/:id/unpublish          — unpublish
 *   POST   /api/admin/release-notes/image-upload           — upload image
 */
@Controller('admin/release-notes')
@UseGuards(AppAuthGuard, RolesGuard)
@Roles('super_admin', 'admin')
export class AdminReleaseNotesController {
  constructor(
    private readonly createUseCase: CreateReleaseNoteUseCase,
    private readonly updateUseCase: UpdateReleaseNoteUseCase,
    private readonly deleteUseCase: DeleteReleaseNoteUseCase,
    private readonly publishUseCase: PublishReleaseNoteUseCase,
    private readonly unpublishUseCase: UnpublishReleaseNoteUseCase,
    private readonly listUseCase: ListReleaseNotesAdminUseCase,
    private readonly imageUploadUseCase: GetNoteImageUploadUrlUseCase,
  ) {}

  /**
   * GET /api/admin/release-notes
   *
   * Returns a paginated list with optional status filter.
   * status: 'draft' | 'published' | 'all' (default: 'all')
   */
  @Get()
  async list(@Query() query: unknown): Promise<{ success: true; data: unknown; meta: unknown }> {
    const dto = ListReleaseNotesQuerySchema.parse(query);
    const result = await this.listUseCase.execute(dto);
    return {
      success: true,
      data: result.items,
      meta: { total: result.total, limit: dto.limit, offset: dto.offset },
    };
  }

  /**
   * POST /api/admin/release-notes/image-upload
   *
   * Uploads an image for a release note (multipart, field 'file').
   * Returns: { imageUrl, path }
   * The caller stores path in the note's imageUrl field.
   *
   * NOTE: This route must be registered BEFORE /:id/publish and /:id/unpublish
   * to avoid ambiguity. 'image-upload' is not a UUID so ParseUUIDPipe on /:id
   * would reject it anyway, but explicit ordering is clearer.
   */
  @Post('image-upload')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  async imageUpload(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<{ success: true; data: unknown }> {
    const data = await this.imageUploadUseCase.execute({
      actorId: user.sub,
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      buffer: file.buffer,
    });
    return { success: true, data };
  }

  /**
   * POST /api/admin/release-notes
   *
   * Creates a new release note as a draft.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() body: unknown,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<{ success: true; data: unknown }> {
    const dto = CreateReleaseNoteDtoSchema.parse(body);
    const data = await this.createUseCase.execute(dto, user.sub);
    return { success: true, data };
  }

  /**
   * PUT /api/admin/release-notes/:id
   *
   * Updates editable fields (works on draft or published).
   */
  @Put(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ): Promise<{ success: true; data: unknown }> {
    const dto = UpdateReleaseNoteDtoSchema.parse(body);
    const data = await this.updateUseCase.execute(id, dto);
    return { success: true, data };
  }

  /**
   * DELETE /api/admin/release-notes/:id
   *
   * Deletes a draft. Returns 409 if the note is published.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.deleteUseCase.execute(id);
  }

  /**
   * POST /api/admin/release-notes/:id/publish
   *
   * Publishes a draft note (server sets published_at = now()).
   */
  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  async publish(@Param('id', ParseUUIDPipe) id: string): Promise<{ success: true; data: unknown }> {
    const data = await this.publishUseCase.execute(id);
    return { success: true, data };
  }

  /**
   * POST /api/admin/release-notes/:id/unpublish
   *
   * Unpublishes a note (sets published_at = NULL, back to draft).
   */
  @Post(':id/unpublish')
  @HttpCode(HttpStatus.OK)
  async unpublish(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ success: true; data: unknown }> {
    const data = await this.unpublishUseCase.execute(id);
    return { success: true, data };
  }
}
