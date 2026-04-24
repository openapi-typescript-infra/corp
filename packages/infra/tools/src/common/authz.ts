import type { ToolUseSession } from '#src/types.js';

export type AuthzFn = (session: ToolUseSession) => boolean;

/** Create an authz guard that checks the session role matches the given role name. */
export function role(roleName: string): AuthzFn {
  return (session) => session.role === roleName;
}

/** Combine authz guards with OR logic — passes if any guard passes. */
export function or(...fns: AuthzFn[]): AuthzFn {
  return (session) => fns.some((fn) => fn(session));
}

/** Combine authz guards with AND logic — passes if all guards pass. */
export function and(...fns: AuthzFn[]): AuthzFn {
  return (session) => fns.every((fn) => fn(session));
}
