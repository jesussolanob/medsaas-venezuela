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
  UseGuards,
} from '@nestjs/common';
import { AppAuthGuard } from '../../../../infrastructure/auth/app-auth.guard';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../../../presentation/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../../../presentation/pipes/zod-validation.pipe';
import {
  CreateProductDtoSchema,
  UpdateProductDtoSchema,
  ListProductsQuerySchema,
  RegisterMovementDtoSchema,
  type CreateProductDto,
  type UpdateProductDto,
  type ListProductsQuery,
  type RegisterMovementDto,
} from '@delta/shared-types';

import {
  ListProductsUseCase,
  type ListProductsResult,
  type ProductOutput,
} from '../../application/use-cases/list-products.use-case';
import { GetProductUseCase } from '../../application/use-cases/get-product.use-case';
import { CreateProductUseCase } from '../../application/use-cases/create-product.use-case';
import { UpdateProductUseCase } from '../../application/use-cases/update-product.use-case';
import { DeactivateProductUseCase } from '../../application/use-cases/deactivate-product.use-case';
import { RegisterMovementUseCase } from '../../application/use-cases/register-movement.use-case';
import { ListMovementsUseCase } from '../../application/use-cases/list-movements.use-case';
import type { InventoryMovement } from '../../domain/entities/inventory-movement.entity';
import type { MovementListResult } from '../../domain/repositories/iproduct.repository';

interface SuccessResponse<T> {
  success: true;
  data: T;
}

interface SuccessListResponse<T> {
  success: true;
  data: T[];
  meta: { total: number; page: number; limit: number };
}

/**
 * InventoryController — manages doctor's product catalog and movements.
 *
 * All routes under /api/doctor/inventory/products.
 *
 * SECURITY:
 *   - AppAuthGuard required on all endpoints.
 *   - doctorId is ALWAYS taken from the authenticated user (user.sub). Never trusted from body.
 *   - Ownership enforced per-resource; cross-doctor access returns 404 (anti-IDOR).
 */
@Controller('doctor/inventory')
@UseGuards(AppAuthGuard)
export class InventoryController {
  constructor(
    private readonly listProducts: ListProductsUseCase,
    private readonly getProduct: GetProductUseCase,
    private readonly createProduct: CreateProductUseCase,
    private readonly updateProduct: UpdateProductUseCase,
    private readonly deactivateProduct: DeactivateProductUseCase,
    private readonly registerMovement: RegisterMovementUseCase,
    private readonly listMovements: ListMovementsUseCase,
  ) {}

  /**
   * GET /api/doctor/inventory/products
   * Paginated product list with optional search and active filter.
   */
  @Get('products')
  async index(
    @Query(new ZodValidationPipe(ListProductsQuerySchema)) query: ListProductsQuery,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessListResponse<ListProductsResult['items'][number]>> {
    const result = await this.listProducts.execute(user.sub, query);
    return {
      success: true,
      data: result.items,
      meta: { total: result.total, page: result.page, limit: result.limit },
    };
  }

  /**
   * POST /api/doctor/inventory/products
   * Creates a new product.
   */
  @Post('products')
  async create(
    @Body(new ZodValidationPipe(CreateProductDtoSchema)) dto: CreateProductDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<ProductOutput>> {
    const product = await this.createProduct.execute(dto, user.sub);
    return { success: true, data: product };
  }

  /**
   * GET /api/doctor/inventory/products/:id
   * Returns a single product. 404 when missing or not owned (anti-IDOR).
   */
  @Get('products/:id')
  async show(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<ProductOutput>> {
    const product = await this.getProduct.execute(id, user.sub);
    return { success: true, data: product };
  }

  /**
   * PUT /api/doctor/inventory/products/:id
   * Partial update. Returns the updated product.
   */
  @Put('products/:id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateProductDtoSchema)) dto: UpdateProductDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<ProductOutput>> {
    const product = await this.updateProduct.execute(id, user.sub, dto);
    return { success: true, data: product };
  }

  /**
   * DELETE /api/doctor/inventory/products/:id
   * Soft-delete (sets is_active = false). Returns 204 No Content.
   */
  @Delete('products/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<void> {
    await this.deactivateProduct.execute(id, user.sub);
  }

  /**
   * GET /api/doctor/inventory/products/:id/movements
   * Paginated movement history for a product.
   */
  @Get('products/:id/movements')
  async getMovements(
    @Param('id', ParseUUIDPipe) productId: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessListResponse<InventoryMovement>> {
    const result: MovementListResult = await this.listMovements.execute(
      productId,
      user.sub,
      parseInt(page, 10) || 1,
      Math.min(parseInt(limit, 10) || 20, 100),
    );
    return {
      success: true,
      data: result.items,
      meta: { total: result.total, page: result.page, limit: result.limit },
    };
  }

  /**
   * POST /api/doctor/inventory/products/:id/movements
   * Registers a manual movement (purchase, adjustment, loss).
   * Sales are created automatically through consultation approval.
   */
  @Post('products/:id/movements')
  async addMovement(
    @Param('id', ParseUUIDPipe) productId: string,
    @Body(new ZodValidationPipe(RegisterMovementDtoSchema)) dto: RegisterMovementDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<InventoryMovement>> {
    const movement = await this.registerMovement.execute(productId, user.sub, dto);
    return { success: true, data: movement };
  }
}
