'use client';

/**
 * RichTextBlockEditor — TipTap-based rich text editor for consultation blocks.
 *
 * Load from callers via next/dynamic with ssr:false to keep TipTap
 * out of the initial server-side bundle:
 *
 *   const RichTextBlockEditor = dynamic(
 *     () => import('./RichTextBlockEditor'),
 *     { ssr: false, loading: () => <div className="min-h-[5rem] bg-slate-50 animate-pulse rounded-xl" /> }
 *   );
 *
 * Backward compatibility: when `value` is plain text (no HTML tags), it is
 * automatically converted to paragraphs so existing consultation content is
 * never lost.
 *
 * Empty editor emits '' (not '<p></p>') so hasBlockContent() works correctly
 * in consultation-documents.ts.
 */

import { useEffect, useCallback, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import { isProbablyHtml } from '@delta/shared-utils';

export interface RichTextBlockEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Convert plain-text string to minimal HTML paragraphs for TipTap. */
function plainTextToHtml(text: string): string {
  if (!text.trim()) return '';
  return text
    .split('\n')
    .map((line) => `<p>${line.trim() ? line : '<br/>'}</p>`)
    .join('');
}

/** Normalise TipTap output: treat '<p></p>' as empty. */
function normaliseTipTapOutput(html: string): string {
  const trimmed = (html ?? '').trim();
  if (trimmed === '<p></p>' || trimmed === '') return '';
  return trimmed;
}

/** Convert `value` prop to an HTML string TipTap can consume. */
function valueToHtml(value: string): string {
  if (!value) return '';
  return isProbablyHtml(value) ? value : plainTextToHtml(value);
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function RichTextBlockEditor({
  value,
  onChange,
  placeholder = 'Escribe aquí…',
  disabled = false,
}: RichTextBlockEditorProps) {
  // Track whether the editor is focused (used for placeholder visibility)
  const [focused, setFocused] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Limit headings to clinical context (h3, h4 only)
        heading: { levels: [3, 4] },
        // Code blocks are not useful for clinical notes
        codeBlock: false,
      }),
      Underline,
    ],
    content: valueToHtml(value),
    editable: !disabled,
    onUpdate: ({ editor: ed }) => {
      onChange(normaliseTipTapOutput(ed.getHTML()));
    },
    editorProps: {
      attributes: {
        class: 'outline-none min-h-[5rem] px-4 py-3 text-sm text-slate-800 leading-relaxed',
      },
    },
  });

  // Sync external value changes (e.g. switching active tab)
  useEffect(() => {
    if (!editor || editor.isFocused) return;
    const currentHtml = normaliseTipTapOutput(editor.getHTML());
    const incomingHtml = valueToHtml(value).trim();
    // Avoid unnecessary setContent calls that would reset the cursor
    if (currentHtml !== incomingHtml) {
      editor.commands.setContent(incomingHtml || '', false);
    }
  }, [value, editor]);

  // Sync disabled prop
  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [disabled, editor]);

  // ─── Toolbar helpers ───────────────────────────────────────────────────────

  const handleBold = useCallback(() => editor?.chain().focus().toggleBold().run(), [editor]);
  const handleItalic = useCallback(() => editor?.chain().focus().toggleItalic().run(), [editor]);
  const handleUnderline = useCallback(
    () => editor?.chain().focus().toggleUnderline().run(),
    [editor],
  );
  const handleStrike = useCallback(() => editor?.chain().focus().toggleStrike().run(), [editor]);
  const handleBulletList = useCallback(
    () => editor?.chain().focus().toggleBulletList().run(),
    [editor],
  );
  const handleOrderedList = useCallback(
    () => editor?.chain().focus().toggleOrderedList().run(),
    [editor],
  );
  const handleBlockquote = useCallback(
    () => editor?.chain().focus().toggleBlockquote().run(),
    [editor],
  );
  const handleUndo = useCallback(() => editor?.chain().focus().undo().run(), [editor]);
  const handleRedo = useCallback(() => editor?.chain().focus().redo().run(), [editor]);

  if (!editor) {
    return (
      <div className="border border-slate-200 rounded-xl min-h-[5rem] bg-slate-50 animate-pulse" />
    );
  }

  const isEditorEmpty = normaliseTipTapOutput(editor.getHTML()) === '';

  // ─── Toolbar button style ──────────────────────────────────────────────────
  const tbBtn = (active: boolean, extraDisabled = false) =>
    [
      'w-8 h-8 rounded-lg flex items-center justify-center text-sm transition-colors',
      'focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400',
      active
        ? 'bg-teal-100 text-teal-700 border border-teal-200'
        : 'text-slate-600 hover:bg-slate-200 hover:text-slate-800',
      disabled || extraDisabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer',
    ].join(' ');

  return (
    <div
      className={`border rounded-xl overflow-hidden transition-colors ${
        focused ? 'border-teal-400 ring-2 ring-teal-500/10' : 'border-slate-200'
      }`}
    >
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-slate-200 bg-slate-50 flex-wrap">
        <button
          type="button"
          onClick={handleBold}
          disabled={disabled}
          aria-label="Negrita"
          className={tbBtn(editor.isActive('bold'))}
        >
          <strong>N</strong>
        </button>

        <button
          type="button"
          onClick={handleItalic}
          disabled={disabled}
          aria-label="Cursiva"
          className={tbBtn(editor.isActive('italic'))}
        >
          <em>C</em>
        </button>

        <button
          type="button"
          onClick={handleUnderline}
          disabled={disabled}
          aria-label="Subrayado"
          className={tbBtn(editor.isActive('underline'))}
        >
          <span className="underline">S</span>
        </button>

        <button
          type="button"
          onClick={handleStrike}
          disabled={disabled}
          aria-label="Tachado"
          className={tbBtn(editor.isActive('strike'))}
        >
          <span className="line-through">T</span>
        </button>

        <span className="w-px h-5 bg-slate-200 mx-1 shrink-0" aria-hidden="true" />

        <button
          type="button"
          onClick={handleBulletList}
          disabled={disabled}
          aria-label="Lista con viñetas"
          className={tbBtn(editor.isActive('bulletList'))}
        >
          {/* Bullet list icon */}
          <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4" aria-hidden="true">
            <circle cx="2" cy="4" r="1.5" />
            <rect x="5" y="3" width="9" height="2" rx="1" />
            <circle cx="2" cy="8" r="1.5" />
            <rect x="5" y="7" width="9" height="2" rx="1" />
            <circle cx="2" cy="12" r="1.5" />
            <rect x="5" y="11" width="9" height="2" rx="1" />
          </svg>
        </button>

        <button
          type="button"
          onClick={handleOrderedList}
          disabled={disabled}
          aria-label="Lista numerada"
          className={tbBtn(editor.isActive('orderedList'))}
        >
          {/* Ordered list icon */}
          <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4" aria-hidden="true">
            <text x="0" y="5" fontSize="5" fontFamily="sans-serif">
              1.
            </text>
            <rect x="5" y="3" width="9" height="2" rx="1" />
            <text x="0" y="9" fontSize="5" fontFamily="sans-serif">
              2.
            </text>
            <rect x="5" y="7" width="9" height="2" rx="1" />
            <text x="0" y="13" fontSize="5" fontFamily="sans-serif">
              3.
            </text>
            <rect x="5" y="11" width="9" height="2" rx="1" />
          </svg>
        </button>

        <button
          type="button"
          onClick={handleBlockquote}
          disabled={disabled}
          aria-label="Cita"
          className={tbBtn(editor.isActive('blockquote'))}
        >
          <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4" aria-hidden="true">
            <path d="M3 2C1.9 2 1 2.9 1 4v3c0 1.1.9 2 2 2h.5L2 12h2l1.5-3H6V4c0-1.1-.9-2-2-2H3zm7 0c-1.1 0-2 .9-2 2v3c0 1.1.9 2 2 2h.5L9 12h2l1.5-3H13V4c0-1.1-.9-2-2-2h-1z" />
          </svg>
        </button>

        <span className="w-px h-5 bg-slate-200 mx-1 shrink-0" aria-hidden="true" />

        <button
          type="button"
          onClick={handleUndo}
          disabled={disabled || !editor.can().undo()}
          aria-label="Deshacer"
          className={tbBtn(false, !editor.can().undo())}
        >
          <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4" aria-hidden="true">
            <path d="M5.5 3L2 6.5 5.5 10V7.5c3.3 0 5.6 1.2 7 3.8C12.2 7.5 9.8 4 5.5 4V3z" />
          </svg>
        </button>

        <button
          type="button"
          onClick={handleRedo}
          disabled={disabled || !editor.can().redo()}
          aria-label="Rehacer"
          className={tbBtn(false, !editor.can().redo())}
        >
          <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4" aria-hidden="true">
            <path d="M10.5 3v1c-4.3 0-6.7 3.5-7 7 1.4-2.6 3.7-3.8 7-3.8V9.5L14 6l-3.5-3z" />
          </svg>
        </button>
      </div>

      {/* Editor content area (relative for placeholder positioning) */}
      <div className="relative">
        {/* Placeholder — shown when editor is empty and not focused */}
        {isEditorEmpty && !focused && (
          <span
            className="absolute top-3 left-4 text-sm text-slate-400 pointer-events-none select-none"
            aria-hidden="true"
          >
            {placeholder}
          </span>
        )}
        <div onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}>
          <EditorContent editor={editor} />
        </div>
      </div>

      {/* TipTap prose styles scoped to this editor */}
      <style>{`
        .ProseMirror ul { list-style-type: disc; padding-left: 1.5rem; margin: 0.25rem 0; }
        .ProseMirror ol { list-style-type: decimal; padding-left: 1.5rem; margin: 0.25rem 0; }
        .ProseMirror li { margin: 0.1rem 0; }
        .ProseMirror blockquote {
          border-left: 3px solid #cbd5e1;
          margin: 0.5rem 0;
          padding: 0.25rem 0.75rem;
          color: #64748b;
        }
        .ProseMirror h3 { font-size: 1rem; font-weight: 700; margin: 0.5rem 0 0.25rem; }
        .ProseMirror h4 { font-size: 0.9rem; font-weight: 600; margin: 0.5rem 0 0.25rem; }
        .ProseMirror p { margin: 0.15rem 0; }
        .ProseMirror code {
          background: #f1f5f9;
          border-radius: 3px;
          padding: 0.1em 0.3em;
          font-size: 0.85em;
        }
      `}</style>
    </div>
  );
}
