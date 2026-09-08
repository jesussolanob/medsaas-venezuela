import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, QueryTypes, type WhereOptions } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { randomUUID } from 'crypto';
import {
  Quote,
  type QuoteStatus,
  type QuoteDiscountType,
} from '../../../domain/entities/quote.entity';
import { QuoteItem, type QuoteItemKind } from '../../../domain/entities/quote-item.entity';
import { QuoteShareLink } from '../../../domain/entities/quote-share-link.entity';
import { QuoteNotFoundError } from '../../../domain/errors/quote-not-found.error';
import { QuoteInvalidStatusTransitionError } from '../../../domain/errors/quote-invalid-status-transition.error';
import { QuoteAlreadySentError } from '../../../domain/errors/quote-already-sent.error';
import { QuoteItemSourceNotFoundError } from '../../../domain/errors/quote-item-source-not-found.error';
import type {
  IQuoteRepository,
  QuoteListFilters,
  QuoteListResult,
  CreateQuoteParams,
  UpdateQuoteParams,
  SendQuoteParams,
  CreateQuoteItemParams,
} from '../../../domain/repositories/iquote.repository';
import { QuoteModel } from '../models/quote.model';
import { QuoteItemModel } from '../models/quote-item.model';
import { QuoteShareLinkModel } from '../models/quote-share-link.model';

@Injectable()
export class SequelizeQuoteRepository implements IQuoteRepository {
  constructor(
    @InjectModel(QuoteModel)
    private readonly quoteModel: typeof QuoteModel,
    @InjectModel(QuoteItemModel)
    private readonly itemModel: typeof QuoteItemModel,
    @InjectModel(QuoteShareLinkModel)
    private readonly linkModel: typeof QuoteShareLinkModel,
    private readonly sequelize: Sequelize,
  ) {}

  // --------------------------------------------------------------------------
  // Queries
  // --------------------------------------------------------------------------

  async list(filters: QuoteListFilters): Promise<QuoteListResult> {
    const where: Record<string, unknown> = { doctorId: filters.doctorId };

    if (filters.status) {
      where['status'] = filters.status;
    }

    // Patient name filter: IDs pre-resolved by the use case (encrypted names).
    if (filters.patientIds !== undefined) {
      if (filters.patientIds.length === 0) {
        return { items: [], total: 0, page: filters.page, limit: filters.limit };
      }
      where['patientId'] = filters.patientIds;
    }

    // Product name filter: join to quote_items and filter by name ILIKE.
    // Escape SQL wildcards so a query like "_" or "%" matches literally.
    let quoteIds: string[] | null = null;
    if (filters.productName) {
      const escaped = filters.productName
        .replace(/\\/g, '\\\\')
        .replace(/%/g, '\\%')
        .replace(/_/g, '\\_');
      const rows = await this.sequelize.query<{ quote_id: string }>(
        `SELECT DISTINCT quote_id FROM quote_items
         WHERE doctor_id = :doctorId
           AND name ILIKE :pattern ESCAPE '\\'`,
        {
          replacements: { doctorId: filters.doctorId, pattern: `%${escaped}%` },
          type: QueryTypes.SELECT,
        },
      );
      quoteIds = rows.map((r) => r.quote_id);
      if (quoteIds.length === 0) {
        return { items: [], total: 0, page: filters.page, limit: filters.limit };
      }
    }

    // Supplier filter: join quote_items (kind='product') → products via source_id.
    //
    // SNAPSHOT CAVEAT: The supplier is NOT stored in the quote item snapshot.
    // This filter resolves live from the products catalog. If a product is
    // deactivated or its supplier is changed after the quote was created, the
    // quote will either disappear from supplier-filtered results or appear under
    // the new supplier name. This is a known trade-off; snapshotting supplier
    // was not requested. All other filters (status, product_name, patient_name)
    // operate on frozen/encrypted data stored at creation time.
    if (filters.supplier) {
      const escaped = filters.supplier
        .replace(/\\/g, '\\\\')
        .replace(/%/g, '\\%')
        .replace(/_/g, '\\_');
      const rows = await this.sequelize.query<{ quote_id: string }>(
        `SELECT DISTINCT qi.quote_id
         FROM quote_items qi
         JOIN products p ON p.id = qi.source_id AND p.doctor_id = :doctorId
         WHERE qi.doctor_id = :doctorId
           AND qi.kind = 'product'
           AND p.supplier ILIKE :pattern ESCAPE '\\'`,
        {
          replacements: { doctorId: filters.doctorId, pattern: `%${escaped}%` },
          type: QueryTypes.SELECT,
        },
      );
      const supplierQuoteIds = rows.map((r) => r.quote_id);
      if (supplierQuoteIds.length === 0) {
        return { items: [], total: 0, page: filters.page, limit: filters.limit };
      }
      // Intersect with any existing quoteIds from the product_name filter.
      quoteIds =
        quoteIds === null
          ? supplierQuoteIds
          : quoteIds.filter((id) => supplierQuoteIds.includes(id));
      if (quoteIds.length === 0) {
        return { items: [], total: 0, page: filters.page, limit: filters.limit };
      }
    }

    if (quoteIds !== null) {
      where['id'] = quoteIds;
    }

    const { count, rows } = await this.quoteModel.findAndCountAll({
      where: where as WhereOptions,
      include: [{ model: QuoteItemModel, as: 'items' }],
      order: [['createdAt', 'DESC']],
      limit: filters.limit,
      offset: (filters.page - 1) * filters.limit,
      distinct: true,
    });

    return {
      items: rows.map((r) => this.toDomain(r)),
      total: count,
      page: filters.page,
      limit: filters.limit,
    };
  }

