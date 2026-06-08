/**
 * Identity domain entity.
 *
 * Represents a resolved user identity: a profile record that has been matched
 * or created during the Auth0 login flow. Pure domain logic — no external deps.
 */
export interface IdentityCreateParams {
  id: string;
  email: string;
  fullName: string;
  role: string;
  auth0Sub: string | null;
  createdAt: Date;
}

export class Identity {
  readonly id: string;
  readonly email: string;
  readonly fullName: string;
  readonly role: string;
  readonly auth0Sub: string | null;
  readonly createdAt: Date;

  constructor(params: IdentityCreateParams) {
    this.id = params.id;
    this.email = params.email;
    this.fullName = params.fullName;
    this.role = params.role;
    this.auth0Sub = params.auth0Sub;
    this.createdAt = params.createdAt;
  }

  /**
   * Returns true if this identity was created (not pre-existing) based on
   * the provided creation timestamp versus a threshold.
   * Used by the use case to communicate the created/existing outcome.
   */
  isSuperAdmin(): boolean {
    return this.role === 'super_admin';
  }

  /**
   * Returns the role that should be exposed to the BFF.
   * Normalises 'admin' alias to 'super_admin' for internal consistency.
   */
  get effectiveRole(): string {
    return this.role;
  }

  static create(params: IdentityCreateParams): Identity {
    return new Identity(params);
  }
}
