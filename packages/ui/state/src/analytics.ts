/**
 * Centralized, typed analytics layer.
 *
 * Platform-specific code (web posthog-js, mobile posthog-react-native) injects
 * its client via `setAnalyticsClient`. All event tracking goes through `track()`
 * which enforces the typed event map at compile time.
 */

// ---------------------------------------------------------------------------
// Event map — add new events here
// ---------------------------------------------------------------------------

/** Map of event name → required properties. Use `Record<string, never>` for events with no extra props. */
export interface AnalyticsEventMap {
  // Auth
  sign_up_started: Record<string, never>;
  sign_up_completed: { method: string };
  login_started: Record<string, never>;
  login_completed: { method: string };
  logout: Record<string, never>;

  // Navigation
  page_viewed: { path: string; title?: string };
  screen_viewed: { screen: string };

  // Errors
  error_displayed: { message: string; code?: string };
}

// ---------------------------------------------------------------------------
// User-level context
// ---------------------------------------------------------------------------

export interface AnalyticsUserProperties {
  email?: string;
  name?: string;
  [key: string]: string | number | boolean | undefined;
}

// ---------------------------------------------------------------------------
// Client abstraction
// ---------------------------------------------------------------------------

/** Minimal interface that both posthog-js and posthog-react-native satisfy. */
export interface AnalyticsClient {
  capture(event: string, properties?: Record<string, unknown>): void;
  identify(distinctId: string, properties?: Record<string, unknown>): void;
  reset(): void;
}

let client: AnalyticsClient | null = null;

/** Inject the platform-specific analytics client (call once at app startup). */
export function setAnalyticsClient(c: AnalyticsClient) {
  client = c;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Track a typed analytics event.
 *
 * ```ts
 * track('login_completed', { method: 'google' });
 * track('logout'); // no extra props required
 * ```
 */
export function track<E extends keyof AnalyticsEventMap>(
  ...args: Record<string, never> extends AnalyticsEventMap[E]
    ? [event: E]
    : [event: E, properties: AnalyticsEventMap[E]]
) {
  const [event, properties] = args;
  client?.capture(event, properties as Record<string, unknown> | undefined);
}

/** Identify the current user. Call after login / auth state change. */
export function identifyUser(userId: string, properties?: AnalyticsUserProperties) {
  client?.identify(userId, properties as Record<string, unknown> | undefined);
}

/** Reset identity (call on logout). */
export function resetAnalytics() {
  client?.reset();
}
