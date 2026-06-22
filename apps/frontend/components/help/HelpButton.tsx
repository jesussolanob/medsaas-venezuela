'use client';

// Launcher for the Help chat. Rendered inside each app topbar
// (doctor / admin / patient). Toggling only flips the shared store; the chat
// panel itself is mounted once in the root layout (see HelpWidget).

import { HelpCircle } from 'lucide-react';
import { toggleHelpChat } from './helpChatStore';

interface HelpButtonProps {
  className?: string;
}

export function HelpButton({ className }: HelpButtonProps) {
  return (
    <button
      type="button"
      onClick={() => toggleHelpChat()}
      aria-label="Abrir ayuda"
      title="Ayuda"
      className={
        className ??
        'inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition-colors hover:border-teal-300 hover:text-teal-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400'
      }
    >
      <HelpCircle className="h-5 w-5" />
    </button>
  );
}
