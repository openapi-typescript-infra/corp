import type { Attributes, Counter, Histogram } from '@opentelemetry/api';

import type { AuthnAuthzInternal } from '#src/types/service.ts';

interface RequestAttributes extends Attributes {
  host: string;
  method: string;
  auth?: string;
}

interface ResponseAttributes extends RequestAttributes {
  status: number;
}

export class Metrics {
  requests: Counter<RequestAttributes>;
  responses: Counter<ResponseAttributes>;
  refreshes: Counter<ResponseAttributes>;

  localTime: Histogram<ResponseAttributes>;

  constructor(app: AuthnAuthzInternal['App']) {
    this.requests = app.locals.meter.createCounter('envoy_auth_requests', {
      description: 'Total number of Envoy auth requests',
    });
    this.responses = app.locals.meter.createCounter('envoy_auth_responses', {
      description: 'Total number of Envoy auth responses',
    });
    this.refreshes = app.locals.meter.createCounter('token_refreshes', {
      description: 'Total number of token refreshes',
    });
    this.localTime = app.locals.meter.createHistogram('authn_authz_time', {
      description: 'Time spent waiting for local auth',
    });
  }

  startTimer() {
    const start = process.hrtime.bigint();
    return () => Number(process.hrtime.bigint() - start) / 1e9;
  }
}
