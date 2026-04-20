import { ServiceError } from '@openapi-typescript-infra/service';
import { createHash } from 'crypto';
import { states as USStates } from 'states-us';

import type { components as Api } from '#src/generated/service/index.ts';
import type { IdentityInternal } from '#src/types/index.ts';

const StateMap = Object.fromEntries(
  USStates.map((usState) => [usState.name.toLowerCase(), usState.abbreviation]),
);

function normalizeUsState(state?: string): string | undefined {
  const baseState = state?.trim().toUpperCase();
  if (baseState?.length === 2) {
    return baseState;
  }
  return StateMap[baseState?.toLowerCase() || ''] || baseState;
}

function normalize(app: IdentityInternal['App'], address: Api['schemas']['AddressFields']) {
  let postal = address.postal_code.trim();
  let cleanState: string | undefined;

  if (address.country === 'US') {
    cleanState = normalizeUsState(address.state);
    if (cleanState?.length !== 2) {
      throw new ServiceError(app, 'US state is invalid', { status: 400 });
    }
    if (postal) {
      postal = postal.replace(/[^0-9]/g, '');
      if (postal.length !== 5 && postal.length !== 9) {
        throw new ServiceError(app, 'US postal code must be 5 or 9 digits', { status: 400 });
      }
    }
  }

  const normalized = {
    line_1: address.line_1?.trim() || undefined,
    line_2: address.line_2?.trim() || undefined,
    city: address.city.trim(),
    state: cleanState || address.state.trim(),
    postal_code: postal,
    country: address.country?.trim(),
  };

  if (!normalized.postal_code || !normalized.city || !normalized.state || !normalized.country) {
    throw new ServiceError(app, 'Missing required address field(s)', { status: 400 });
  }

  return normalized;
}

function getKey(address: Api['schemas']['AddressFields']) {
  return createHash('sha1')
    .update(
      [
        address.line_1 || '',
        address.line_2 || '',
        address.city,
        address.state,
        address.postal_code,
        address.country,
      ].join('|'),
    )
    .digest('base64url');
}

export function getAddressWithKey(
  app: IdentityInternal['App'],
  address: Api['schemas']['AddressFields'],
) {
  const normalized = normalize(app, address);
  return {
    ...normalized,
    key: getKey(normalized),
  };
}
