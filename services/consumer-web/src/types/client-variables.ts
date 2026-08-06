import type { JTMClientSideVariables } from '@justtellme/web-service';

export interface ConsumerWebClientSideVariables extends JTMClientSideVariables {
  COOKIE_DOMAIN: string;
  STYTCH_TOKEN: string;
}