  async findByIdForDoctor(id: string, doctorId: string): Promise<Quote | null> {
    const row = await this.quoteModel.findOne({
      where: { id, doctorId } as WhereOptions,
      include: [{ model: QuoteItemModel, as: 'items' }],
    });
    if (!row) return null;

    // Fetch the active (non-revoked) share link so the authenticated caller can
    // build the "Copy link" button without needing a separate round-trip.
    const link = await this.linkModel.findOne({
      where: { quoteId: id } as WhereOptions,
      order: [['createdAt', 'DESC']],
      attributes: ['token', 'revokedAt'],
    });
    const shareToken = link && link.revokedAt === null ? link.token : null;

    return this.toDomain(row, shareToken);
  }

  async findShareLinkByToken(token: string): Promise<QuoteShareLink | null> {
    const row = await this.linkModel.findOne({
      where: { token } as WhereOptions,
    });
    return row ? this.linkToDomain(row) : null;
  }

  async findQuoteByValidToken(token: string): Promise<Quote | null> {
    const link = await this.linkModel.findOne({
      where: { token } as WhereOptions,
    });
    if (!link || link.revokedAt !== null || link.expiresAt <= new Date()) {
      return null;
    }
    const quoteRow = await this.quoteModel.findOne({
      where: { id: link.quoteId } as WhereOptions,
      include: [{ model: QuoteItemModel, as: 'items' }],
    });
    return quoteRow ? this.toDomain(quoteRow) : null;
  }

  // --------------------------------------------------------------------------
  // Validation
  // --------------------------------------------------------------------------

