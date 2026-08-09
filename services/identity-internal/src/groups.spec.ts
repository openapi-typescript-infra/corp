import { randomUUID } from 'node:crypto';

import { describe, expect } from 'vitest';

import { testWithApp } from './test.fixtures.ts';

function getUuid(response: { data?: { individual_uuid?: string } }): string {
  const uuid = response.data?.individual_uuid;
  expect(uuid).toBeDefined();
  return uuid as string;
}

const TEST_GROUP_TYPE = 'default';

describe('Group API', () => {
  describe('POST /identity/groups', () => {
    testWithApp('creates a group', async ({ client }) => {
      const name = ['test', randomUUID()];
      const response = await client.POST('/identity/groups', {
        body: { name, group_type: TEST_GROUP_TYPE, display_name: 'Test Group' },
      });

      expect(response.response.status).toBe(201);
      expect(response.data?.name).toEqual(name);
      expect(response.data?.group_type).toBe(TEST_GROUP_TYPE);
      expect(response.data?.display_name).toBe('Test Group');
      expect(response.data?.group_id).toBeDefined();
    });

    testWithApp('returns 409 for duplicate group', async ({ client }) => {
      const name = ['test', randomUUID()];
      const first = await client.POST('/identity/groups', {
        body: { name, group_type: TEST_GROUP_TYPE },
      });
      expect(first.response.status).toBe(201);

      const second = await client.POST('/identity/groups', {
        body: { name, group_type: TEST_GROUP_TYPE },
      });
      expect(second.response.status).toBe(409);
    });
  });

  describe('POST /identity/groups/search', () => {
    testWithApp('searches by exact name components', async ({ client }) => {
      const prefix = randomUUID();
      const name = [prefix, 'child'];
      await client.POST('/identity/groups', {
        body: { name, group_type: TEST_GROUP_TYPE },
      });

      const search = await client.POST('/identity/groups/search', {
        body: { components: [prefix, 'child'] },
      });

      expect(search.response.status).toBe(200);
      expect(search.data?.groups).toHaveLength(1);
      expect(search.data?.groups?.[0].name).toEqual(name);
    });

    testWithApp('searches with wildcard query', async ({ client }) => {
      const prefix = randomUUID();
      await client.POST('/identity/groups', {
        body: { name: [prefix, 'a'], group_type: TEST_GROUP_TYPE },
      });
      await client.POST('/identity/groups', {
        body: { name: [prefix, 'b'], group_type: TEST_GROUP_TYPE },
      });

      const search = await client.POST('/identity/groups/search', {
        body: { components: [prefix, { query: '*' }] },
      });

      expect(search.response.status).toBe(200);
      expect(search.data?.groups).toHaveLength(2);
    });

    testWithApp('returns empty groups for no match', async ({ client }) => {
      const search = await client.POST('/identity/groups/search', {
        body: { components: [randomUUID(), 'nonexistent'] },
      });

      expect(search.response.status).toBe(200);
      expect(search.data?.groups).toHaveLength(0);
    });
  });

  describe('PATCH /identity/groups', () => {
    testWithApp('updates display_name', async ({ client }) => {
      const name = ['test', randomUUID()];
      await client.POST('/identity/groups', {
        body: { name, group_type: TEST_GROUP_TYPE, display_name: 'Old Name' },
      });

      const patch = await client.PATCH('/identity/groups', {
        body: { name, display_name: 'New Name' },
      });

      expect(patch.response.status).toBe(200);
      expect(patch.data?.display_name).toBe('New Name');
    });

    testWithApp('adds a member by UUID', async ({ client }) => {
      const name = ['test', randomUUID()];
      await client.POST('/identity/groups', {
        body: { name, group_type: TEST_GROUP_TYPE },
      });

      const created = await client.POST('/identity/individuals', { body: {} });
      const uuid = getUuid(created);

      const patch = await client.PATCH('/identity/groups', {
        body: {
          name,
          members: [{ individual: uuid, operation: 'add' as const }],
        },
      });

      expect(patch.response.status).toBe(200);
      expect(patch.data?.members).toHaveLength(1);
      expect(patch.data?.members?.[0].individual_uuid).toBe(uuid);
    });

    testWithApp('adds a member by identifier and namespace', async ({ client }) => {
      const name = ['test', randomUUID()];
      await client.POST('/identity/groups', {
        body: { name, group_type: TEST_GROUP_TYPE },
      });

      const email = `group-member-${Date.now()}@example.com`;
      await client.POST('/identity/individuals', {
        body: {
          identifiers: [{ namespace: 'consumer-email', identifier: email }],
        },
      });

      const patch = await client.PATCH('/identity/groups', {
        body: {
          name,
          members: [
            {
              individual: { identifier: email, namespace: 'consumer-email' },
              operation: 'add' as const,
            },
          ],
        },
      });

      expect(patch.response.status).toBe(200);
      expect(patch.data?.members).toHaveLength(1);
      expect(patch.data?.members?.[0].individual_uuid).toBeDefined();
    });

    testWithApp('removes a member', async ({ client }) => {
      const name = ['test', randomUUID()];
      await client.POST('/identity/groups', {
        body: { name, group_type: TEST_GROUP_TYPE },
      });

      const created = await client.POST('/identity/individuals', { body: {} });
      const uuid = getUuid(created);

      // Add member
      await client.PATCH('/identity/groups', {
        body: {
          name,
          members: [{ individual: uuid, operation: 'add' as const }],
        },
      });

      // Remove member
      const patch = await client.PATCH('/identity/groups', {
        body: {
          name,
          members: [{ individual: uuid, operation: 'remove' as const }],
        },
      });

      expect(patch.response.status).toBe(200);

      // Verify membership is gone by checking the individual's groups
      const get = await client.GET('/identity/individuals/{namespace}/{identifier}', {
        params: {
          path: { namespace: 'individual-uuid', identifier: uuid },
          query: { groups: true },
        },
      });
      expect(get.data?.items?.[0].groups?.length || 0).toBe(0);
    });

    testWithApp('returns 404 for non-existent group', async ({ client }) => {
      const patch = await client.PATCH('/identity/groups', {
        body: { name: ['nonexistent', randomUUID()], display_name: 'Nope' },
      });

      expect(patch.response.status).toBe(404);
    });
  });

  describe('GET/PATCH /identity/groups/{namespace}/{identifier}', () => {
    testWithApp(
      'supports virtual UUID lookup and requested components',
      async ({ client, locals }) => {
        const email = `group-${randomUUID()}@example.com`;
        const profileName = `group-profile-${randomUUID()}`;
        await locals.db.insertInto('profile_schemas').values({ name: profileName }).execute();
        const created = await client.POST('/identity/groups', {
          body: {
            name: [randomUUID(), 'target'],
            group_type: TEST_GROUP_TYPE,
            identifiers: [{ namespace: 'consumer-email', identifier: email }],
          },
        });
        expect(created.response.status).toBe(201);

        const byUuid = await client.GET('/identity/groups/{namespace}/{identifier}', {
          params: {
            path: { namespace: 'group_uuid', identifier: created.data?.group_id ?? '' },
            query: {},
          },
        });
        expect(byUuid.response.status).toBe(200);
        expect(byUuid.data?.group_id).toBe(created.data?.group_id);

        const patch = await client.PATCH('/identity/groups/{namespace}/{identifier}', {
          params: { path: { namespace: 'consumer-email', identifier: email } },
          body: {
            display_name: 'Updated Group',
            profiles: [
              {
                name: profileName,
                patch: [{ op: 'add', path: '/theme', value: 'test' }],
              },
            ],
            addresses: [
              {
                address_type: 'home',
                line_1: '1 Main St',
                city: 'Boston',
                state: 'MA',
                postal_code: '02108',
                country: 'US',
              },
            ],
            identifiers: [
              { namespace: 'consumer-email', identifier: `alias-${randomUUID()}@example.com` },
            ],
          },
        });
        expect(patch.response.status).toBe(200);
        expect(patch.data?.display_name).toBe('Updated Group');

        const get = await client.GET('/identity/groups/{namespace}/{identifier}', {
          params: {
            path: { namespace: 'consumer-email', identifier: email },
            query: { addresses: ['home'], identifier_namespaces: ['*'], profiles: [profileName] },
          },
        });
        expect(get.response.status).toBe(200);
        expect(get.data?.addresses?.[0]).toEqual(
          expect.objectContaining({ address_type: 'home', city: 'Boston' }),
        );
        expect(get.data?.identifiers).toHaveLength(2);
        expect(get.data?.profiles?.[0]).toEqual(
          expect.objectContaining({ name: profileName, profile: { theme: 'test' } }),
        );
      },
    );
  });

  describe('group consents', () => {
    testWithApp(
      'records the individual actor and retrieves the current decision',
      async ({ client, locals }) => {
        const existingConsentType = await locals.db
          .selectFrom('consent_types')
          .select('consent_type_id')
          .where('name', '=', 'marketing')
          .executeTakeFirst();
        if (!existingConsentType) {
          await locals.db.insertInto('consent_types').values({ name: 'marketing' }).execute();
        }

        const group = await client.POST('/identity/groups', {
          body: { name: ['consent-test', randomUUID()], group_type: TEST_GROUP_TYPE },
        });
        const firstActor = getUuid(await client.POST('/identity/individuals', { body: {} }));
        const secondActor = getUuid(await client.POST('/identity/individuals', { body: {} }));
        const path = {
          namespace: 'group_uuid',
          identifier: group.data?.group_id ?? '',
        };

        const granted = await client.PUT('/identity/groups/{namespace}/{identifier}/consents', {
          params: { path },
          body: {
            actor_individual_uuid: firstActor,
            consents: [{ type: 'marketing', version: '2026-08', granted: true }],
          },
        });
        expect(granted.response.status).toBe(200);
        expect(granted.data?.consents[0]).toEqual(
          expect.objectContaining({
            type: 'marketing',
            version: '2026-08',
            granted: true,
            actor_individual_uuid: firstActor,
          }),
        );

        const denied = await client.PUT('/identity/groups/{namespace}/{identifier}/consents', {
          params: { path },
          body: {
            actor_individual_uuid: secondActor,
            consents: [{ type: 'marketing', version: '2026-08', granted: false }],
          },
        });
        expect(denied.response.status).toBe(200);

        const retrieved = await client.GET('/identity/groups/{namespace}/{identifier}', {
          params: { path, query: { consents: ['marketing'] } },
        });
        expect(retrieved.response.status).toBe(200);
        expect(retrieved.data?.consents?.[0]).toEqual(
          expect.objectContaining({
            type: 'marketing',
            version: '2026-08',
            granted: false,
            actor_individual_uuid: secondActor,
          }),
        );

        await client.PUT('/identity/groups/{namespace}/{identifier}/consents', {
          params: { path },
          body: {
            actor_individual_uuid: secondActor,
            consents: [{ type: 'marketing', version: '2026-08', granted: false }],
          },
        });
        const storedGroup = await locals.db
          .selectFrom('groups')
          .select('group_id')
          .where('group_uuid', '=', group.data?.group_id ?? '')
          .executeTakeFirstOrThrow();
        const records = await locals.db
          .selectFrom('group_consents')
          .select('group_consent_id')
          .where('group_id', '=', storedGroup.group_id)
          .execute();
        expect(records).toHaveLength(2);
      },
    );

    testWithApp('returns 404 when the actor does not exist', async ({ client }) => {
      const group = await client.POST('/identity/groups', {
        body: { name: ['consent-test', randomUUID()], group_type: TEST_GROUP_TYPE },
      });
      const response = await client.PUT('/identity/groups/{namespace}/{identifier}/consents', {
        params: {
          path: { namespace: 'group_uuid', identifier: group.data?.group_id ?? '' },
        },
        body: {
          actor_individual_uuid: randomUUID(),
          consents: [{ type: 'marketing', version: '2026-08', granted: true }],
        },
      });
      expect(response.response.status).toBe(404);
    });
  });
});
