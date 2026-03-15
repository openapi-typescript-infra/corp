import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeEach, expect } from 'vitest';

export function setupNetworkMocks(...handlers: Parameters<typeof setupServer>) {
  const server = setupServer(...handlers);
  beforeEach(() => server.listen({ onUnhandledRequest: 'bypass' }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  if (process.env.MSW_LOG) {
    server.events.on('request:start', ({ request }) => {
      console.log('Outgoing Request:', request.method, request.url);
    });
  }

  return server;
}

interface NetworkResponse {
  response: Response;
  error?: unknown;
}

/**
 * Useful for checking response status codes and printing results
 * if they fail (but staying quiet if they don't)
 */
export function expectStatus(code: number, message?: string) {
  async function expector<T extends NetworkResponse>(rz: T) {
    if (code !== rz.response.status) {
      const body = await rz.response.text();
      // eslint-disable-next-line no-console
      console.dir(
        {
          status: rz.response.status,
          statusText: rz.response.statusText,
          error: rz.error,
          headers: rz.response.headers,
          body,
        },
        { depth: null },
      );
    }
    expect(rz.response.status, message).toBe(code);
    return rz;
  }

  return expector;
}
