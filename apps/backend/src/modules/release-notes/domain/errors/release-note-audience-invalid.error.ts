import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when audiencePlans contains plan keys that don't exist in plan_configs.
 * HTTP 422.
 */
export class ReleaseNoteAudienceInvalidError extends DomainError {
  readonly code = 'RELEASE_NOTE_AUDIENCE_INVALID';

  constructor(unknownKeys: string[]) {
    super(
      `Los siguientes planes no existen: ${unknownKeys.join(', ')}. Verifica las claves en Admin → Planes.`,
    );
  }
}
