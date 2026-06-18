import { Test, type TestingModule } from '@nestjs/testing';
import { DocumentSharingController } from './document-sharing.controller';
import { ShareConsultationUseCase } from '../../application/use-cases/document-sharing/share-consultation.use-case';
import { VerifyCodeUseCase } from '../../application/use-cases/document-sharing/verify-code.use-case';
import { DownloadDocumentUseCase } from '../../application/use-cases/document-sharing/download-document.use-case';
import { RequestNewCodeUseCase } from '../../application/use-cases/document-sharing/request-new-code.use-case';
import { AppAuthGuard } from '../../../../infrastructure/auth/app-auth.guard';
import { DocumentLinkNotFoundError } from '../../domain/errors/document-link-not-found.error';
import { InvalidAccessCodeError } from '../../domain/errors/invalid-access-code.error';
import { CodeRequestRateLimitedError } from '../../domain/errors/code-request-rate-limited.error';
import { InvalidSessionTokenError } from '../../domain/errors/invalid-session-token.error';
import type { Response } from 'express';

const mockShareUseCase = { execute: jest.fn() };
const mockVerifyUseCase = { execute: jest.fn() };
const mockDownloadUseCase = { execute: jest.fn() };
const mockRequestCodeUseCase = { execute: jest.fn() };

const mockUser = { sub: 'doctor-1', role: 'doctor', email: 'doctor@test.com' };

