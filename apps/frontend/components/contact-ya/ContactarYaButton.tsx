'use client';

import { useState } from 'react';
import { PhoneCall } from 'lucide-react';
import dynamic from 'next/dynamic';

// Lazy-load the heavy modal — it is only needed after the button is clicked.
const ContactarYaModal = dynamic(() => import('./ContactarYaModal'), { ssr: false });

interface ContactarYaButtonProps {
  className?: string;
}

/**
 * "Contáctame ya" button for the doctor topbar.
 * Visible to ALL doctors regardless of plan.
 *
 * Design: solid teal gradient (g-bg), white text, phone icon, subtle pulse ring
 * that respects prefers-reduced-motion. On narrow screens shows icon + short label.
 */
export function ContactarYaButton({ className }: ContactarYaButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Pulse wrapper — disabled when user prefers reduced motion via media query */}
      <span className="relative inline-flex">
        {/* Animated pulse ring */}
        <span
          className="absolute inset-0 rounded-lg g-bg opacity-40 motion-safe:animate-ping"
          aria-hidden="true"
          style={{ animationDuration: '2s' }}
        />
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Contáctame ya — hablar con el equipo de Delta"
          title="Contáctame ya"
          className={
            className ??
            'relative inline-flex items-center gap-1.5 h-9 px-3 g-bg text-white text-sm font-semibold rounded-lg transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:ring-offset-2 whitespace-nowrap'
          }
        >
          <PhoneCall className="w-4 h-4 shrink-0" />
          <span className="hidden sm:inline">Contáctame ya</span>
          <span className="sm:hidden">Contacto</span>
        </button>
      </span>

      {open && <ContactarYaModal onClose={() => setOpen(false)} />}
    </>
  );
}
