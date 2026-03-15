import type { ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '../lib/utils.ts';

const loaderVariants = cva('fixed inset-0 z-50 flex flex-col items-center justify-center', {
  variants: {
    overlay: {
      true: 'bg-neutral-950/50 backdrop-blur-sm',
      false: 'bg-[#0B132B]',
    },
  },
  defaultVariants: {
    overlay: false,
  },
});

export interface FullPageLoaderProps extends VariantProps<typeof loaderVariants> {
  /** Optional message displayed below the branded loader */
  message?: ReactNode;
  /** Additional CSS classes for the container */
  className?: string;
}

/**
 * A full-viewport loading screen with the Just Tell Me branded animation.
 *
 * Displays animated sound bars, the wordmark, and a "LOADING" label.
 * The background matches the brand dark color (#0B132B).
 *
 * @example
 * ```tsx
 * // Basic usage
 * <FullPageLoader />
 *
 * // With an extra message below
 * <FullPageLoader message="Preparing your workspace..." />
 *
 * // As a translucent overlay on top of content
 * <FullPageLoader overlay />
 * ```
 */
export function FullPageLoader({ overlay = false, message, className }: FullPageLoaderProps) {
  return (
    <div className={cn(loaderVariants({ overlay }), className)} role="status" aria-label="Loading">
      <div className="flex flex-col items-center gap-4">
        <svg
          width="300"
          height="96"
          viewBox="0 0 300 96"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          role="img"
          aria-label="Just Tell Me loading animation"
          className="hs-loader">
          <title>Just Tell Me loading animation</title>
          <rect className="hs-loader-bg" x="0" y="0" width="300" height="96" rx="12" />

          {/* subtle resonance lines */}
          <path className="hs-loader-subtle" d="M24 48C24 35 34 24 48 24" />
          <path className="hs-loader-subtle" d="M24 48C24 61 34 72 48 72" />

          {/* animated bars */}
          <rect
            className="hs-loader-bar hs-loader-bar-1"
            x="42"
            y="32"
            width="8"
            height="32"
            rx="3"
          />
          <rect
            className="hs-loader-bar hs-loader-bar-2"
            x="56"
            y="24"
            width="8"
            height="40"
            rx="3"
          />
          <rect
            className="hs-loader-bar hs-loader-bar-3"
            x="70"
            y="16"
            width="8"
            height="48"
            rx="3"
          />
          <rect
            className="hs-loader-bar hs-loader-bar-4"
            x="84"
            y="24"
            width="8"
            height="40"
            rx="3"
          />
          <rect
            className="hs-loader-bar hs-loader-bar-5"
            x="98"
            y="32"
            width="8"
            height="32"
            rx="3"
          />

          <text className="hs-loader-wordmark" x="124" y="45">
            Just Tell Me
          </text>
          <text className="hs-loader-subtitle" x="124" y="64">
            LOADING
          </text>
        </svg>

        {message && <p className="text-sm font-medium text-[#F4E8C8]/72">{message}</p>}
      </div>
    </div>
  );
}
