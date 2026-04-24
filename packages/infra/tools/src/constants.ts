/**
 * Sentinel symbol used to mark a tool result as requiring a return to the client.
 * The value stored at this key indicates the intended turn status:
 * - `'complete'` — the turn is done (default)
 * - `'input-required'` — the client must provide further input
 */
export const RETURN_TO_CLIENT = Symbol.for('returnToClient');

export type ReturnToClientSentinel = typeof RETURN_TO_CLIENT;

export type ReturnToClientStatus = 'complete' | 'input-required' | 'deferred';

/** The shape returned by {@link returnToClient}. Exported so consumers don't need to import the symbol. */
export type ReturnToClientResult<T extends Record<string, unknown> = Record<string, unknown>> =
  T & { [RETURN_TO_CLIENT]: ReturnToClientStatus };

export interface ReturnToClientOptions {
  /** When true, the turn status will be `input-required` instead of `complete`. */
  inputRequired?: boolean;
  /** When true, the turn status will be `deferred` — an async job is in progress. */
  deferred?: boolean;
}

/**
 * Wraps a tool execute result to signal that the tool loop should stop
 * and return control to the client after this step completes.
 *
 * By default the turn is treated as complete. Pass `{ inputRequired: true }`
 * when the client still needs to respond.
 *
 * @example
 * ```ts
 * // Turn completes after execution
 * return returnToClient({ status: 'ok', data: result });
 *
 * // Turn stops but client must provide further input
 * return returnToClient({ question: 'Pick one' }, { inputRequired: true });
 * ```
 */
export function returnToClient<T extends Record<string, unknown>>(
  result: T,
  options?: ReturnToClientOptions,
): ReturnToClientResult<T> {
  const status: ReturnToClientStatus = options?.deferred
    ? 'deferred'
    : options?.inputRequired
      ? 'input-required'
      : 'complete';
  return Object.assign(result, { [RETURN_TO_CLIENT]: status });
}

/**
 * Checks whether a tool result was marked with {@link returnToClient}.
 */
export function isReturnToClient(
  result: unknown,
): result is { [RETURN_TO_CLIENT]: ReturnToClientStatus } {
  const value = (result as Record<symbol, unknown>)?.[RETURN_TO_CLIENT];
  return value === 'complete' || value === 'input-required' || value === 'deferred';
}

/**
 * Returns the intended turn status from a tool result marked with
 * {@link returnToClient}, or `undefined` if not marked.
 */
export function getReturnToClientStatus(result: unknown): ReturnToClientStatus | undefined {
  const value = (result as Record<symbol, unknown>)?.[RETURN_TO_CLIENT];
  if (value === 'complete' || value === 'input-required' || value === 'deferred') {
    return value;
  }
  return undefined;
}
