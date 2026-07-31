'use client';

/**
 * Compact utility bar pinned to the bottom of the doctor sidebar.
 *
 * Replaces three full-width rows (Términos y Condiciones, Política de
 * Privacidad, Cerrar sesión) with a single row of icon buttons, freeing ~110px
 * of vertical space in the sidebar — the menu was crowding out its own items on
 * short viewports.
 *
 * Each button exposes its text through a hover/focus tooltip. The tooltip is
 * decorative (aria-hidden); the accessible name comes from aria-label, so
 * screen readers and keyboard users never depend on hover.
 */

import type { LucideIcon } from 'lucide-react';
import { FileText, LogOut, Shield } from 'lucide-react';

/** Danger actions get the error palette on hover; neutral ones stay gray. */
type ActionTone = 'neutral' | 'danger';

interface UtilityAction {
  readonly key: string;
  readonly label: string;
  readonly icon: LucideIcon;
  readonly tone: ActionTone;
  readonly onClick: () => void;
}

interface HoverPalette {
  readonly color: string;
  readonly background: string;
}

const RESTING_COLOR = 'var(--dh-gray-400)';

const HOVER_PALETTE: Record<ActionTone, HoverPalette> = {
  neutral: { color: 'var(--dh-gray-600)', background: 'var(--dh-gray-50)' },
  danger: { color: 'var(--dh-error)', background: '#FEF2F2' },
};

export interface SidebarUtilityBarProps {
  onOpenTerms: () => void;
  onOpenPrivacy: () => void;
  onLogout: () => void;
}

export function SidebarUtilityBar({
  onOpenTerms,
  onOpenPrivacy,
  onLogout,
}: SidebarUtilityBarProps) {
  const actions: readonly UtilityAction[] = [
    {
      key: 'terms',
      label: 'Términos y Condiciones',
      icon: FileText,
      tone: 'neutral',
      onClick: onOpenTerms,
    },
    {
      key: 'privacy',
      label: 'Política de Privacidad',
      icon: Shield,
      tone: 'neutral',
      onClick: onOpenPrivacy,
    },
    {
      key: 'logout',
      label: 'Cerrar sesión',
      icon: LogOut,
      tone: 'danger',
      onClick: onLogout,
    },
  ];

  return (
    <div
      className="flex items-center gap-1 pt-2.5"
      style={{ borderTop: '1px solid var(--dh-gray-100)' }}
    >
      {actions.map((action) => {
        const hover = HOVER_PALETTE[action.tone];
        const paint = (element: HTMLElement, hovered: boolean) => {
          element.style.color = hovered ? hover.color : RESTING_COLOR;
          element.style.background = hovered ? hover.background : 'transparent';
        };

        return (
          <button
            key={action.key}
            type="button"
            onClick={action.onClick}
            aria-label={action.label}
            className="group relative flex flex-1 items-center justify-center h-9 transition-colors"
            style={{ borderRadius: 'var(--dh-r-sm)', color: RESTING_COLOR }}
            onMouseEnter={(e) => paint(e.currentTarget, true)}
            onMouseLeave={(e) => paint(e.currentTarget, false)}
            onFocus={(e) => paint(e.currentTarget, true)}
            onBlur={(e) => paint(e.currentTarget, false)}
          >
            <action.icon className="w-[17px] h-[17px] shrink-0" />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute bottom-[calc(100%+8px)] left-1/2 -translate-x-1/2 translate-y-1 whitespace-nowrap px-2.5 py-1.5 text-[11px] font-semibold opacity-0 transition-all duration-150 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100"
              style={{
                background: 'var(--dh-ink)',
                color: 'var(--dh-white)',
                borderRadius: 'var(--dh-r-sm)',
                boxShadow: 'var(--dh-shadow-md)',
              }}
            >
              {action.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
