'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { isPublicPixelPath, trackPixelEvent, trackPixelPageView } from '@/lib/meta-pixel';

/** Reports a PageView to Meta on public marketing pages only (see lib/meta-pixel). */
export function MetaPixelPageViews() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname && isPublicPixelPath(pathname)) trackPixelPageView();
  }, [pathname]);

  return null;
}

/** Fires one Meta event when mounted (e.g. the onboarding "account ready" screen). */
export function MetaPixelEvent({ event }: { event: 'CompleteRegistration' }) {
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    trackPixelEvent(event);
  }, [event]);

  return null;
}
