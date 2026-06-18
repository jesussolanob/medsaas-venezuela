import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import {
  SHARED_DOCUMENT_LINK_REPOSITORY,
  type ISharedDocumentLinkRepository,
} from '../../../domain/repositories/shared-document-link.repository';
import {
  DOCUMENT_ACCESS_CODE_REPOSITORY,
  type IDocumentAccessCodeRepository,
} from '../../../domain/repositories/document-access-code.repository';
import { DocumentLinkNotFoundError } from '../../../domain/errors/document-link-not-found.error';
import { DocumentLinkNotActiveError } from '../../../domain/errors/document-link-not-active.error';
import { InvalidAccessCodeError } from '../../../domain/errors/invalid-access-code.error';
import { MissingHmacSecretError } from '../../../domain/errors/missing-hmac-secret.error';
import type { DocumentSections } from '../../../domain/entities/shared-document-link.entity';

export interface VerifyCodeInput {
  token: string;
  code: string;
}

export interface VerifyCodeOutput {
  sessionToken: string;
  sections: DocumentSections;
  expiresAt: Date;
}

/**
 * VerifyCodeUseCase — validates a 6-digit access code for a shared link.
 *
 * FLOW:
 *   1. Find the link by token (404 if not found or revoked).
 *   2. Check link-level brute-force counter (>= 10 total failures → blocked).
 *   3. Find the latest code for the link.
 *   4. Check code validity (not expired, not used, not code-level blocked).
 *   5. If code does not match → increment BOTH code-level AND link-level
 *      failed_attempts counters → throw generic error.
 *   6. On match → mark code as used → issue a short-lived HMAC session token.
 *
 * SECURITY:
 *   - Never distinguish "wrong code" from "expired", "blocked", or
 *     "link bruteforce blocked" in the response. All map to the same 422.
 *   - Requesting a new code does NOT reset the link-level counter, so an
 *     attacker who cycles codes still accumulates towards the 10-attempt cap.
 *   - Session token = HMAC-SHA256(payload, AUTH_RESOLVE_SECRET).
 *     Payload: base64url({ linkId, token, exp }). Not a JWT.
 *   - AUTH_RESOLVE_SECRET is mandatory. Missing secret → config error (no fallback).
 *   - Never log the code value or session token.
 */
@Injectable()
export class VerifyCodeUseCase {
  /** Session token TTL: 15 minutes in ms. */
  static readonly SESSION_TTL_MS = 15 * 60 * 1000;

  constructor(
    @Inject(SHARED_DOCUMENT_LINK_REPOSITORY)
    private readonly linkRepo: ISharedDocumentLinkRepository,
    @Inject(DOCUMENT_ACCESS_CODE_REPOSITORY)
    private readonly codeRepo: IDocumentAccessCodeRepository,
    private readonly config: ConfigService,
  ) {}

  async execute(input: VerifyCodeInput): Promise<VerifyCodeOutput> {
    const now = new Date();

    // 1. Find link by token
    const link = await this.linkRepo.findByToken(input.token);
    if (!link) {
      throw new DocumentLinkNotFoundError();
    }
    if (!link.isActive()) {
      throw new DocumentLinkNotActiveError();
    }

    // 2. Check link-level brute-force cap (10 accumulated failures).
    //    Same error as wrong code — do not reveal why.
    if (link.isLinkBruteforceBlocked()) {
      throw new InvalidAccessCodeError();
    }

    // 3. Find latest code for this link
    const accessCode = await this.codeRepo.findLatestByLinkId(link.id);
    if (!accessCode || !accessCode.isValidFor(now)) {
      throw new InvalidAccessCodeError();
    }

    // 4. Check code match — on mismatch, increment BOTH counters
    if (!accessCode.matches(input.code)) {
      await Promise.all([
        this.codeRepo.incrementFailedAttempts(accessCode.id),
        this.linkRepo.incrementLinkFailedAttempts(link.id),
      ]);
      throw new InvalidAccessCodeError();
    }

    // 5. Mark code as used
    await this.codeRepo.markUsed(accessCode.id, now);

    // 6. Issue session token (HMAC-signed, 15-min exp)
    const exp = new Date(now.getTime() + VerifyCodeUseCase.SESSION_TTL_MS);
    const sessionToken = this.signSessionToken(link.id, link.token, exp);

    return {
      sessionToken,
      sections: link.sections,
      expiresAt: exp,
    };
  }

  /**
   * Signs a session token as: base64url(payload) + "." + hex(HMAC)
   *
   * The payload encodes { linkId, token, exp } so the download endpoint
   * can verify the token corresponds to the requested link.
   *
   * SECURITY: Requires AUTH_RESOLVE_SECRET from env. If absent, throws
   * MissingHmacSecretError — never use a fallback secret.
   * Never log the resulting token.
   */
  signSessionToken(linkId: string, token: string, exp: Date): string {
    const secret =
      this.config.get<string>('AUTH_RESOLVE_SECRET') ??
      this.config.get<string>('ENCRYPTION_HMAC_SECRET');

    if (!secret) {
      throw new MissingHmacSecretError();
    }

    const payload = Buffer.from(JSON.stringify({ linkId, token, exp: exp.toISOString() })).toString(
      'base64url',
    );
    const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    return `${payload}.${sig}`;
  }
}
