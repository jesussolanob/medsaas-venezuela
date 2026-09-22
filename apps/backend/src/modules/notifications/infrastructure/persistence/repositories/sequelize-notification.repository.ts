import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import type { WhereOptions } from 'sequelize';
import {
  Notification,
  type NotificationEntityType,
  type NotificationType,
} from '../../../domain/entities/notification.entity';
import type { INotificationRepository } from '../../../domain/repositories/inotification.repository';
import { NotificationModel } from '../models/notification.model';

/**
 * Sequelize implementation of INotificationRepository.
 *
 * All queries scope to doctor_id to enforce anti-IDOR at the DB layer.
 * No encryption — notification content is explicitly PII-free by design.
 */
@Injectable()
export class SequelizeNotificationRepository implements INotificationRepository {
  constructor(
    @InjectModel(NotificationModel)
    private readonly model: typeof NotificationModel,
  ) {}

  async create(notification: Notification): Promise<Notification> {
    const row = await this.model.create({
      id: notification.id,
      doctorId: notification.doctorId,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      entityType: notification.entityType,
      entityId: notification.entityId,
      readAt: notification.readAt,
      // `createdAt` va EXPLÍCITO. El modelo declara `timestamps: false` (la tabla
      // no tiene updated_at), así que Sequelize NO lo rellena solo: con la columna
      // en allowNull:false, omitirlo hacía fallar la validación del modelo ANTES
      // de llegar a Postgres — donde la columna sí tiene DEFAULT NOW().
      // El error caía en el catch best-effort de quotes, así que la aceptación y
      // el cobro funcionaban y la notificación NO se creaba nunca, en silencio.
      // Detectado en staging el 2026-09-22; los tests no podían verlo porque usan
      // un Sequelize simulado que nunca corre la validación del modelo.
      createdAt: notification.createdAt,
    });

    return this.toDomain(row);
  }

  async listForDoctor(doctorId: string, limit = 30): Promise<Notification[]> {
    const rows = await this.model.findAll({
      where: { doctorId } as WhereOptions,
      order: [['createdAt', 'DESC']],
      limit,
    });

    return rows.map((r) => this.toDomain(r));
  }

  async countUnreadForDoctor(doctorId: string): Promise<number> {
    return this.model.count({
      where: {
        doctorId,
        readAt: null,
      } as WhereOptions,
    });
  }

  async findByIdForDoctor(id: string, doctorId: string): Promise<Notification | null> {
    const row = await this.model.findOne({
      where: { id, doctorId } as WhereOptions,
    });

    if (!row) return null;
    return this.toDomain(row);
  }

  async markAsRead(id: string, doctorId: string, readAt: Date): Promise<boolean> {
    const [affectedRows] = await this.model.update(
      { readAt },
      {
        where: {
          id,
          doctorId,
          readAt: null,
        } as WhereOptions,
      },
    );

    return affectedRows > 0;
  }

  async markAllAsRead(doctorId: string, readAt: Date): Promise<number> {
    const [affectedRows] = await this.model.update(
      { readAt },
      {
        where: {
          doctorId,
          readAt: null,
        } as WhereOptions,
      },
    );

    return affectedRows;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private toDomain(row: NotificationModel): Notification {
    return Notification.create({
      id: row.id,
      doctorId: row.doctorId,
      type: row.type as NotificationType,
      title: row.title,
      body: row.body,
      entityType: (row.entityType as NotificationEntityType) ?? null,
      entityId: row.entityId ?? null,
      readAt: row.readAt ?? null,
      createdAt: row.createdAt,
    });
  }
}
