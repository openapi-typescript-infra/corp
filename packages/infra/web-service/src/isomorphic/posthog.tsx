'use client';

import { useEffect } from 'react';
import posthog, { type PostHog } from 'posthog-js';
import { PostHogProvider } from 'posthog-js/react';

import { getEnvVar } from './env.ts';

let initialized = false;

// posthog-js uses a dual default/named export that confuses ESM type resolution
const posthogClient = posthog as unknown as PostHog;

function initPostHog() {
  if (initialized || typeof window === 'undefined') {
    return;
  }

  const key = getEnvVar('POSTHOG_KEY', '');
  if (!key) {
    return;
  }

  const host = getEnvVar('POSTHOG_HOST', 'https://us.i.posthog.com');
  posthogClient.init(key, {
    api_host: host,
    person_profiles: 'identified_only',
    capture_pageview: false, // Manually capture to support SPA route changes
    capture_pageleave: true,
  });
  initialized = true;
}

export function HSPostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initPostHog();
  }, []);

  return <PostHogProvider client={posthogClient}>{children}</PostHogProvider>;
}
