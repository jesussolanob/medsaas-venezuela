'use client';

/**
 * RichTextView — read-only, sanitized renderer for rich-text block content.
 *
 * Handles both HTML (from RichTextBlockEditor) and plain-text (legacy
 * consultations). HTML is sanitized client-side via DOMPurify using a strict
 * allowlist before it is inserted via dangerouslySetInnerHTML.
 *
 * Allowlist: p, br, strong, b, em, i, u, s, del, ul, ol, li, h3, h4,
 *            blockquote, code — zero attributes.
 */

import { useMemo } from 'react';
import DOMPurify from 'dompurify';
import { isProbablyHtml } from '@delta/shared-utils';

const ALLOWED_TAGS = [
  'p',
  'br',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'del',
  'ul',
  'ol',
  'li',
  'h3',
  'h4',
  'blockquote',
  'code',
];

interface Props {
  value: string;
  className?: string;
  emptyLabel?: string;
}

export default function RichTextView({
  value,
  className = '',
  emptyLabel = 'Sin información',
}: Props) {
  const sanitized = useMemo(() => {
    if (!value?.trim()) return '';

    // SSR safety: DOMPurify requires the DOM
    if (typeof window === 'undefined') return '';

    if (isProbablyHtml(value)) {
      return DOMPurify.sanitize(value, {
        ALLOWED_TAGS,
        ALLOWED_ATTR: [], // zero attributes — prevents XSS via event handlers, styles, etc.
      });
    }

    // Plain text: escape HTML special chars and convert newlines to <br>
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br/>');
  }, [value]);

  if (!value?.trim()) {
    return <p className="text-sm text-slate-400 italic">{emptyLabel}</p>;
  }

  return (
    <div
      className={[
        'text-sm text-slate-700 leading-relaxed',
        // Minimal prose styles so bullet lists, blockquotes etc. render correctly
        '[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-0.5',
        '[&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:space-y-0.5',
        '[&_blockquote]:border-l-2 [&_blockquote]:border-slate-300 [&_blockquote]:pl-3 [&_blockquote]:text-slate-500 [&_blockquote]:italic',
        '[&_code]:bg-slate-100 [&_code]:rounded [&_code]:px-1 [&_code]:text-xs',
        '[&_h3]:font-bold [&_h3]:text-slate-900',
        '[&_h4]:font-semibold [&_h4]:text-slate-800',
        className,
      ].join(' ')}
      // dangerouslySetInnerHTML is intentional: content is sanitized via DOMPurify above
      dangerouslySetInnerHTML={{ __html: sanitized }}
    />
  );
}
