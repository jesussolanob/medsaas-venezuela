import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  QUOTE_REPOSITORY,
  type IQuoteRepository,
} from '../../domain/repositories/iquote.repository';
import type { Quote } from '../../domain/entities/quote.entity';
import { QuoteLinkExpiredError } from '../../domain/errors/quote-link-expired.error';
import {
  DOCTOR_PROFILE_REPOSITORY,
  type IDoctorProfileRepository,
} from '../../../doctor-settings/domain/repositories/doctor-profile.repository';
import {
  DOCTOR_TEMPLATE_REPOSITORY,
  type IDoctorTemplateRepository,
} from '../../../doctor-templates/domain/repositories/doctor-template.repository';
import { STORAGE_PORT, type IStoragePort } from '../../../storage/application/ports/storage.port';
import { resignGcsImageUrl } from '../../../storage/application/helpers/resign-gcs-image.helper';

/** Doctor branding block returned to the public render page. */
export interface PublicDoctorProfile {
  fullName: string;
  professionalTitle: string | null;
  specialty: string | null;
  licenseNumber: string | null;
  /** Freshly re-signed URL for the doctor logo (null if not configured). */
  logoUrl: string | null;
  /** Freshly re-signed URL for the doctor signature (null if not configured). */
  signatureUrl: string | null;
}

/** PDF template configuration resolved for the public page. */
export interface PublicTemplateConfig {
  headerText: string;
  footerText: string;
  primaryColor: string;
  fontFamily: string;
  showLogo: boolean;
  showSignature: boolean;
  /** Freshly re-signed logo URL from the template (null if not configured). */
  logoUrl: string | null;
  /** Freshly re-signed signature URL from the template (null if not configured). */
  signatureUrl: string | null;
}

/** Full payload returned by GetPublicQuoteUseCase. */
export interface PublicQuoteRenderData {
  quote: Quote;
  doctor: PublicDoctorProfile;
  /**
   * 'informe' template configuration when the doctor has one configured.
   * Quote PDFs share the letterhead template (logo, signature, colors, fonts).
   * Null when the doctor has not yet configured any template.
   * The frontend should render with defaults when this is null.
   */
  templateConfig: PublicTemplateConfig | null;
}

/**
 * GetPublicQuoteUseCase — returns a quote + doctor branding for the
 * unauthenticated public view.
 *
 * Contract:
 *   - Resolves the quote via a share-link token (NO doctor auth).
 *   - An expired or revoked token produces QuoteLinkExpiredError (404).
 *   - A valid token for a non-existent quote produces QuoteNotFoundError (404).
 *   - Returns quote data, doctor branding, and template config in one response
 *     so the frontend can render the PDF without an extra authenticated call.
 *   - GCS paths in logoUrl / signatureUrl are re-signed to fresh 1-hour URLs.
 *
 * SECURITY:
 *   - No auth guard — token is the sole credential (48-byte CSPRNG = 384 bits).
 *   - DoctorId is always taken from the share link, never from the request.
 *   - Response excludes all patient PII (cedula, phone, diagnosis, email).
 *   - Doctor contact details (phone, email) are also excluded.
 */
@Injectable()
export class GetPublicQuoteUseCase {
  private readonly logger = new Logger(GetPublicQuoteUseCase.name);

  constructor(
    @Inject(QUOTE_REPOSITORY)
    private readonly quoteRepo: IQuoteRepository,
    @Inject(DOCTOR_PROFILE_REPOSITORY)
    private readonly doctorProfileRepo: IDoctorProfileRepository,
    @Inject(DOCTOR_TEMPLATE_REPOSITORY)
    private readonly doctorTemplateRepo: IDoctorTemplateRepository,
    @Inject(STORAGE_PORT)
    private readonly storage: IStoragePort,
  ) {}

  async execute(token: string): Promise<PublicQuoteRenderData> {
    // Single-pass: findQuoteByValidToken checks link existence + expiry + revocation
    // before returning the quote, so there is no race between two separate checks.
    // A missing/expired/revoked token returns QuoteLinkExpiredError (anti-enumeration).
    const quote = await this.quoteRepo.findQuoteByValidToken(token);
    if (!quote) {
      // Token missing, expired, or revoked — always the same 404 (anti-enumeration).
      throw new QuoteLinkExpiredError();
    }

    // 3. Fetch doctor profile and template in parallel (doctorId from the link)
    //    Quote PDFs share the 'informe' template (letterhead, colors, logo, signature).
    //    A dedicated 'cotizacion' type does not exist in the template system.
    const [doctorProfile, template] = await Promise.all([
      this.doctorProfileRepo.findByDoctorId(quote.doctorId),
      this.doctorTemplateRepo.findByDoctorAndType(quote.doctorId, 'informe'),
    ]);

    // 4. Re-sign GCS image URLs so they don't arrive expired
    const [profileLogoUrl, profileSignatureUrl, templateLogoUrl, templateSignatureUrl] =
      await Promise.all([
        this.resolveSignedUrl(doctorProfile?.logoUrl ?? null, 'profile.logoUrl'),
        this.resolveSignedUrl(doctorProfile?.signatureUrl ?? null, 'profile.signatureUrl'),
        this.resolveSignedUrl(template?.logoUrl ?? null, 'template.logoUrl'),
        this.resolveSignedUrl(template?.signatureUrl ?? null, 'template.signatureUrl'),
      ]);

    // 5. Build response
    const doctor: PublicDoctorProfile = {
      fullName: doctorProfile?.fullName ?? 'Dr./Dra.',
      professionalTitle: doctorProfile?.professionalTitle ?? null,
      specialty: doctorProfile?.specialty ?? null,
      licenseNumber: doctorProfile?.licenseNumber ?? null,
      logoUrl: profileLogoUrl,
      signatureUrl: profileSignatureUrl,
    };

    const templateConfig: PublicTemplateConfig | null = template
      ? {
          headerText: template.headerText,
          footerText: template.footerText,
          primaryColor: template.primaryColor,
          fontFamily: template.fontFamily,
          showLogo: template.showLogo,
          showSignature: template.showSignature,
          logoUrl: templateLogoUrl,
          signatureUrl: templateSignatureUrl,
        }
      : null;

    return { quote, doctor, templateConfig };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Re-signs a GCS logo/signature path to a fresh URL.
   * Returns null when absent/empty. Logs and returns null on error — a missing
   * image must not break the whole render.
   */
  private async resolveSignedUrl(path: string | null, field: string): Promise<string | null> {
    if (!path || path.trim() === '') return null;
    try {
      if (path.startsWith('http://') || path.startsWith('https://')) {
        return await resignGcsImageUrl(path, this.storage);
      }
      return await this.storage.getSignedUrl(path);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`[public-quote] failed to sign URL for ${field}: ${message}`);
      return null;
    }
  }
}
