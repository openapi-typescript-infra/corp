import { type ExternalIDTypeFor, externalIds } from '@openapi-typescript-infra/external-id';

import { ExternalIDType as externalIDTypes } from './registry.ts';

export type {
  AnyExternalIDFor,
  ExternalIDFor,
  ParsedExternalID,
} from '@openapi-typescript-infra/external-id';

export const ExternalIDType = externalIDTypes;

export const {
  toExternalID,
  stringToExternalID,
  fromExternalID,
  parseExternalID,
  parseUnknownExternalID,
  getUuidFromString,
  toBareShortUuid,
  fromBaseShortUuid,
} = externalIds(externalIDTypes);

export type ExternalIDType = ExternalIDTypeFor<typeof externalIDTypes>;
