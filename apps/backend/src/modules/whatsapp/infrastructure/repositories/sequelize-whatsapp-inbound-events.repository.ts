import { Injectable } from '@nestjs/common';
import { QueryTypes } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import type { IWhatsAppInboundEvents } from '../../domain/ports/iwhatsapp-inbound-events.port';

/**
 * INSERT … ON CONFLICT DO NOTHING RETURNING: a single atomic statement, so two
 * concurrent retries of the same message can't both win.
 *
 * NOTE: Sequelize is provided globally by SequelizeModule.forRootAsync in AppModule.
 */
@Injectable()
export class SequelizeWhatsAppInboundEventsRepository implements IWhatsAppInboundEvents {
  constructor(private readonly sequelize: Sequelize) {}

  async claim(messageId: string): Promise<boolean> {
    const rows = await this.sequelize.query<{ message_id: string }>(
      `INSERT INTO whatsapp_inbound_events (message_id)
       VALUES (:messageId)
       ON CONFLICT (message_id) DO NOTHING
       RETURNING message_id`,
      { replacements: { messageId }, type: QueryTypes.SELECT },
    );
    return rows.length > 0;
  }
}
