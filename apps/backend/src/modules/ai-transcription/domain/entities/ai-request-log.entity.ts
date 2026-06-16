/**
 * AiRequestLog — domain entity.
 *
 * Records a single AI request for auditing/rate-limit purposes.
 * NEVER stores audio, transcript, or any PHI.
 */
export class AiRequestLog {
  constructor(
    public readonly id: string,
    public readonly doctorId: string,
    /** Feature key: e.g. 'transcription' */
    public readonly feature: string,
    /** 'success' | 'error' | 'denied' */
    public readonly status: string,
    /** Size of the uploaded audio buffer in bytes. */
    public readonly audioBytes: number,
    /** Gemini model used, e.g. 'gemini-2.5-flash'. */
    public readonly model: string,
    public readonly createdAt: Date,
  ) {}

  static create(params: {
    id: string;
    doctorId: string;
    feature: string;
    status: string;
    audioBytes: number;
    model: string;
  }): AiRequestLog {
    return new AiRequestLog(
      params.id,
      params.doctorId,
      params.feature,
      params.status,
      params.audioBytes,
      params.model,
      new Date(),
    );
  }
}
