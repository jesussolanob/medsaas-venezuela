'use client';

/**
 * /doctor/release-notes
 *
 * History of all published release notes for the doctor's plan.
 * Ordered newest first (up to 50).
 * Accessible from Ayuda → Novedades.
 */

import { useEffect, useState } from 'react';
import { ArrowLeft, Loader2, Megaphone, ImageOff } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import type { ReleaseNoteItem } from '@delta/shared-types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCaracasDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('es-VE', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'America/Caracas',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/**
 * Renders plain text body:
 * - Lines starting with "- " → <ul><li> items.
 * - Other lines use white-space: pre-line.
 * Never dangerouslySetInnerHTML.
 */
function NoteBody({ body }: { body: string }) {
  const lines = body.split('\n');
  const nodes: React.ReactNode[] = [];
  let listItems: string[] = [];

  function flushList() {
    if (!listItems.length) return;
    nodes.push(
      <ul key={`ul-${nodes.length}`} className="list-disc list-inside space-y-1 my-2">
        {listItems.map((item, i) => (
          <li key={i} className="text-slate-700">
            {item}
          </li>
        ))}
      </ul>,
    );
    listItems = [];
  }

  lines.forEach((line, i) => {
    if (line.startsWith('- ')) {
      listItems.push(line.slice(2));
    } else {
      flushList();
      nodes.push(
        <span key={i} style={{ whiteSpace: 'pre-line' }}>
          {line}
          {i < lines.length - 1 ? '\n' : ''}
        </span>,
      );
    }
  });
  flushList();

  return <div className="text-sm text-slate-700 leading-relaxed">{nodes}</div>;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DoctorReleaseNotesPage() {
  const [notes, setNotes] = useState<ReleaseNoteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch('/api/doctor/release-notes', { cache: 'no-store' });
        if (cancelled) return;
        if (!res.ok) {
          setLoadError('No se pudieron cargar las novedades.');
          setLoading(false);
          return;
        }
        const json = (await res.json()) as { data?: ReleaseNoteItem[] };
        if (!cancelled) {
          setNotes(json.data ?? []);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setLoadError('Error de red al cargar las novedades.');
          setLoading(false);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <Link
            href="/doctor"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-white border border-transparent hover:border-slate-200 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Novedades de Delta Salud</h1>
            <p className="text-sm text-slate-500">Todas las actualizaciones de la plataforma</p>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-500 text-sm gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Cargando novedades...
          </div>
        ) : loadError ? (
          <div className="flex items-center justify-center py-20 text-red-500 text-sm text-center">
            {loadError}
          </div>
        ) : notes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
            <Megaphone className="w-10 h-10 opacity-30" />
            <p className="text-sm">Aún no hay novedades publicadas.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {notes.map((note) => (
              <article
                key={note.id}
                className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow"
              >
                {/* Image */}
                {note.imageUrl && (
                  <div className="relative w-full aspect-video bg-slate-100">
                    <Image
                      src={note.imageUrl}
                      alt={note.title}
                      fill
                      className="object-cover"
                      sizes="(max-width: 768px) 100vw, 672px"
                    />
                  </div>
                )}

                <div className="p-5 sm:p-6 space-y-3">
                  {/* Date */}
                  <time className="text-xs text-teal-600 font-semibold uppercase tracking-wider">
                    {formatCaracasDate(note.publishedAt)}
                  </time>

                  {/* Title */}
                  <h2 className="text-lg font-bold text-slate-800 leading-snug">{note.title}</h2>

                  {/* Body */}
                  <NoteBody body={note.body} />
                </div>
              </article>
            ))}
          </div>
        )}

        {/* Show empty image icon for notes without images */}
        {!loading && !loadError && notes.length > 0 && notes.every((n) => !n.imageUrl) && (
          <p className="text-center text-xs text-slate-400 mt-8 flex items-center justify-center gap-1">
            <ImageOff className="w-3.5 h-3.5" /> Las novedades no incluyen imágenes aún.
          </p>
        )}
      </div>
    </div>
  );
}
