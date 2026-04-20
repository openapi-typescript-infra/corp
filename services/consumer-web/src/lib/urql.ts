import { getEnvVar } from '@justtellme/web-service/isomorphic';
import snakeCase from 'lodash-es/snakeCase';
import type { GetServerSidePropsContext, NextPageContext } from 'next';
import { initUrqlClient } from 'next-urql';
import type { Client, ClientOptions, CombinedError, SSRExchange } from 'urql';
import { cacheExchange, fetchExchange, ssrExchange } from 'urql';

import type { ConsumerWebClientSideVariables, SerializedCombinedError } from '#src/types/index.ts';

/**
 * Extracts the necessary headers from the request.
 */
export const getHeaders = (
  ctx?: GetServerSidePropsContext | NextPageContext,
): { headers: Record<string, string> } | undefined => {
  if (typeof window !== 'undefined' || !ctx) {
    return;
  }

  const cookie = ctx?.req?.headers?.['cookie'];

  if (!cookie) {
    return;
  }

  return {
    headers: {
      Cookie: cookie,
    },
  };
};

/**
 * Returns an Urql client options object. Optionally populates the headers if a next context is available.
 */
export const getUrqlClientOptions = (
  ssrExchange: SSRExchange,
  ctx?: GetServerSidePropsContext | NextPageContext,
): ClientOptions => ({
  url: getEnvVar<ConsumerWebClientSideVariables>(
    'GRAPHQL_ENDPOINT',
    'https://api.justtellme.com/graphql',
  ),
  exchanges: [cacheExchange, ssrExchange, fetchExchange],
  fetchOptions: {
    credentials: 'include',
    ...getHeaders(ctx),
  },
  suspense: false,
});

/**
 * Returns an Urql client instance intended to be used within getServerSideProps.
 */
export const getServerUrqlClient = (ctx?: GetServerSidePropsContext): Client => {
  if (typeof window !== 'undefined') {
    throw new Error(
      'Used getServerUrqlClient in a client environment, this is meant only for the server.',
    );
  }

  const clientOptions = getUrqlClientOptions(ssrExchange({ isClient: false }), ctx);
  return initUrqlClient(clientOptions, false);
};

/**
 * Returns a serialized error compatible with getServerSideProps.
 */
export const serializeError = (error?: Error | unknown): SerializedCombinedError | null => {
  if (!error) {
    return null;
  }

  return JSON.parse(JSON.stringify(error));
};

/**
 * Converts an extensions error code to screaming snake case.
 */
export const formatExtensionError = (code: unknown | undefined) => {
  return code && typeof code === 'string' ? snakeCase(code).toUpperCase() : undefined;
};

/**
 * Returns a flat list of error codes present in the combined error.
 */
export const flattenErrorCodes = (error: CombinedError | undefined) => {
  return (error?.graphQLErrors ?? [])
    .map((err) => formatExtensionError(err?.extensions?.code))
    .filter(Boolean);
};

/**
 * Returns true if a combined error contains the specified error.
 */
export const hasError = (code: string, error: CombinedError | undefined) => {
  return error ? flattenErrorCodes(error).includes(code) : false;
};
