import type { HSServiceRequest } from '@justtellme/service';
import type { HSPrincipal } from '../authentication/index.ts';
import type { HSServiceWithSessionLocals } from '../types.ts';

export interface EndUserData<
  SLocals extends HSServiceWithSessionLocals = HSServiceWithSessionLocals,
> {
  type: 'user';
  uuid: string;
  req: HSServiceRequest<SLocals>;
  // Make it easier to ask about patient access repeatedly.
  // Maps Patient UUID to boolean
  $cachedPatientAccess?: Map<string, boolean>;
}

/**
 * A "request document" is created for a single HTTP request. Typically, you will extend this class
 * to add additional context for use in your authorization logic. We provide a handful of
 * company-wide properties for standard rules.
 */
export function getRequestDocument<
  SLocals extends HSServiceWithSessionLocals = HSServiceWithSessionLocals,
>(req: HSServiceRequest<SLocals>, additionalParameters: Record<string, unknown> = {}) {
  interface ReqWithOpenApi extends HSServiceRequest<SLocals> {
    openapi?: {
      pathParams?: Record<string, string>;
    };
  }

  // Let functions access the req object but do NOT let rules access it
  function addReqObject<T>(readableValues: T): T & { req: HSServiceRequest<SLocals> } {
    Object.defineProperty(readableValues, 'req', {
      value: req,
      enumerable: false,
      configurable: true,
      writable: false,
    });
    return readableValues as T & { req: HSServiceRequest<SLocals> };
  }

  let consumer: EndUserData | undefined;

  const document = {
    user: req.user,
    // During security middleware in openapi, path.params has not yet been populated,
    // but req.openapi.pathParams has been. I think the cleanest thing is to just merge them,
    // though path params will almost always be empty in these cases
    params: {
      ...req.params,
      ...(req as ReqWithOpenApi).openapi?.pathParams,
      ...additionalParameters,
    },
    query: req.query,
    body: req.body,
    headers: req.headers,

    groups(): string[] {
      return req.user?.groups || [];
    },

    permissions(): string[] {
      return req.user?.scopes || [];
    },

    scopes(): string[] {
      return req.user?.scopes || [];
    },

    role(): HSPrincipal['role'] | undefined {
      return req.user?.role;
    },

    userUuid(): string | undefined {
      return req.user?.userUuid;
    },

    clientId(): string | undefined {
      return req.user?.clientId;
    },

    principal(): EndUserData | undefined {
      if (req.user?.role === 'user') {
        return document.enduser();
      }
      return undefined;
    },

    enduser(): EndUserData | undefined {
      if (consumer) {
        return consumer;
      }
      if (req.user?.role !== 'user' || !req.user.userUuid) {
        return undefined;
      }
      // Ok, it is indeed a consumer
      consumer = addReqObject({
        type: 'user',
        uuid: req.user.userUuid,
      });
      return consumer;
    },
  };

  return document;
}