describe('DocumentSharingController', () => {
  let controller: DocumentSharingController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DocumentSharingController],
      providers: [
        { provide: ShareConsultationUseCase, useValue: mockShareUseCase },
        { provide: VerifyCodeUseCase, useValue: mockVerifyUseCase },
        { provide: DownloadDocumentUseCase, useValue: mockDownloadUseCase },
        { provide: RequestNewCodeUseCase, useValue: mockRequestCodeUseCase },
      ],
    })
      .overrideGuard(AppAuthGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    controller = module.get<DocumentSharingController>(DocumentSharingController);
  });

  // ---------------------------------------------------------------------------
  // share
  // ---------------------------------------------------------------------------

  describe('share', () => {
    it('returns success envelope with url, code, expiresAt', async () => {
      const expiresAt = new Date(Date.now() + 48 * 3600 * 1000);
      mockShareUseCase.execute.mockResolvedValue({
        url: 'http://localhost:3000/documents/abc123',
        code: '654321',
        expiresAt,
      });

      const result = await controller.share(
        'consult-1',
        { sections: { report: true, prescriptions: false, ehr: false } },
        mockUser as Parameters<typeof controller.share>[2],
      );

      expect(result.success).toBe(true);
      expect(result.data.url).toContain('/documents/');
      expect(result.data.code).toBe('654321');
      expect(result.data.expiresAt).toBe(expiresAt.toISOString());
    });

    it('passes doctorId from user.sub (never from body)', async () => {
      mockShareUseCase.execute.mockResolvedValue({
        url: 'http://localhost:3000/documents/x',
        code: '000000',
        expiresAt: new Date(),
      });

      await controller.share(
        'consult-1',
        { sections: { report: true, prescriptions: false, ehr: false } },
        mockUser as Parameters<typeof controller.share>[2],
      );

      const callArg = mockShareUseCase.execute.mock.calls[0]?.[0] as { doctorId: string };
      expect(callArg.doctorId).toBe('doctor-1');
    });
  });

  // ---------------------------------------------------------------------------
  // verifyCode
  // ---------------------------------------------------------------------------

  describe('verifyCodeEndpoint', () => {
    it('returns success with sessionToken and sections', async () => {
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
      mockVerifyUseCase.execute.mockResolvedValue({
        sessionToken: 'tok.sig',
        sections: { report: true, prescriptions: false, ehr: false },
        expiresAt,
      });

      const result = await controller.verifyCodeEndpoint('link-token', {
        code: '123456',
        cedula: 'V-12345678',
      });

      expect(result.success).toBe(true);
      expect(result.data.sessionToken).toBe('tok.sig');
    });

    it('passes both code and cedula to the use case', async () => {
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
      mockVerifyUseCase.execute.mockResolvedValue({
        sessionToken: 'tok.sig',
        sections: { report: true, prescriptions: false, ehr: false },
        expiresAt,
      });

      await controller.verifyCodeEndpoint('link-token', {
        code: '654321',
        cedula: 'V-12.345.678',
      });

      const callArg = mockVerifyUseCase.execute.mock.calls[0]?.[0] as {
        token: string;
        code: string;
        cedula: string;
      };
      expect(callArg.token).toBe('link-token');
      expect(callArg.code).toBe('654321');
      expect(callArg.cedula).toBe('V-12.345.678');
    });

    it('propagates InvalidAccessCodeError from use case', async () => {
      mockVerifyUseCase.execute.mockRejectedValue(new InvalidAccessCodeError());

      await expect(
        controller.verifyCodeEndpoint('link-token', { code: '000000', cedula: 'V-12345678' }),
      ).rejects.toBeInstanceOf(InvalidAccessCodeError);
    });
  });

  // ---------------------------------------------------------------------------
  // downloadPdf
  // ---------------------------------------------------------------------------

  describe('downloadPdf', () => {
    it('calls res.send with pdf bytes and sets headers', async () => {
      const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // "%PDF"
      mockDownloadUseCase.execute.mockResolvedValue({
        pdfBytes,
        filename: 'documentos-consulta-2026-06-18.pdf',
      });

      const mockRes = {
        set: jest.fn(),
        send: jest.fn(),
      } as unknown as Response;

      await controller.downloadPdf('link-token', 'session-token', mockRes);

      expect(mockRes.set).toHaveBeenCalledWith(
        expect.objectContaining({ 'Content-Type': 'application/pdf' }),
      );
      expect(mockRes.send).toHaveBeenCalledWith(Buffer.from(pdfBytes));
    });

    it('passes empty string to use case when sessionToken query param is absent', async () => {
      mockDownloadUseCase.execute.mockRejectedValue(new InvalidSessionTokenError());

      const mockRes = { set: jest.fn(), send: jest.fn() } as unknown as Response;

      await expect(controller.downloadPdf('link-token', undefined, mockRes)).rejects.toBeInstanceOf(
        InvalidSessionTokenError,
      );
    });

    it('propagates DocumentLinkNotFoundError', async () => {
      mockDownloadUseCase.execute.mockRejectedValue(new DocumentLinkNotFoundError());

      const mockRes = { set: jest.fn(), send: jest.fn() } as unknown as Response;

      await expect(
        controller.downloadPdf('unknown', 'bad-session', mockRes),
      ).rejects.toBeInstanceOf(DocumentLinkNotFoundError);
    });
  });

  // ---------------------------------------------------------------------------
  // requestCodeEndpoint
  // ---------------------------------------------------------------------------

  describe('requestCodeEndpoint', () => {
    it('returns success with expiresAt', async () => {
      const expiresAt = new Date(Date.now() + 48 * 3600 * 1000);
      mockRequestCodeUseCase.execute.mockResolvedValue({ expiresAt });

      const result = await controller.requestCodeEndpoint('link-token');

      expect(result.success).toBe(true);
      expect(result.data.expiresAt).toBe(expiresAt.toISOString());
    });

    it('propagates DocumentLinkNotFoundError', async () => {
      mockRequestCodeUseCase.execute.mockRejectedValue(new DocumentLinkNotFoundError());

      await expect(controller.requestCodeEndpoint('bad-token')).rejects.toBeInstanceOf(
        DocumentLinkNotFoundError,
      );
    });

    it('propagates CodeRequestRateLimitedError (429)', async () => {
      mockRequestCodeUseCase.execute.mockRejectedValue(new CodeRequestRateLimitedError());

      await expect(controller.requestCodeEndpoint('link-token')).rejects.toBeInstanceOf(
        CodeRequestRateLimitedError,
      );
    });
  });
});
