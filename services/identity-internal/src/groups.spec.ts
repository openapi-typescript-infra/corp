import { randomUUID } from 'crypto';

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
});
