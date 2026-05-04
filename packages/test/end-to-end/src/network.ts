import { env } from '#src/env/index.ts';

function joinUrl(base: string, path: string) {
  return `${base.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
}

export function api(path = '/') {
  return joinUrl(env().api, path);
}

export function graphqlApi(path = '/') {
  return joinUrl(env().graphqlApi, path);
}

export function webUrl(path = '/') {
  return joinUrl(env().web.host, path);
}
