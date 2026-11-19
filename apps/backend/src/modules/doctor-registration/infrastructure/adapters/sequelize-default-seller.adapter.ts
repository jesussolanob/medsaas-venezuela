import { Injectable, Logger } from '@nestjs/common';
import { QueryTypes } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { randomUUID } from 'crypto';
import type { IDefaultSellerPort } from '../../application/ports/default-seller.port';

/** app_settings key that stores the default seller's profile UUID (or empty). */
const SETTING_KEY = 'default_seller_id';

interface SettingRow {
  value: string;
}

interface SellerRow {
  id: string;
}

/**
 * SequelizeDefaultSellerAdapter
 *
 * Infrastructure implementation of IDefaultSellerPort using raw SQL.
 *
 * Uses raw queries to access:
 *   - app_settings (read the configured default seller UUID)
 *   - profiles     (validate the seller is active and has role='seller')
 *   - profiles     (write sold_by + sold_by_source = 'admin')
 *   - seller_attribution_logs (write the audit row)
 *
 * SECURITY: logs only profile IDs — never names, emails, or any other PII.
 *
 * NOTE: Sequelize is registered globally by SequelizeModule.forRootAsync in
 * AppModule and injected here without an additional providers[] entry.
 */
@Injectable()
export class SequelizeDefaultSellerAdapter implements IDefaultSellerPort {
  private readonly logger = new Logger(SequelizeDefaultSellerAdapter.name);

  constructor(private readonly sequelize: Sequelize) {}

  // ---------------------------------------------------------------------------
  // resolveDefaultSellerId
  // ---------------------------------------------------------------------------

  async resolveDefaultSellerId(): Promise<string | null> {
    // 1. Read the configured value from app_settings.
    const settingRows = await this.sequelize.query<SettingRow>(
      `SELECT value FROM app_settings WHERE key = :key LIMIT 1`,
      {
        replacements: { key: SETTING_KEY },
        type: QueryTypes.SELECT,
      },
    );

    const rawValue = settingRows[0]?.value?.trim() ?? '';

    if (!rawValue) {
      // Not configured — this is the normal state before an admin sets the value.
      this.logger.debug('[default-seller] setting not configured — skipping');
      return null;
    }

    // 2. Validate that the stored UUID points to an active seller.
    const sellerRows = await this.sequelize.query<SellerRow>(
      `SELECT id
         FROM profiles
        WHERE id       = :sellerId
          AND role     = 'seller'
          AND is_active IS DISTINCT FROM false
        LIMIT 1`,
      {
        replacements: { sellerId: rawValue },
        type: QueryTypes.SELECT,
      },
    );

    if (!sellerRows[0]) {
      // The stored UUID is invalid, deleted, or the seller has been deactivated.
      // Log WARN so operators can detect the misconfiguration via observability.
      this.logger.warn(
        `[default-seller] configured seller is not found or inactive — sellerId=${rawValue}`,
      );
      return null;
    }

    return sellerRows[0].id;
  }

  // ---------------------------------------------------------------------------
  // assignDefaultSeller
  // ---------------------------------------------------------------------------

  async assignDefaultSeller(specialistId: string, sellerId: string): Promise<void> {
    const t = await this.sequelize.transaction();

    try {
      // 1. Write sold_by and sold_by_source='admin' — only when sold_by IS NULL.
      //    Using raw SQL to access the affectedRows count without an ORM model
      //    registered in this module.
      const [, affectedRows] = await this.sequelize.query(
        `UPDATE profiles
            SET sold_by        = :sellerId,
                sold_by_source = 'admin'
          WHERE id      = :specialistId
            AND sold_by IS NULL`,
        {
          replacements: { specialistId, sellerId },
          type: QueryTypes.UPDATE,
          transaction: t,
        },
      );

      if ((affectedRows as number) === 0) {
        // sold_by was already set (seller code, manual invite, or previous default).
        // This is expected on re-submit — just roll back and return.
        await t.rollback();
        this.logger.debug(
          `[default-seller] sold_by already set — skipped specialistId=${specialistId}`,
        );
        return;
      }

      // 2. Append audit row in seller_attribution_logs.
      //    assigned_by = NULL: system-initiated (no human actor).
      //    from_seller_id = NULL: specialist had no prior seller.
      //    Migration 20261118000001 made assigned_by nullable to support this.
      await this.sequelize.query(
        `INSERT INTO seller_attribution_logs
           (id, specialist_id, from_seller_id, to_seller_id, assigned_by, assigned_at)
         VALUES
           (:id, :specialistId, NULL, :sellerId, NULL, NOW())`,
        {
          replacements: {
            id: randomUUID(),
            specialistId,
            sellerId,
          },
          type: QueryTypes.INSERT,
          transaction: t,
        },
      );

      await t.commit();

      this.logger.log(
        `[default-seller] assigned specialistId=${specialistId} to sellerId=${sellerId}`,
      );
    } catch (err) {
      await t.rollback();
      throw err;
    }
  }
}
