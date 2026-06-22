// Global open/close store for the Help chat widget.
//
// The launcher button lives in each app topbar (doctor/admin/patient), while the
// chat panel is mounted once in the ROOT layout so it survives client-side
// navigation. This tiny pub/sub (same pattern as Toaster) bridges them without a
// heavyweight state library or prop drilling across layouts.

type Listener = (open: boolean) => void;

let isOpen = false;
const listeners = new Set<Listener>();

function emit(): void {
  listeners.forEach((fn) => fn(isOpen));
}

export function openHelpChat(): void {
  if (isOpen) return;
  isOpen = true;
  emit();
}

export function closeHelpChat(): void {
  if (!isOpen) return;
  isOpen = false;
  emit();
}

export function toggleHelpChat(): void {
  isOpen = !isOpen;
  emit();
}

/** Subscribe to open-state changes. Immediately invokes with the current value. */
export function subscribeHelpChat(fn: Listener): () => void {
  listeners.add(fn);
  fn(isOpen);
  return () => {
    listeners.delete(fn);
  };
}
