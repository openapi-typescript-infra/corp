import { observable } from '@legendapp/state';

/** Minimal Stytch user shape accepted by setStytch — no @stytch import needed. */
export interface StytchUserInput {
  user_id: string;
  emails: { email: string }[];
  name: { first_name: string; last_name: string };
}

/** Minimal Stytch session shape accepted by setStytch. */
export interface StytchSessionInput {
  session_id: string;
}

export interface AuthUser {
  userId: string;
  emails: string[];
  name?: string;
}

export interface AuthState {
  initialized: boolean;
  user: AuthUser | null;
  hasSession: boolean;
}

export interface AppState {
  loaded: boolean;
  auth: AuthState;
  error?: Error;
}

export const app$ = observable<AppState>({
  loaded: false,
  auth: {
    initialized: false,
    user: null,
    hasSession: false,
  },
});

/**
 * Sync Stytch SDK state into app$. Call this from a platform-specific
 * bridge component whenever Stytch's user/session values change.
 */
export function setStytch(user: StytchUserInput | null, session: StytchSessionInput | null) {
  app$.auth.initialized.set(true);
  app$.auth.hasSession.set(!!session);
  app$.auth.user.set(
    user
      ? {
          userId: user.user_id,
          emails: user.emails.map((e) => e.email),
          name: [user.name.first_name, user.name.last_name].filter(Boolean).join(' ') || undefined,
        }
      : null,
  );
}
