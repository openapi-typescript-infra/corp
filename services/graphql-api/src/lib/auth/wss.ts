import { request } from 'undici';
import { getDatasourceConfiguration } from '@justtellme/service';

import type { GraphqlApi } from '#src/types/index.js';

let headers: Record<string, string>;
let fetchPath: string;

export async function getTranslatedAuthHeaders(app: GraphqlApi['App'], authHeader: string) {
  if (!fetchPath) {
    const me = new URL(process.env.WHOAMI as string);
    const config = getDatasourceConfiguration(app, 'authn-authz-internal', {
      headers: {
        host: me.hostname,
      },
    });
    fetchPath = `${config.baseUrl}/ambassador/external${me.pathname}`;
    headers = {
      Host: me.hostname,
      // 'User-Agent': config.ua,
    };
  }
  return request(fetchPath, {
    headers: {
      ...headers,
      Authorization: authHeader,
    },
  }).then((res) => {
    return {
      'x-sesame-user-uuid': res.headers['x-sesame-user-uuid'],
      'x-sesame-token': res.headers['x-sesame-token'],
    };
  });
}
