import { Inject, Injectable } from '@nestjs/common';
import {
  DOCTOR_DOCUMENT_FILE_REPOSITORY,
  type IDoctorDocumentFileRepository,
} from '../../domain/repositories/doctor-document-file.repository';
import type { DoctorDocumentFile } from '../../domain/entities/doctor-document-file.entity';

export interface DoctorDocumentFileListItem {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

@Injectable()
export class ListDoctorDocumentFilesUseCase {
  constructor(
    @Inject(DOCTOR_DOCUMENT_FILE_REPOSITORY)
    private readonly repo: IDoctorDocumentFileRepository,
  ) {}

  async execute(doctorId: string): Promise<DoctorDocumentFileListItem[]> {
    const files = await this.repo.findAllByDoctor(doctorId);
    return files.map((f) => this.toOutput(f));
  }

  private toOutput(f: DoctorDocumentFile): DoctorDocumentFileListItem {
    return {
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      sizeBytes: f.sizeBytes,
      createdAt: f.createdAt.toISOString(),
    };
  }
}
