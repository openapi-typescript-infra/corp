import type { components as IdentityInternal } from '@justtellme/api/identity-internal';
import { ServiceError } from '@openapi-typescript-infra/service';
import DataLoader from 'dataloader';

import type { GraphQLApiContext } from '#src/types/context.js';

export interface Dataloaders {
  basicIndividualInfoByIndividualUuid: DataLoader<
    string,
    IdentityInternal['schemas']['Individual'] | undefined,
    string
  >;
}

export function dataloaders(
  gqlContext: GraphQLApiContext,
  costFn: (n: number) => void,
): Dataloaders {
  const { identityInternal } = gqlContext.app.locals.datasources;
  const { logger } = gqlContext.app.locals;
  return {
    basicIndividualInfoByIndividualUuid: new DataLoader(async (uuids: readonly string[]) => {
      costFn(1);
      const individuals = await identityInternal.POST('/identity/individuals/search', {
        body: {
          identifiers: uuids.map((uuid) => ({
            namespace: 'individual-uuid' as const,
            identifier: uuid,
          })),
        },
      });
      if (!individuals.response.ok) {
        logger.error(individuals.error, 'Failed to fetch individuals');
        throw new ServiceError(gqlContext.app, 'Failed to get individuals', {
          status: individuals.response.status,
        });
      }
      return uuids.map((uuid) =>
        individuals.data?.individuals.find((i) => i.individual_uuid === uuid),
      );
    }),
  };
}
