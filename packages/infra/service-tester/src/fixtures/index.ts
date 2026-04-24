import type { JTMConfigurationSchema, JTMServiceLocals } from '@justtellme/service';
import type { ServiceUnderTest } from '@openapi-typescript-infra/service-tester';
import { getReusableApp } from '@openapi-typescript-infra/service-tester';
import openapiCreateClient from 'openapi-fetch';
import type { TestAPI } from 'vitest';
import { expect, test } from 'vitest';

type AnyJTMServiceLocals = JTMServiceLocals<JTMConfigurationSchema>;

export type PathSpec = object;

export interface ServiceUnderTestFixtures<
  SLocals extends AnyJTMServiceLocals = JTMServiceLocals<JTMConfigurationSchema>,
  Paths extends PathSpec = PathSpec,
> {
  app: ServiceUnderTest<SLocals>;
  client: ReturnType<typeof createClient<SLocals, Paths>>;
  locals: SLocals;
}

// biome-ignore lint/suspicious/noExplicitAny: vitest fixture types require any
type FixtureType = Record<string, any>;

type Fixtures<F extends FixtureType> = Parameters<typeof test.extend<F>>[0];
type Use<T> = (value: T) => Promise<void>;

function getApp<SLocals extends AnyJTMServiceLocals = JTMServiceLocals<JTMConfigurationSchema>>() {
  return getReusableApp<SLocals>();
}

export function createClient<
  SLocals extends AnyJTMServiceLocals = JTMServiceLocals<JTMConfigurationSchema>,
  Paths extends PathSpec = PathSpec,
>(app: ServiceUnderTest<SLocals>) {
  return openapiCreateClient<Paths>({
    baseUrl: `http://localhost:${app.locals.config.server.port}`,
  });
}

function extendServiceTest<
  SLocals extends AnyJTMServiceLocals = JTMServiceLocals<JTMConfigurationSchema>,
  Paths extends PathSpec = PathSpec,
>(fixtures?: Fixtures<Record<string, never>>): TestAPI<ServiceUnderTestFixtures<SLocals, Paths>>;
function extendServiceTest<
  SLocals extends AnyJTMServiceLocals = JTMServiceLocals<JTMConfigurationSchema>,
  Paths extends PathSpec = PathSpec,
  AdditionalFixtures extends FixtureType = FixtureType,
>(
  fixtures: Fixtures<AdditionalFixtures>,
): TestAPI<ServiceUnderTestFixtures<SLocals, Paths> & AdditionalFixtures>;
function extendServiceTest<
  SLocals extends AnyJTMServiceLocals = JTMServiceLocals<JTMConfigurationSchema>,
  Paths extends PathSpec = PathSpec,
  AdditionalFixtures extends FixtureType = FixtureType,
>(
  fixtures: Fixtures<AdditionalFixtures> = {} as unknown as Fixtures<AdditionalFixtures>,
): TestAPI<ServiceUnderTestFixtures<SLocals, Paths> & AdditionalFixtures> {
  const fixturesWithAppLocals = {
    app: async (_: object, use: Use<ServiceUnderTest<SLocals>>) => {
      const testApp = await getApp<SLocals>();
      expect(testApp).toBeTruthy();
      await use(testApp as ServiceUnderTest<SLocals>);
    },
    locals: async (_: object, use: Use<SLocals>) => {
      const testApp = await getApp<SLocals>();
      expect(testApp).toBeTruthy();
      await use(testApp.locals as SLocals);
    },
    client: async (
      _: object,
      use: Use<ReturnType<typeof createClient<SLocals, Paths>>>,
    ) => {
      const testApp = await getApp<SLocals>();
      expect(testApp).toBeTruthy();
      const client = createClient<SLocals, Paths>(testApp);
      await use(client);
    },
    ...fixtures,
  };

  return test.extend<ServiceUnderTestFixtures<SLocals, Paths> & AdditionalFixtures>(
    fixturesWithAppLocals as Fixtures<
      ServiceUnderTestFixtures<SLocals, Paths> & AdditionalFixtures
    >,
  );
}

export const serviceTest = {
  extend: extendServiceTest,
};
