import type { StytchClient, StytchClientOptions } from '@stytch/nextjs';
import { createStytchClient } from '@stytch/nextjs';

declare global {
  var __internalWebStytchClients: Map<string, StytchClient> | undefined;
}

export function getSingletonStytchHeadlessClient(
  token: string,
  options: StytchClientOptions,
): StytchClient | undefined {
  if (!token) {
    return undefined;
  }

  const clients = globalThis.__internalWebStytchClients ?? new Map<string, StytchClient>();
  globalThis.__internalWebStytchClients = clients;

  const existingClient = clients.get(token);
  if (existingClient) {
    return existingClient;
  }

  const client = createStytchClient(token, options);
  clients.set(token, client);
  return client;
}