  /**
   * Validates that all provided sourceIds belong to the doctor.
   * Items without a sourceId are skipped.
   *
   * Uses two batched IN queries — one for products, one for services — to
   * avoid N queries for N items.
   *
   * @throws {QuoteItemSourceNotFoundError} for any invalid sourceId.
   */
  async validateItemSources(
    items: Array<{ kind: 'service' | 'product' | 'manual'; sourceId: string | null }>,
    doctorId: string,
  ): Promise<void> {
    const productIds = items
      .filter((it) => it.kind === 'product' && it.sourceId !== null)
      .map((it) => it.sourceId as string);

    const serviceIds = items
      .filter((it) => it.kind === 'service' && it.sourceId !== null)
      .map((it) => it.sourceId as string);

    if (productIds.length > 0) {
      // IN (:ids), NO "= ANY(:ids)": con `replacements` Sequelize sustituye el
      // arreglo por una lista de literales entrecomillados, y ANY() espera un
      // arreglo de Postgres. Con `= ANY` la consulta moría con
      // "malformed array literal" y CUALQUIER cotización con un ítem del
      // catálogo devolvía 500. Los tests no lo veían: usan un Sequelize
      // simulado que verifica el SQL emitido, no que Postgres lo acepte.
      const found = await this.sequelize.query<{ id: string }>(
        `SELECT id FROM products
         WHERE id IN (:ids)
           AND doctor_id = :doctorId
           AND is_active = true`,
        { replacements: { ids: productIds, doctorId }, type: QueryTypes.SELECT },
      );
      const foundIds = new Set(found.map((r) => r.id));
      for (const id of productIds) {
        if (!foundIds.has(id)) {
          throw new QuoteItemSourceNotFoundError('product', id);
        }
      }
    }

    if (serviceIds.length > 0) {
      const found = await this.sequelize.query<{ id: string }>(
        // Mismo motivo que arriba: IN (:ids), nunca "= ANY(:ids)".
        `SELECT id FROM pricing_plans
         WHERE id IN (:ids)
           AND doctor_id = :doctorId
           AND is_active = true`,
        { replacements: { ids: serviceIds, doctorId }, type: QueryTypes.SELECT },
      );
      const foundIds = new Set(found.map((r) => r.id));
      for (const id of serviceIds) {
        if (!foundIds.has(id)) {
          throw new QuoteItemSourceNotFoundError('service', id);
        }
      }
    }
  }

  // --------------------------------------------------------------------------
  // Mutations
  // --------------------------------------------------------------------------

  async create(params: CreateQuoteParams): Promise<Quote> {
    return this.sequelize.transaction(async (t) => {
      // Advisory lock keyed to the doctor's ID — prevents concurrent inserts
      // from racing on the quote_number MAX() computation.
      await this.sequelize.query(
        `SELECT pg_advisory_xact_lock(('x' || substr(md5(:key), 1, 8))::bit(32)::int)`,
        { replacements: { key: `quote_number_${params.doctorId}` }, transaction: t },
      );

      // Compute next sequential quote number for this doctor
      const maxRow = await this.quoteModel.findOne({
        where: { doctorId: params.doctorId } as WhereOptions,
        order: [this.sequelize.literal('CAST(SUBSTRING(quote_number FROM 5) AS INTEGER) DESC')],
        attributes: ['quoteNumber'],
        transaction: t,
      });

      // Se saca CUALQUIER prefijo de 4 caracteres, no solo 'COT-'. El módulo se
      // renombró a Presupuestos y los números pasaron de COT- a PRE-; buscar
      // literalmente 'COT-' habría devuelto NaN sobre un número ya migrado y el
      // siguiente presupuesto habría chocado con el constraint (doctor, número).
      const nextSeq = maxRow?.quoteNumber
        ? parseInt(maxRow.quoteNumber.replace(/^[A-Z]{3}-/, ''), 10) + 1
        : 1;
      const quoteNumber = `PRE-${String(nextSeq).padStart(4, '0')}`;

      // Build items with amountUsd and compute totals via domain entity
      const itemsWithAmounts = this.buildItemsWithAmounts(params.items);
      const { subtotalUsd, discountUsd, totalUsd } = Quote.computeTotals(
        itemsWithAmounts,
        params.discountType,
        params.discountValue,
      );

      const quoteId = randomUUID();

      await this.quoteModel.create(
        {
          id: quoteId,
          doctorId: params.doctorId,
          quoteNumber,
          patientId: params.patientId,
          leadId: params.leadId,
          status: 'draft',
          validUntil: params.validUntil,
          notes: params.notes,
          subtotalUsd,
          discountType: params.discountType,
          discountValue: params.discountValue,
          discountUsd,
          totalUsd,
          bcvRate: null,
          totalBs: null,
          sentAt: null,
        },
        { transaction: t },
      );

      if (itemsWithAmounts.length > 0) {
        await this.itemModel.bulkCreate(
          itemsWithAmounts.map((it) => ({
            id: randomUUID(),
            quoteId,
            doctorId: params.doctorId,
            kind: it.kind,
            sourceId: it.sourceId,
            name: it.name,
            description: it.description,
            quantity: it.quantity,
            unitPriceUsd: it.unitPriceUsd,
            amountUsd: it.amountUsd,
            sortOrder: it.sortOrder,
          })),
          { transaction: t },
        );
      }

      const row = await this.quoteModel.findOne({
        where: { id: quoteId } as WhereOptions,
        include: [{ model: QuoteItemModel, as: 'items' }],
        transaction: t,
      });
      return this.toDomain(row!);
    });
  }

