'use client';

import { track } from '@justtellme/state';
import { usePathname, useSearchParams } from 'next/navigation.js';
import { useEffect } from 'react';

/** Captures pageview events on Next.js route changes. Render inside HSPostHogProvider. */
export function PostHogPageviewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    track('page_viewed', { path: pathname, title: document.title });
  }, [pathname, searchParams]);

  return null;
}
