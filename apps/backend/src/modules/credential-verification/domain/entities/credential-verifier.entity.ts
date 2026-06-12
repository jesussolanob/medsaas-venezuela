/**
 * CredentialVerifier — domain entity describing an external verification portal.
 *
 * No external dependencies (DDD domain rule).
 */

export type VerifierMethod = 'xajax-post' | 'form-post' | 'api-json' | 'manual';
export type VerifierRequiredInput = 'cedula' | 'mpps' | 'nombre';
export type VerifierStatus = 'active' | 'flaky' | 'down' | 'manual_only';

export interface CredentialVerifierProps {
  id: string;
  credentialType: string;
  professionCode: string | null;
  jurisdiction: string | null;
  portalName: string | null;
  portalUrl: string | null;
  method: VerifierMethod;
  requestTemplate: Record<string, unknown> | null;
  requiredInput: VerifierRequiredInput | null;
  responseParser: string | null;
  hasCaptcha: boolean;
  tlsInsecure: boolean;
  status: VerifierStatus;
  lastCheckedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export class CredentialVerifier {
  readonly id: string;
  readonly credentialType: string;
  readonly professionCode: string | null;
  readonly jurisdiction: string | null;
  readonly portalName: string | null;
  readonly portalUrl: string | null;
  readonly method: VerifierMethod;
  readonly requestTemplate: Record<string, unknown> | null;
  readonly requiredInput: VerifierRequiredInput | null;
  readonly responseParser: string | null;
  readonly hasCaptcha: boolean;
  readonly tlsInsecure: boolean;
  readonly status: VerifierStatus;
  readonly lastCheckedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: CredentialVerifierProps) {
    this.id = props.id;
    this.credentialType = props.credentialType;
    this.professionCode = props.professionCode;
    this.jurisdiction = props.jurisdiction;
    this.portalName = props.portalName;
    this.portalUrl = props.portalUrl;
    this.method = props.method;
    this.requestTemplate = props.requestTemplate;
    this.requiredInput = props.requiredInput;
    this.responseParser = props.responseParser;
    this.hasCaptcha = props.hasCaptcha;
    this.tlsInsecure = props.tlsInsecure;
    this.status = props.status;
    this.lastCheckedAt = props.lastCheckedAt;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  static create(props: CredentialVerifierProps): CredentialVerifier {
    return new CredentialVerifier(props);
  }

  isActive(): boolean {
    return this.status === 'active';
  }

  isManualOnly(): boolean {
    return this.status === 'manual_only';
  }
}
