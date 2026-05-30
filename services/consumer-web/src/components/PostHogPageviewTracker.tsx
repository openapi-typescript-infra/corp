'use client';

import { track } from '@justtellme/state';
import { usePathname } from 'next/navigation.js';
import { useEffect } from 'react';

/** Captures pageview events on Next.js route changes. Render inside AppPostHogProvider. */
export function PostHogPageviewTracker() {
  const pathname = usePathname();

  useEffect(() => {
    track('page_viewed', { path: pathname, title: document.title });
  }, [pathname]);

  return null;
}
