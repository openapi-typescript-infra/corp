import type { HSClientSideVariables } from '@justtellme/web-service';

export interface ConsumerWebClientSideVariables extends HSClientSideVariables {
  COOKIE_DOMAIN: string;
  STYTCH_TOKEN: string;
}
