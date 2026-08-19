import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import type { Transaction } from 'sequelize';

import { ConsultationBlock } from '../../../domain/entities/consultation-block.entity';
import type {
  CatalogRow,
  DoctorBlockRow,
  IConsultationBlockRepository,
  SaveDoctorBlocksParams,
  SpecialtyDefaultRow,
} from '../../../domain/repositories/consultation-block.repository';
import { ConsultationBlockCatalogModel } from '../models/consultation-block-catalog.model';
import { DoctorConsultationBlockModel } from '../models/doctor-consultation-block.model';
import { SpecialtyDefaultBlockModel } from '../models/specialty-default-block.model';
import { DoctorProfileModel } from '../../../../doctor-settings/infrastructure/database/models/doctor-profile.model';

/**
 * Sequelize implementation of IConsultationBlockRepository.
 *
 * Notes:
 *   - We reuse DoctorProfileModel from doctor-settings — it maps the same `profiles`
 *     table and is already registered globally via SequelizeModule.forFeature in
 *     DoctorSettingsModule. We register it again here to get @InjectModel working.
 *   - resolveBlocks replicates the merge algorithm from lib/consultation-blocks.ts
 *     (frontend legacy) — see inline comments for cascade rules.
 *   - replaceDoctorBlocks runs inside a Sequelize transaction to guarantee atomicity.
 */
@Injectable()
export class SequelizeConsultationBlockRepository implements IConsultationBlockRepository {
  constructor(
    @InjectModel(ConsultationBlockCatalogModel)
    private readonly catalogModel: typeof ConsultationBlockCatalogModel,

    @InjectModel(DoctorConsultationBlockModel)
    private readonly doctorBlockModel: typeof DoctorConsultationBlockModel,

    @InjectModel(SpecialtyDefaultBlockModel)
    private readonly specialtyModel: typeof SpecialtyDefaultBlockModel,

    @InjectModel(DoctorProfileModel)
    private readonly profileModel: typeof DoctorProfileModel,

    private readonly sequelize: Sequelize,
  ) {}

  // ── listCatalog ───────────────────────────────────────────────────────────

  async listCatalog(): Promise<CatalogRow[]> {
    const rows = await this.catalogModel.findAll({ order: [['key', 'ASC']] });
    return rows.map((r) => ({
      key: r.key,
      defaultLabel: r.defaultLabel,
      defaultContentType: r.defaultContentType,
      defaultPrintable: r.defaultPrintable,
      defaultSendToPatient: r.defaultSendToPatient,
      defaultEnabled: r.defaultEnabled,
      defaultSortOrder: r.defaultSortOrder,
      description: r.description,
    }));
  }

  // ── getCatalogKeySet ──────────────────────────────────────────────────────

  async getCatalogKeySet(): Promise<Set<string>> {
    const rows = await this.catalogModel.findAll({ attributes: ['key'] });
    return new Set(rows.map((r) => r.key));
  }

  // ── listSpecialtyDefaults ─────────────────────────────────────────────────

  async listSpecialtyDefaults(
    specialty: string | null | undefined,
  ): Promise<SpecialtyDefaultRow[]> {
    if (!specialty) return [];
    const rows = await this.specialtyModel.findAll({
      where: { specialty },
      order: [['sort_order', 'ASC']],
    });
    return rows.map((r) => ({
      specialty: r.specialty,
      blockKey: r.blockKey,
      enabled: r.enabled,
      sortOrder: r.sortOrder,
    }));
  }

  // ── listDoctorBlocks ──────────────────────────────────────────────────────

  async listDoctorBlocks(doctorId: string): Promise<DoctorBlockRow[]> {
    const rows = await this.doctorBlockModel.findAll({ where: { doctorId } });
    return rows.map((r) => ({
      doctorId: r.doctorId,
      blockKey: r.blockKey,
      enabled: r.enabled,
      sortOrder: r.sortOrder,
      customLabel: r.customLabel,
      customContentType: r.customContentType,
      customDescription: r.customDescription,
      printable: r.printable,
      sendToPatient: r.sendToPatient,
    }));
  }

  // ── getDoctorSpecialty ────────────────────────────────────────────────────

  async getDoctorSpecialty(doctorId: string): Promise<string | null> {
    const profile = await this.profileModel.findByPk(doctorId, {
      attributes: ['specialty'],
    });
    return profile?.specialty ?? null;
  }

  // ── getDoctorLayout ───────────────────────────────────────────────────────

  async getDoctorLayout(doctorId: string): Promise<'tabs' | 'vertical'> {
    const profile = await this.profileModel.findByPk(doctorId, {
      attributes: ['consultation_blocks_layout'],
    });
    const raw = (profile as unknown as { consultation_blocks_layout?: string | null })
      ?.consultation_blocks_layout;
    // Sin preferencia guardada (columna nullable) el default es VERTICAL: la
    // consulta se lee de corrido como una historia clínica, y en pestañas los
    // bloques que no están al frente quedan invisibles. Un especialista que ya
    // eligió 'tabs' lo conserva — por eso se compara contra 'tabs' y no al revés.
    return raw === 'tabs' ? 'tabs' : 'vertical';
  }