  async update(id: string, doctorId: string, params: UpdateQuoteParams): Promise<Quote> {
    return this.sequelize.transaction(async (t) => {
      // TOCTOU fix: require status = 'draft' in the fetch so a concurrent send
      // between the use case's guard check and this UPDATE is caught here.
      const row = await this.quoteModel.findOne({
        where: { id, doctorId, status: 'draft' } as WhereOptions,
        include: [{ model: QuoteItemModel, as: 'items' }],
        transaction: t,
      });
      if (!row) {
        // Quote not found OR it was sent concurrently — unify the check by
        // looking up existence without status filter.
        const exists = await this.quoteModel.findOne({
          where: { id, doctorId } as WhereOptions,
          attributes: ['id', 'status'],
          transaction: t,
        });
        if (!exists) throw new QuoteNotFoundError();
        throw new QuoteAlreadySentError();
      }

      const updateFields: Record<string, unknown> = {};
      if (params.patientId !== undefined) updateFields['patientId'] = params.patientId;
      if (params.leadId !== undefined) updateFields['leadId'] = params.leadId;
      if (params.validUntil !== undefined) updateFields['validUntil'] = params.validUntil;
      if (params.notes !== undefined) updateFields['notes'] = params.notes;
      if (params.discountType !== undefined) updateFields['discountType'] = params.discountType;
      if (params.discountValue !== undefined) updateFields['discountValue'] = params.discountValue;

      // Unset fields fall back to whatever the row already has — a partial
      // update (e.g. only discountValue) must not silently reset the other half.
      const discountType: QuoteDiscountType =
        params.discountType ?? (row.discountType as QuoteDiscountType);
      const discountValue =
        params.discountValue !== undefined ? params.discountValue : parseFloat(row.discountValue);
      const discountChanged =
        params.discountType !== undefined || params.discountValue !== undefined;

      if (params.items !== undefined) {
        const itemsWithAmounts = this.buildItemsWithAmounts(params.items);
        const { subtotalUsd, discountUsd, totalUsd } = Quote.computeTotals(
          itemsWithAmounts,
          discountType,
          discountValue,
        );

        updateFields['subtotalUsd'] = subtotalUsd;
        updateFields['discountUsd'] = discountUsd;
        updateFields['totalUsd'] = totalUsd;

        await this.itemModel.destroy({ where: { quoteId: id } as WhereOptions, transaction: t });
        if (itemsWithAmounts.length > 0) {
          await this.itemModel.bulkCreate(
            itemsWithAmounts.map((it) => ({
              id: randomUUID(),
              quoteId: id,
              doctorId,
              kind: it.kind,
              sourceId: it.sourceId,
              name: it.name,
              description: it.description,
              quantity: it.quantity,
              unitPriceUsd: it.unitPriceUsd,
              amountUsd: it.amountUsd,
              sortOrder: it.sortOrder,
            })),
            { transaction: t },
          );
        }
      } else if (discountChanged) {
        const subtotalUsd = parseFloat(row.subtotalUsd);
        // Recompute using the existing subtotal and the new discount input.
        const discountUsd = Quote.computeDiscount(subtotalUsd, discountType, discountValue);
        const correctedTotal = Math.round(Math.max(0, subtotalUsd - discountUsd) * 100) / 100;
        updateFields['discountUsd'] = discountUsd;
        updateFields['totalUsd'] = correctedTotal;
      }

      if (Object.keys(updateFields).length > 0) {
        await this.quoteModel.update(updateFields, {
          where: { id, doctorId, status: 'draft' } as WhereOptions,
          transaction: t,
        });
      }

      const updated = await this.quoteModel.findOne({
        where: { id, doctorId } as WhereOptions,
        include: [{ model: QuoteItemModel, as: 'items' }],
        transaction: t,
      });
      return this.toDomain(updated!);
    });
  }

