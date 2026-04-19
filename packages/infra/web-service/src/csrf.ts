import crypto from 'node:crypto';
import type { RequestWithApp, ResponseFromApp } from '@openapi-typescript-infra/service';
import { ServiceError } from '@openapi-typescript-infra/service';

import type { HSWebConfigurationSchema } from './config.ts';
import type { HSWebServiceLocals } from './types.ts';

const DEFAULT_COOKIE_NAME = '_csrf';
const RES_COOKIE_PROP = Symbol('CSRF initial request property');

interface ResLocalsWithCookie {
  [RES_COOKIE_PROP]: string;
}

function matches(rules: string | RegExp | (string | RegExp)[], url: string) {
  if (Array.isArray(rules)) {
    if (rules.find((rule) => matches(rule, url))) {
      return true;
    }
  }
  if (rules instanceof RegExp) {
    return rules.test(url);
  }
  return rules === url;
}

function shouldValidate(url: string, exclude?: (string | RegExp)[], include?: (string | RegExp)[]) {
  if (exclude) {
    if (matches(exclude, url)) {
      return false;
    }
  }
  if (include) {
    if (!matches(include, url)) {
      return false;
    }
  }
  return true;
}

export function assignCsrfCookie(
  config: HSWebConfigurationSchema['csrf'],
  _req: RequestWithApp,
  res: ResponseFromApp,
) {
  // 1 is a "version number" in case we want to change this at some point
  const cookie = `1.${crypto.randomBytes(12).toString('base64')}`;
  res?.cookie(config.headerAndCookieName || DEFAULT_COOKIE_NAME, cookie, config.cookie || {});
  (res.locals as unknown as ResLocalsWithCookie)[RES_COOKIE_PROP] = cookie;
}

export function isValidCsrf(
  config: HSWebConfigurationSchema['csrf'],
  req: RequestWithApp,
  res: ResponseFromApp,
  // If you pull the expected value from somewhere else (like session), you can pass it in here
  referenceValue?: string,
) {
  // Assign the cookie
  if (config.autoAssignCookie) {
    if (!req.cookies?.[config.headerAndCookieName || DEFAULT_COOKIE_NAME]) {
      assignCsrfCookie(config, req, res);
    }
  }

  // Does this method need validation?
  if (
    req.method.toLowerCase() === 'get' ||
    req.method.toLowerCase() === 'head' ||
    !shouldValidate(req.originalUrl, config.exclude, config.include)
  ) {
    return true;
  }

  // Do validation
  const name = config.headerAndCookieName || DEFAULT_COOKIE_NAME;
  const header = req.headers[name];
  const headerValue = Array.isArray(header) ? header[0] : header;
  const csrfValue = headerValue || (req.body?.[name] as string | undefined);

  const expectedValue: string = referenceValue || req.cookies?.[name];

  if (
    (expectedValue && csrfValue === expectedValue) ||
    (csrfValue && decodeURIComponent(csrfValue) === decodeURIComponent(expectedValue))
  ) {
    return true;
  }

  req.app.locals.logger.debug('CSRF validation failed');
  return false;
}

export function validateCsrf(
  config: HSWebConfigurationSchema['csrf'],
  req: RequestWithApp,
  res: ResponseFromApp,
) {
  const isValid = isValidCsrf(config, req, res);
  if (!isValid) {
    if (config.action === 'block') {
      throw new ServiceError(req.app, 'Request validation failed', {
        status: 400,
        domain: 'http',
        code: 'validation',
      });
    } else if (config.action === 'warn') {
      req.app.locals.logger.warn('CSRF validation failed');
    }
  }
}

export function getCsrf<
  SLocals extends
    HSWebServiceLocals<HSWebConfigurationSchema> = HSWebServiceLocals<HSWebConfigurationSchema>,
>(req: RequestWithApp<SLocals>) {
  const conf = req.app.locals.config.csrf;
  const cookie = req.cookies?.[conf.headerAndCookieName || DEFAULT_COOKIE_NAME];
  return cookie || (req.res?.locals as ResLocalsWithCookie)[RES_COOKIE_PROP];
}
