import { describe, expect, test } from 'vitest';

import { HttpJTMGraphQLContext, WsJTMGraphQLContext } from './Context.ts';

describe('HttpJTMGraphQLContext', () => {
  test('uses only the principal established by HTTP authentication middleware', async () => {
    const principal = {
      encodeJwt: () => 'encoded-principal',
    };
    const context = new HttpJTMGraphQLContext(
      {
        app: {},
        headers: { 'x-auth-token': 'trusted-header' },
        cookies: {},
        user: principal,
      } as never,
      {} as never,
    );

    expect(await context.principal()).toBe(principal);
    expect(await context.xAuthTokenHeader()).toBe('encoded-principal');
  });

  test('does not decode an HTTP header when middleware did not establish a principal', async () => {
    const context = new HttpJTMGraphQLContext(
      {
        app: {},
        headers: { 'x-auth-token': 'trusted-header' },
        cookies: {},
      } as never,
      {} as never,
    );

    expect(await context.principal()).toBeUndefined();
    expect(await context.xAuthTokenHeader()).toBeUndefined();
  });
});

describe('WsJTMGraphQLContext', () => {
  test('uses WebSocket upgrade cookies for browser authentication', () => {
    const context = new WsJTMGraphQLContext(
      {} as never,
      {
        connectionParams: {},
        extra: {
          request: {
            headers: {
              cookie: 's_jwt=header.payload.signature; display=Just%20Tell%20Me',
            },
          },
        },
      } as never,
    );

    expect(context.headers.cookie).toBe('s_jwt=header.payload.signature; display=Just%20Tell%20Me');
    expect(context.cookies).toEqual({
      s_jwt: 'header.payload.signature',
      display: 'Just Tell Me',
    });
  });

  test('does not trust headers supplied by WebSocket connection parameters', () => {
    const context = new WsJTMGraphQLContext(
      {} as never,
      {
        connectionParams: {
          headers: {
            'x-auth-token': 'client-forged-token',
            cookie: 's_jwt=client-forged-cookie',
          },
        },
        extra: {
          request: {
            headers: {
              'x-auth-token': 'envoy-minted-token',
              cookie: 's_jwt=upgrade-cookie',
            },
          },
        },
      } as never,
    );

    expect(context.headers['x-auth-token']).toBe('envoy-minted-token');
    expect(context.cookies).toEqual({ s_jwt: 'upgrade-cookie' });
  });

  test('accepts explicitly trusted headers translated by the service', () => {
    const context = new WsJTMGraphQLContext(
      {} as never,
      {
        connectionParams: {
          headers: { Authorization: 'Bearer client-session-jwt' },
        },
        extra: { request: { headers: {} } },
      } as never,
      { 'x-auth-token': 'translated-token' },
    );

    expect(context.headers['x-auth-token']).toBe('translated-token');
    expect(context.headers.authorization).toBeUndefined();
  });
});
