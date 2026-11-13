/**
 * Meta (Facebook) Pixel — marketing funnel only.
 *
 * Delta handles health data, so the pixel is deliberately narrow:
 *  - It only loads on PUBLIC marketing pages (see PUBLIC_PIXEL_PATHS) and fires a
 *    single CompleteRegistration event when a specialist finishes onboarding.
 *  - Automatic configuration is off (no automatic button-click / page-metadata
 *    events) and SPA history tracking is disabled, so navigating from a public
 *    page into /doctor never reports those URLs to Meta.
 *  - Events are sent only from the production host. On staging, append
 *    `?meta_pixel=1` to the URL to enable it for that browser tab session.
 *
 * The landing page (public/landing.html) is a static file with its own copy of
 * this logic; keep both in sync.
 */

export const META_PIXEL_ID = '1135740505535622';

const PRODUCTION_HOSTS = new Set(['deltasalud.app', 'www.deltasalud.app']);
const DEBUG_FLAG_KEY = 'meta_pixel_debug';

/** Public pages where a PageView is reported. "/" is excluded: the landing iframe tracks itself. */
const PUBLIC_PIXEL_PATHS = ['/login', '/register', '/terms', '/privacy'];
const PUBLIC_PIXEL_PREFIXES = ['/r/'];

type Fbq = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue: unknown[];
  push: Fbq;
  loaded: boolean;
  version: string;
  disablePushState?: boolean;
};

declare global {
  interface Window {
    fbq?: Fbq;
    _fbq?: Fbq;
  }
}

export function isPublicPixelPath(pathname: string): boolean {
  return (
    PUBLIC_PIXEL_PATHS.includes(pathname) ||
    PUBLIC_PIXEL_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  );
}

function readDebugFlag(): boolean {
  try {
    if (new URLSearchParams(window.location.search).get('meta_pixel') === '1') {
      window.sessionStorage.setItem(DEBUG_FLAG_KEY, '1');
    }
    return window.sessionStorage.getItem(DEBUG_FLAG_KEY) === '1';
  } catch {
    // Storage can be blocked (private mode); the flag simply stays off.
    return false;
  }
}

export function isPixelEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  return PRODUCTION_HOSTS.has(window.location.hostname) || readDebugFlag();
}

/** Injects the Meta snippet once. Calls made before the script loads are queued. */
function ensurePixelLoaded(): Fbq | null {
  if (!isPixelEnabled()) return null;
  if (window.fbq) return window.fbq;

  const fbq = function (...args: unknown[]) {
    if (fbq.callMethod) fbq.callMethod(...args);
    else fbq.queue.push(args);
  } as Fbq;
  fbq.push = fbq;
  fbq.loaded = true;
  fbq.version = '2.0';
  fbq.queue = [];
  // Without this the pixel reports every client-side route change, including /doctor.
  fbq.disablePushState = true;
  window.fbq = fbq;
  window._fbq = fbq;

  const script = document.createElement('script');
  script.async = true;
  script.src = 'https://connect.facebook.net/en_US/fbevents.js';
  document.head.appendChild(script);

  fbq('set', 'autoConfig', false, META_PIXEL_ID);
  fbq('init', META_PIXEL_ID);
  return fbq;
}

export function trackPixelPageView(): void {
  ensurePixelLoaded()?.('track', 'PageView');
}

export function trackPixelEvent(event: 'CompleteRegistration' | 'Lead' | 'Contact'): void {
  ensurePixelLoaded()?.('track', event);
}
