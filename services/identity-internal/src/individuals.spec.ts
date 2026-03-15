import { describe, expect } from 'vitest';

import { testWithApp } from './test.fixtures.ts';

function getUuid(response: { data?: { individual_uuid?: string } }): string {
  const uuid = response.data?.individual_uuid;
  expect(uuid).toBeDefined();
  return uuid as string;
}

const TEST_GROUP_TYPE = 'default';

describe('Individual API', () => {
  describe('POST /identity/individuals', () => {
    testWithApp('creates a bare individual with no identifiers', async ({ client }) => {
      const response = await client.POST('/identity/individuals', {
        body: {},
      });

      expect(response.response.status).toBe(201);
      expect(response.data).toBeDefined();
      const uuid = getUuid(response);
      expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });

    testWithApp('creates an individual with birthdate and biological_sex', async ({ client }) => {
      const response = await client.POST('/identity/individuals', {
        body: {
          birthdate: '1990-06-15',
          biological_sex: 'female',
        },
      });

      expect(response.response.status).toBe(201);
      const uuid = getUuid(response);

      // Verify the fields were saved by retrieving with fields param
      const getResponse = await client.GET('/identity/individuals', {
        params: {
          query: {
            individual_uuids: [uuid],
            fields: ['birthdate', 'biological_sex'],
          },
        },
      });

      expect(getResponse.response.status).toBe(200);
      expect(getResponse.data?.individuals).toHaveLength(1);
      expect(getResponse.data?.individuals?.[0]).toMatchObject({
        individual_uuid: uuid,
        birthdate: '1990-06-15',
        biological_sex: 'female',
      });
    });

    testWithApp('creates an individual with a forced UUID', async ({ client }) => {
      const forcedUuid = crypto.randomUUID();
      const response = await client.POST('/identity/individuals', {
        body: {
          individual_uuid: forcedUuid,
        },
      });

      expect(response.response.status).toBe(201);
      expect(getUuid(response)).toBe(forcedUuid);
    });

    testWithApp('creates an individual with an email identifier', async ({ client }) => {
      const email = `test-${Date.now()}@example.com`;
      const response = await client.POST('/identity/individuals', {
        body: {
          identifiers: [{ namespace: 'consumer-email', identifier: email }],
        },
      });

      expect(response.response.status).toBe(201);
      const uuid = getUuid(response);

      // Retrieve by the identifier
      const getResponse = await client.GET('/identity/individuals/{namespace}/{identifier}', {
        params: {
          path: { namespace: 'consumer-email', identifier: email },
          query: { identifier_namespaces: ['consumer-email'] },
        },
      });

      expect(getResponse.response.status).toBe(200);
      expect(getResponse.data?.total).toBe(1);
      expect(getResponse.data?.items?.[0]?.individual_uuid).toBe(uuid);

      // Check identifiers are returned
      const identifiers = getResponse.data?.items?.[0]?.identifiers;
      expect(identifiers).toBeDefined();
      const emailId = identifiers?.find((id) => id.identifier_namespace === 'consumer-email');
      expect(emailId).toBeDefined();
      expect(emailId?.identifier).toBe(email.toLowerCase());
    });

    testWithApp('creates an individual with multiple identifiers', async ({ client }) => {
      const email = `multi-${Date.now()}@example.com`;
      const phone = `1555${String(Date.now()).slice(-7)}`;

      const response = await client.POST('/identity/individuals', {
        body: {
          identifiers: [
            { namespace: 'consumer-email', identifier: email },
            { namespace: 'phone', identifier: phone },
          ],
        },
      });

      expect(response.response.status).toBe(201);
      const uuid = getUuid(response);

      // Retrieve by email
      const byEmail = await client.GET('/identity/individuals/{namespace}/{identifier}', {
        params: {
          path: { namespace: 'consumer-email', identifier: email },
        },
      });

      expect(byEmail.response.status).toBe(200);
      expect(byEmail.data?.items?.[0]?.individual_uuid).toBe(uuid);

      // Retrieve by phone
      const byPhone = await client.GET('/identity/individuals/{namespace}/{identifier}', {
        params: {
          path: { namespace: 'phone', identifier: phone },
        },
      });

      expect(byPhone.response.status).toBe(200);
      expect(byPhone.data?.items?.[0]?.individual_uuid).toBe(uuid);
    });

    testWithApp(
      'returns 409 on duplicate unique identifier with forced UUID',
      async ({ client }) => {
        const email = `dup-${Date.now()}@example.com`;

        // Create first individual
        const first = await client.POST('/identity/individuals', {
          body: {
            identifiers: [{ namespace: 'consumer-email', identifier: email }],
          },
        });
        expect(first.response.status).toBe(201);
        const firstUuid = getUuid(first);

        // Force a different UUID with the same email — should conflict
        const conflict = await client.POST('/identity/individuals', {
          body: {
            individual_uuid: crypto.randomUUID(),
            identifiers: [{ namespace: 'consumer-email', identifier: email }],
          },
        });

        expect(conflict.response.status).toBe(409);
        expect(conflict.error).toEqual(
          expect.objectContaining({ conflicting_individual_uuid: firstUuid }),
        );
      },
    );

    testWithApp('rejects invalid birthdate', async ({ client }) => {
      const response = await client.POST('/identity/individuals', {
        body: {
          birthdate: 'not-a-date',
        },
      });

      expect(response.response.status).toBe(400);
    });
  });

  describe('GET /identity/individuals', () => {
    testWithApp('retrieves an individual by UUID', async ({ client }) => {
      const created = await client.POST('/identity/individuals', {
        body: {},
      });
      const uuid = getUuid(created);

      const response = await client.GET('/identity/individuals', {
        params: {
          query: { individual_uuids: [uuid] },
        },
      });

      expect(response.response.status).toBe(200);
      expect(response.data?.individuals).toHaveLength(1);
      expect(response.data?.individuals?.[0]?.individual_uuid).toBe(uuid);
    });

    testWithApp('retrieves multiple individuals by UUIDs', async ({ client }) => {
      const created1 = await client.POST('/identity/individuals', {
        body: {},
      });
      const created2 = await client.POST('/identity/individuals', {
        body: {},
      });
      const uuid1 = getUuid(created1);
      const uuid2 = getUuid(created2);

      const response = await client.GET('/identity/individuals', {
        params: {
          query: { individual_uuids: [uuid1, uuid2] },
        },
      });

      expect(response.response.status).toBe(200);
      expect(response.data?.individuals).toHaveLength(2);
      const uuids = response.data?.individuals?.map((i) => i.individual_uuid);
      expect(uuids).toContain(uuid1);
      expect(uuids).toContain(uuid2);
    });

    testWithApp('retrieves an individual by external_id', async ({ client }) => {
      const email = `ext-${Date.now()}@example.com`;
      const created = await client.POST('/identity/individuals', {
        body: {
          identifiers: [{ namespace: 'consumer-email', identifier: email }],
        },
      });
      const uuid = getUuid(created);

      const response = await client.GET('/identity/individuals', {
        params: {
          query: { external_ids: [`consumer-email:${email}`] },
        },
      });

      expect(response.response.status).toBe(200);
      expect(response.data?.individuals).toHaveLength(1);
      expect(response.data?.individuals?.[0]?.individual_uuid).toBe(uuid);
    });

    testWithApp('retrieves by external_id with individual-uuid namespace', async ({ client }) => {
      const created = await client.POST('/identity/individuals', {
        body: {},
      });
      const uuid = getUuid(created);

      const response = await client.GET('/identity/individuals', {
        params: {
          query: { external_ids: [`individual-uuid:${uuid}`] },
        },
      });

      expect(response.response.status).toBe(200);
      expect(response.data?.individuals).toHaveLength(1);
      expect(response.data?.individuals?.[0]?.individual_uuid).toBe(uuid);
    });

    testWithApp('returns 404 when no individuals match', async ({ client }) => {
      const response = await client.GET('/identity/individuals', {
        params: {
          query: { individual_uuids: [crypto.randomUUID()] },
        },
      });

      expect(response.response.status).toBe(404);
    });

    testWithApp('returns birthdate and biological_sex only when requested', async ({ client }) => {
      const created = await client.POST('/identity/individuals', {
        body: { birthdate: '1985-03-20', biological_sex: 'male' },
      });
      const uuid = getUuid(created);

      // Without fields param — should not include birthdate/biological_sex
      const withoutFields = await client.GET('/identity/individuals', {
        params: { query: { individual_uuids: [uuid] } },
      });
      expect(withoutFields.data?.individuals?.[0]?.birthdate).toBeUndefined();
      expect(withoutFields.data?.individuals?.[0]?.biological_sex).toBeUndefined();

      // With fields param
      const withFields = await client.GET('/identity/individuals', {
        params: {
          query: {
            individual_uuids: [uuid],
            fields: ['birthdate', 'biological_sex'],
          },
        },
      });
      expect(withFields.data?.individuals?.[0]?.birthdate).toBe('1985-03-20');
      expect(withFields.data?.individuals?.[0]?.biological_sex).toBe('male');
    });

    testWithApp('returns identifiers when requested', async ({ client }) => {
      const email = `ns-${Date.now()}@example.com`;
      const created = await client.POST('/identity/individuals', {
        body: {
          identifiers: [{ namespace: 'consumer-email', identifier: email }],
        },
      });
      const uuid = getUuid(created);

      const response = await client.GET('/identity/individuals', {
        params: {
          query: {
            individual_uuids: [uuid],
            identifier_namespaces: ['consumer-email'],
          },
        },
      });

      expect(response.response.status).toBe(200);
      const identifiers = response.data?.individuals?.[0]?.identifiers;
      expect(identifiers).toBeDefined();
      expect(identifiers?.length).toBeGreaterThanOrEqual(1);
      expect(identifiers?.[0]?.identifier_namespace).toBe('consumer-email');
      expect(identifiers?.[0]?.identifier).toBe(email.toLowerCase());
    });
  });

  describe('GET /identity/individuals/{namespace}/{identifier}', () => {
    testWithApp('retrieves an individual by namespace and identifier', async ({ client }) => {
      const email = `lookup-${Date.now()}@example.com`;
      const created = await client.POST('/identity/individuals', {
        body: {
          identifiers: [{ namespace: 'consumer-email', identifier: email }],
          birthdate: '2000-01-01',
        },
      });
      const uuid = getUuid(created);

      const response = await client.GET('/identity/individuals/{namespace}/{identifier}', {
        params: {
          path: { namespace: 'consumer-email', identifier: email },
          query: { fields: ['birthdate'] },
        },
      });

      expect(response.response.status).toBe(200);
      expect(response.data?.total).toBe(1);
      expect(response.data?.items?.[0]).toEqual(
        expect.objectContaining({
          individual_uuid: uuid,
          is_unique: true,
          created_at: expect.any(String),
          birthdate: '2000-01-01',
        }),
      );
    });

    testWithApp('retrieves by individual-uuid namespace', async ({ client }) => {
      const created = await client.POST('/identity/individuals', {
        body: {},
      });
      const uuid = getUuid(created);

      const response = await client.GET('/identity/individuals/{namespace}/{identifier}', {
        params: {
          path: { namespace: 'individual-uuid', identifier: uuid },
        },
      });

      expect(response.response.status).toBe(200);
      expect(response.data?.total).toBe(1);
      expect(response.data?.items?.[0]?.individual_uuid).toBe(uuid);
    });

    testWithApp('returns 404 for non-existent identifier', async ({ client }) => {
      const response = await client.GET('/identity/individuals/{namespace}/{identifier}', {
        params: {
          path: {
            namespace: 'consumer-email',
            identifier: 'nonexistent@example.com',
          },
        },
      });

      expect(response.response.status).toBe(404);
    });

    testWithApp('returns ancillary data when requested', async ({ client }) => {
      const email = `anc-${Date.now()}@example.com`;
      await client.POST('/identity/individuals', {
        body: {
          identifiers: [
            { namespace: 'consumer-email', identifier: email },
            { namespace: 'individual-name', identifier: 'Doe|Jane' },
          ],
          biological_sex: 'female',
        },
      });

      const response = await client.GET('/identity/individuals/{namespace}/{identifier}', {
        params: {
          path: { namespace: 'consumer-email', identifier: email },
          query: {
            identifier_namespaces: ['consumer-email', 'individual-name'],
            fields: ['biological_sex'],
            tags: true,
            groups: true,
          },
        },
      });

      expect(response.response.status).toBe(200);
      expect(response.data?.items?.[0]?.biological_sex).toBe('female');

      const identifiers = response.data?.items?.[0]?.identifiers;
      expect(identifiers).toBeDefined();
      const namespaces = identifiers?.map((id) => id.identifier_namespace);
      expect(namespaces).toContain('consumer-email');
      expect(namespaces).toContain('individual-name');
    });
  });

  describe('PATCH /identity/individuals/{namespace}/{identifier}', () => {
    testWithApp('updates birthdate and biological_sex', async ({ client }) => {
      const email = `patch-fields-${Date.now()}@example.com`;
      const created = await client.POST('/identity/individuals', {
        body: {
          identifiers: [{ namespace: 'consumer-email', identifier: email }],
        },
      });
      const uuid = getUuid(created);

      const patchResponse = await client.PATCH('/identity/individuals/{namespace}/{identifier}', {
        params: { path: { namespace: 'consumer-email', identifier: email } },
        body: {
          birthdate: '1992-08-25',
          biological_sex: 'male',
        },
      });

      expect(patchResponse.response.status).toBe(200);
      expect(patchResponse.data?.individual_uuid).toBe(uuid);

      // Verify via GET
      const getResponse = await client.GET('/identity/individuals/{namespace}/{identifier}', {
        params: {
          path: { namespace: 'consumer-email', identifier: email },
          query: { fields: ['birthdate', 'biological_sex'] },
        },
      });
      expect(getResponse.data?.items?.[0]?.birthdate).toBe('1992-08-25');
      expect(getResponse.data?.items?.[0]?.biological_sex).toBe('male');
    });

    testWithApp('assigns new identifiers', async ({ client }) => {
      const email = `patch-id-${Date.now()}@example.com`;
      const phone = `1555${String(Date.now()).slice(-7)}`;

      await client.POST('/identity/individuals', {
        body: {
          identifiers: [{ namespace: 'consumer-email', identifier: email }],
        },
      });

      // PATCH to add a phone identifier
      await client.PATCH('/identity/individuals/{namespace}/{identifier}', {
        params: { path: { namespace: 'consumer-email', identifier: email } },
        body: {
          identifiers: [{ namespace: 'phone', identifier: phone }],
        },
      });

      // Verify by looking up the individual by phone
      const byPhone = await client.GET('/identity/individuals/{namespace}/{identifier}', {
        params: { path: { namespace: 'phone', identifier: phone } },
      });
      expect(byPhone.response.status).toBe(200);
      expect(byPhone.data?.items).toHaveLength(1);
    });

    testWithApp('updates profiles via JSON patch', async ({ app, client }) => {
      await app.locals.db
        .insertInto('profile_schemas')
        .values({ name: 'test-profile' })
        .onConflict((oc) => oc.column('name').doNothing())
        .execute();

      const email = `patch-profile-${Date.now()}@example.com`;
      await client.POST('/identity/individuals', {
        body: {
          identifiers: [{ namespace: 'consumer-email', identifier: email }],
        },
      });

      const patchResponse = await client.PATCH('/identity/individuals/{namespace}/{identifier}', {
        params: { path: { namespace: 'consumer-email', identifier: email } },
        body: {
          profiles: [
            {
              name: 'test-profile',
              patch: [{ op: 'add', path: '/greeting', value: { text: 'hello' } }],
            },
          ],
        },
      });

      expect(patchResponse.response.status).toBe(200);
      expect(patchResponse.data?.profiles).toBeDefined();
      expect(patchResponse.data?.profiles).toHaveLength(1);
      expect(patchResponse.data?.profiles?.[0]?.name).toBe('test-profile');
      expect(patchResponse.data?.profiles?.[0]?.profile).toBeDefined();
    });

    testWithApp('adds and removes tags', async ({ client }) => {
      const email = `patch-tags-${Date.now()}@example.com`;
      const created = await client.POST('/identity/individuals', {
        body: {
          identifiers: [{ namespace: 'consumer-email', identifier: email }],
        },
      });
      getUuid(created);

      // Add a tag
      await client.PATCH('/identity/individuals/{namespace}/{identifier}', {
        params: { path: { namespace: 'consumer-email', identifier: email } },
        body: {
          tags: [{ value: 'vip', operation: 'add' as const }],
        },
      });

      // Verify tag is present
      const withTag = await client.GET('/identity/individuals/{namespace}/{identifier}', {
        params: {
          path: { namespace: 'consumer-email', identifier: email },
          query: { tags: true },
        },
      });
      expect(withTag.data?.items?.[0]).toEqual(
        expect.objectContaining({
          tags: expect.arrayContaining([expect.objectContaining({ value: 'vip' })]),
        }),
      );

      // Remove the tag
      await client.PATCH('/identity/individuals/{namespace}/{identifier}', {
        params: { path: { namespace: 'consumer-email', identifier: email } },
        body: {
          tags: [{ value: 'vip', operation: 'remove' as const }],
        },
      });

      // Verify tag is gone
      const withoutTag = await client.GET('/identity/individuals/{namespace}/{identifier}', {
        params: {
          path: { namespace: 'consumer-email', identifier: email },
          query: { tags: true },
        },
      });
      expect(withoutTag.data?.items?.[0]).not.toEqual(
        expect.objectContaining({
          tags: expect.arrayContaining([expect.objectContaining({ value: 'vip' })]),
        }),
      );
    });

    testWithApp('returns 404 for non-existent identifier', async ({ client }) => {
      const response = await client.PATCH('/identity/individuals/{namespace}/{identifier}', {
        params: {
          path: {
            namespace: 'consumer-email',
            identifier: 'nonexistent@example.com',
          },
        },
        body: { birthdate: '2000-01-01' },
      });

      expect(response.response.status).toBe(404);
    });

    testWithApp('adds and removes group memberships', async ({ client }) => {
      const email = `patch-groups-${Date.now()}@example.com`;
      await client.POST('/identity/individuals', {
        body: {
          identifiers: [{ namespace: 'consumer-email', identifier: email }],
        },
      });

      // Create a group first
      const groupName = ['test', `ind-patch-${Date.now()}`];
      await client.POST('/identity/groups', {
        body: { name: groupName, group_type: TEST_GROUP_TYPE },
      });

      // Add group via individual PATCH
      await client.PATCH('/identity/individuals/{namespace}/{identifier}', {
        params: { path: { namespace: 'consumer-email', identifier: email } },
        body: {
          groups: [{ name: groupName, operation: 'add' as const }],
        },
      });

      // Verify group membership via GET
      const withGroup = await client.GET('/identity/individuals/{namespace}/{identifier}', {
        params: {
          path: { namespace: 'consumer-email', identifier: email },
          query: { groups: true },
        },
      });
      const groups = withGroup.data?.items?.[0]?.groups;
      expect(groups).toBeDefined();
      expect(groups?.some((g) => g.name?.join('.') === groupName.join('.'))).toBe(true);

      // Remove group via individual PATCH
      await client.PATCH('/identity/individuals/{namespace}/{identifier}', {
        params: { path: { namespace: 'consumer-email', identifier: email } },
        body: {
          groups: [{ name: groupName, operation: 'remove' as const }],
        },
      });

      // Verify group membership is gone
      const withoutGroup = await client.GET('/identity/individuals/{namespace}/{identifier}', {
        params: {
          path: { namespace: 'consumer-email', identifier: email },
          query: { groups: true },
        },
      });
      const groups2 = withoutGroup.data?.items?.[0]?.groups;
      expect(groups2?.length ?? 0).toBe(0);
    });
  });
});
