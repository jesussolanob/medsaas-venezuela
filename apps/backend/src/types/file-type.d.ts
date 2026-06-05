/**
 * Ambient module declaration for `file-type` (ESM-only package).
 *
 * `file-type` v22+ is pure ESM and only exposes its types via the
 * `exports.types` field, which is not supported by `moduleResolution: "node"`.
 * This declaration re-exports the subset of the API used in this project so
 * TypeScript can type-check `await import('file-type')` calls.
 */
declare module 'file-type' {
  export type FileTypeResult = {
    readonly ext: string;
    readonly mime: string;
  };

  export function fileTypeFromBuffer(
    buffer: Uint8Array | ArrayBuffer,
  ): Promise<FileTypeResult | undefined>;
}