  // ── setDoctorLayout ───────────────────────────────────────────────────────

  async setDoctorLayout(doctorId: string, layout: 'tabs' | 'vertical'): Promise<void> {
    await this.profileModel.update(
      { consultationBlocksLayout: layout } as Record<string, unknown>,
      { where: { id: doctorId } },
    );
  }

  // ── replaceDoctorBlocks ───────────────────────────────────────────────────

  async replaceDoctorBlocks(params: SaveDoctorBlocksParams): Promise<number> {
    const { doctorId, blocks } = params;

    await this.sequelize.transaction(async (t: Transaction) => {
      // Step 1: delete all existing rows for this doctor
      await this.doctorBlockModel.destroy({ where: { doctorId }, transaction: t });

      // Step 2: bulk insert the new set (skip if empty to avoid empty INSERT)
      if (blocks.length > 0) {
        await this.doctorBlockModel.bulkCreate(
          blocks.map((b) => ({
            doctorId,
            blockKey: b.blockKey,
            enabled: b.enabled,
            sortOrder: b.sortOrder,
            customLabel: b.customLabel,
            customContentType: b.customContentType,
            customDescription: b.customDescription,
            printable: b.printable,
            sendToPatient: b.sendToPatient,
          })),
          { transaction: t },
        );
      }
    });

    return blocks.length;
  }

  // ── resolveBlocks ─────────────────────────────────────────────────────────

  /**
   * Replicates the merge algorithm from apps/frontend/lib/consultation-blocks.ts.
   *
   * Cascade (highest priority first):
   *   1. doctor_consultation_blocks — if the doctor has an entry for this key,
   *      their enabled, label, content_type, sort_order, printable, send_to_patient,
   *      and custom_description all take precedence.
   *   2. specialty_default_blocks — if the doctor's specialty has a default for
   *      this key, use its enabled and sort_order (label/content_type from catalog).
   *   3. consultation_block_catalog — default_enabled determines inclusion;
   *      default_label, default_content_type, default_printable, default_send_to_patient,
   *      and description are the ultimate fallbacks.
   *
   * Description cascade:
   *   resolved description = doctorEntry.customDescription ?? catalog.description
   *
   * Only blocks with enabled=true appear in the result.
   * Sorted by sort_order ASC, key ASC as tiebreaker.
   */
  async resolveBlocks(
    doctorId: string,
    specialty: string | null | undefined,
  ): Promise<ConsultationBlock[]> {
    const [catalogRows, specialtyRows, doctorRows] = await Promise.all([
      this.catalogModel.findAll(),
      specialty
        ? this.specialtyModel.findAll({ where: { specialty } })
        : Promise.resolve([] as SpecialtyDefaultBlockModel[]),
      this.doctorBlockModel.findAll({ where: { doctorId } }),
    ]);

    const specialtyMap = new Map(specialtyRows.map((s) => [s.blockKey, s]));
    const doctorMap = new Map(doctorRows.map((d) => [d.blockKey, d]));

    const blocks: ConsultationBlock[] = [];

    for (const cat of catalogRows) {
      const specialtyEntry = specialtyMap.get(cat.key);
      const doctorEntry = doctorMap.get(cat.key);

      // Cascade: enabled
      let enabled: boolean;
      if (doctorEntry !== undefined) {
        enabled = doctorEntry.enabled;
      } else if (specialtyEntry !== undefined) {
        enabled = specialtyEntry.enabled;
      } else {
        enabled = cat.defaultEnabled;
      }

      if (!enabled) continue;

      // Cascade: label
      const label = doctorEntry?.customLabel ?? cat.defaultLabel;

      // Cascade: content_type
      const contentType = (doctorEntry?.customContentType ??
        cat.defaultContentType) as ConsultationBlock['contentType'];

      // Cascade: sort_order
      // Falls back to catalog's default_sort_order (set per migration 20260714000001)
      // instead of a hardcoded 99, so doctors with no override get the canonical order.
      const sortOrder = doctorEntry?.sortOrder ?? specialtyEntry?.sortOrder ?? cat.defaultSortOrder;

      // Cascade: printable
      const printable = doctorEntry?.printable ?? cat.defaultPrintable;

      // Cascade: send_to_patient
      const sendToPatient = doctorEntry?.sendToPatient ?? cat.defaultSendToPatient;

      // Cascade: description (resolved = customDescription ?? catalog.description)
      const customDescription = doctorEntry?.customDescription ?? null;
      const description = customDescription ?? cat.description;

      blocks.push(
        new ConsultationBlock({
          key: cat.key,
          label,
          contentType,
          enabled,
          sortOrder,
          printable,
          sendToPatient,
          description,
          customDescription,
        }),
      );
    }

    // Sort by sort_order ASC, then key ASC as tiebreaker
    blocks.sort((a, b) => a.sortOrder - b.sortOrder || a.key.localeCompare(b.key));

    return blocks;
  }
}
