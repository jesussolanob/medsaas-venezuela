import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { ProfileModel } from '../models/profile.model';
import type {
  IBookingDoctorLoader,
  DoctorPublicInfo,
} from '../../../domain/repositories/booking-doctor.repository';

/**
 * Implements IBookingDoctorLoader for the booking flow.
 *
 * Reads doctor public info from the profiles table — read-only, no writes here.
 */
@Injectable()
export class SequelizeBookingDoctorRepository implements IBookingDoctorLoader {
  constructor(
    @InjectModel(ProfileModel)
    private readonly profileModel: typeof ProfileModel,
  ) {}

  async findById(doctorId: string): Promise<DoctorPublicInfo | null> {
    const row = await this.profileModel.findOne({
      where: { id: doctorId },
      attributes: [
        'id',
        'fullName',
        'specialty',
        'professionalTitle',
        'paymentMethods',
        'avatarUrl',
        'allowsOnline',
        'officeAddress',
        'city',
        'state',
        'isActive',
      ],
    });

    if (!row) return null;

    return {
      id: row.id,
      fullName: row.fullName,
      specialty: row.specialty,
      professionalTitle: row.professionalTitle,
      paymentMethods: row.paymentMethods,
      allowsOnline: row.allowsOnline,
      officeAddress: row.officeAddress,
      city: row.city,
      avatarUrl: row.avatarUrl,
      isActive: row.isActive,
    };
  }
}