  async markAsSent(id: string, doctorId: string, params: SendQuoteParams): Promise<Quote> {
    return this.sequelize.transaction(async (t) => {
      // TOCTOU fix: UPDATE with status = 'draft' in WHERE.
      // If a concurrent send already changed status, affected = 0 → 409.
      const [affected] = await this.quoteModel.update(
        {
          status: 'sent',
          bcvRate: params.bcvRate,
          totalBs: params.totalBs,
          sentAt: new Date(),
        },
        {
          where: { id, doctorId, status: 'draft' } as WhereOptions,
          transaction: t,
        },
      );

      if (affected === 0) {
        // Either not found or already sent — check which case it is.
        const exists = await this.quoteModel.findOne({
          where: { id, doctorId } as WhereOptions,
          attributes: ['id', 'status'],
          transaction: t,
        });
        if (!exists) throw new QuoteNotFoundError();
        throw new QuoteAlreadySentError();
      }

      await this.linkModel.create(
        {
          id: params.shareLink.id,
          quoteId: params.shareLink.quoteId,
          token: params.shareLink.token,
          expiresAt: params.shareLink.expiresAt,
          createdAt: params.shareLink.createdAt,
          revokedAt: null,
        },
        { transaction: t },
      );

      const updated = await this.quoteModel.findOne({
        where: { id, doctorId } as WhereOptions,
        include: [{ model: QuoteItemModel, as: 'items' }],
        transaction: t,
      });
      // The token was just created — inject it directly without a second DB round-trip.
      return this.toDomain(updated!, params.shareLink.token);
    });
  }

  /**
   * @param expectedStatus  Estado que el llamador leyó antes de decidir la transición.
   *                        Se incluye en el WHERE para cerrar la carrera: si otra
   *                        petición ya cambió el estado, este UPDATE afecta 0 filas.
   */
  async updateStatus(
    id: string,
    doctorId: string,
    status: QuoteStatus,
    expectedStatus?: QuoteStatus,
  ): Promise<Quote> {
    // La validación de la transición se hace en memoria sobre una lectura previa.
    // Sin condicionar el UPDATE al estado esperado, dos respuestas casi simultáneas
    // —el paciente con el enlace abierto en dos pestañas— leen ambas 'sent', pasan
    // ambas la validación y escriben las dos: la segunda pisa a la primera sin que
    // nadie vea un error, y el presupuesto puede quedar en un estado distinto del
    // que el paciente cree haber elegido. Con la guarda, la segunda afecta 0 filas.
    const where = (
      expectedStatus !== undefined ? { id, doctorId, status: expectedStatus } : { id, doctorId }
    ) as WhereOptions;

    const [affected] = await this.quoteModel.update({ status }, { where });
    if (affected === 0) {
      // Con expectedStatus, 0 filas puede ser "no existe" o "ya no está en ese
      // estado". Se distingue leyendo: si la fila existe, perdió la carrera.
      if (expectedStatus !== undefined) {
        const actual = await this.quoteModel.findOne({
          where: { id, doctorId } as WhereOptions,
        });
        if (actual) {
          throw new QuoteInvalidStatusTransitionError(actual.status as QuoteStatus, status);
        }
      }
      throw new QuoteNotFoundError();
    }
    const row = await this.quoteModel.findOne({
      where: { id, doctorId } as WhereOptions,
      include: [{ model: QuoteItemModel, as: 'items' }],
    });
    return this.toDomain(row!);
  }

  async delete(id: string, doctorId: string): Promise<void> {
    const row = await this.quoteModel.findOne({
      where: { id, doctorId } as WhereOptions,
    });
    if (!row) {
      throw new QuoteNotFoundError();
    }
    if (row.status !== 'draft') {
      throw new QuoteAlreadySentError();
    }
    await this.quoteModel.destroy({ where: { id, doctorId } as WhereOptions });
  }

  async findItemsByQuoteId(quoteId: string): Promise<QuoteItem[]> {
    const rows = await this.itemModel.findAll({
      where: { quoteId } as WhereOptions,
      order: [['sortOrder', 'ASC']],
    });
    return rows.map((r) => this.itemToDomain(r));
  }

  // --------------------------------------------------------------------------
  // Expiry sweep + reminder (cron)
  // --------------------------------------------------------------------------

