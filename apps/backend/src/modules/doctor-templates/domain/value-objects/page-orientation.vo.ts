/**
 * PageOrientation value object.
 *
 * Controls how the PDF page is printed.
 *
 *   portrait  — standard vertical A4/letter (default)
 *   landscape — horizontal letter sheet split in half
 *               (left = medications, right = indications; recipe only)
 *
 * No external imports — pure domain logic.
 */

export const PAGE_ORIENTATIONS = ['portrait', 'landscape'] as const;

export type PageOrientationValue = (typeof PAGE_ORIENTATIONS)[number];

export const DEFAULT_PAGE_ORIENTATION: PageOrientationValue = 'portrait';