  async findQuotesNearingExpiry(windowEnd: Date, cap: number): Promise<Quote[]> {
    const rows = await this.quoteModel.findAll({
      where: {
        status: 'sent',
        validUntil: { [Op.ne]: null, [Op.lte]: windowEnd },
      } as WhereOptions,
      include: [{ model: QuoteItemModel, as: 'items' }],
      order: [['validUntil', 'ASC']],
      limit: cap,
    });
    if (rows.length === 0) return [];

    // Batch-fetch active share links for these quotes — one query, not N.
    const links = await this.linkModel.findAll({
      where: {
        quoteId: rows.map((r) => r.id),
        revokedAt: null,
      } as WhereOptions,
      order: [['createdAt', 'DESC']],
      attributes: ['quoteId', 'token'],
    });
    // Rows are ordered DESC so the first occurrence per quoteId is the most
    // recent active link (there should only ever be one, but be defensive).
    const tokenByQuoteId = new Map<string, string>();
    for (const link of links) {
      if (!tokenByQuoteId.has(link.quoteId)) {
        tokenByQuoteId.set(link.quoteId, link.token);
      }
    }

    return rows.map((r) => this.toDomain(r, tokenByQuoteId.get(r.id) ?? null));
  }

  async markExpiryReminderSent(id: string, sentAt: Date): Promise<void> {
    await this.quoteModel.update(
      { expiryReminderSentAt: sentAt },
      { where: { id } as WhereOptions },
    );
  }

  // --------------------------------------------------------------------------
  // Private helpers
  // --------------------------------------------------------------------------

  /**
   * Computes amountUsd per item using the domain entity formula.
   * Centralised here so `create` and `update` stay consistent.
   */
  private buildItemsWithAmounts(
    items: CreateQuoteItemParams[],
  ): Array<CreateQuoteItemParams & { amountUsd: number }> {
    return items.map((it) => ({
      ...it,
      amountUsd: Math.round(it.quantity * it.unitPriceUsd * 100) / 100,
    }));
  }

  /**
   * Maps a QuoteModel row to a domain Quote.
   *
   * @param shareToken  Active (non-revoked) share link token. Pass null for draft
   *                    quotes and for any path that must not expose the token
   *                    (e.g. the public endpoint).
   */
  private toDomain(row: QuoteModel, shareToken: string | null = null): Quote {
    const itemRows = (row.items ?? []) as QuoteItemModel[];
    return Quote.create({
      id: row.id,
      doctorId: row.doctorId,
      quoteNumber: row.quoteNumber,
      patientId: row.patientId,
      leadId: row.leadId,
      status: row.status as QuoteStatus,
      validUntil: row.validUntil,
      notes: row.notes,
      subtotalUsd: parseFloat(row.subtotalUsd),
      discountType: row.discountType as QuoteDiscountType,
      discountValue: parseFloat(row.discountValue),
      discountUsd: parseFloat(row.discountUsd),
      totalUsd: parseFloat(row.totalUsd),
      bcvRate: row.bcvRate !== null ? parseFloat(row.bcvRate) : null,
      totalBs: row.totalBs !== null ? parseFloat(row.totalBs) : null,
      sentAt: row.sentAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      expiryReminderSentAt: row.expiryReminderSentAt,
      items: itemRows.map((i) => this.itemToDomain(i)),
      shareToken,
    });
  }

  private itemToDomain(row: QuoteItemModel): QuoteItem {
    return QuoteItem.fromPersisted({
      id: row.id,
      quoteId: row.quoteId,
      doctorId: row.doctorId,
      kind: row.kind as QuoteItemKind,
      sourceId: row.sourceId,
      name: row.name,
      description: row.description,
      quantity: parseFloat(row.quantity),
      unitPriceUsd: parseFloat(row.unitPriceUsd),
      amountUsd: parseFloat(row.amountUsd),
      sortOrder: row.sortOrder,
    });
  }

  private linkToDomain(row: QuoteShareLinkModel): QuoteShareLink {
    return QuoteShareLink.create({
      id: row.id,
      quoteId: row.quoteId,
      token: row.token,
      expiresAt: row.expiresAt,
      createdAt: row.createdAt,
      revokedAt: row.revokedAt,
    });
  }
}
